'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useApiQuery, useApiMutation, invalidateApiPath, apiQueryKey } from '@/lib/query';
import { useAuth } from '@/lib/auth-context';
import { toast } from 'sonner';
import Pagination from '@/components/Pagination';
import Badge from '@/components/Badge';
import ConfirmDialog from '@/components/ConfirmDialog';
import { shopVisuals, visibleShops } from '@/lib/shop-display';
import type {
  Campaign,
  NoteListItem,
  EncounterListItem,
  NpcListItem,
  ShopListItem,
  PartyCharacter,
  PaginatedResponse,
  InviteCodeResponse,
} from '@/lib/types';

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  paused: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  completed: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
};

type Tab = 'overview' | 'roster' | 'notes' | 'encounters' | 'npcs' | 'shops';

const LIMIT = 20;

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>('overview');
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [notesPage, setNotesPage] = useState(1);
  const [encountersPage, setEncountersPage] = useState(1);
  const [encounterToDelete, setEncounterToDelete] = useState<EncounterListItem | null>(null);
  const [characterToDetach, setCharacterToDetach] = useState<PartyCharacter | null>(null);
  const [characterToAttach, setCharacterToAttach] = useState('');
  const encountersHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const rosterHeadingRef = useRef<HTMLHeadingElement | null>(null);

  const campaignQuery = useApiQuery<Campaign>(`/campaigns/${id}`, {
    errorToast: { message: 'Failed to load campaign', id: 'load-campaign' },
  });
  const campaign = campaignQuery.data ?? null;
  const isOwner = campaign && user && campaign.ownerId === user.userId;
  // A positively-known non-owner member (the page only loads for members). Gated
  // on `user` being hydrated so the destructive Leave control is never shown to
  // the real owner during the auth-loading race (when `isOwner` is still falsy).
  const canLeave = Boolean(campaign && user && campaign.ownerId !== user.userId);
  // The campaign cache is the single source of truth for the invite code;
  // generate/revoke write it back via setQueryData (below) so it can't go stale
  // and resurface a revoked code on a cached remount.
  const inviteCode = campaign?.inviteCode ?? null;

  // Tab list reads. Each is gated on its tab being active (no fetch until the
  // user opens it) and carries `isLoading`, so the empty state no longer flashes
  // while the request is still in flight.
  const notesQuery = useApiQuery<PaginatedResponse<NoteListItem>>(
    `/notes?campaignId=${id}&page=${notesPage}&limit=${LIMIT}`,
    { enabled: tab === 'notes', errorToast: { message: 'Failed to load notes', id: 'load-notes' } }
  );
  const encountersQuery = useApiQuery<PaginatedResponse<EncounterListItem>>(
    `/encounters?campaignId=${id}&page=${encountersPage}&limit=${LIMIT}`,
    {
      enabled: tab === 'encounters',
      errorToast: { message: 'Failed to load encounters', id: 'load-encounters' },
    }
  );
  const npcsQuery = useApiQuery<PaginatedResponse<NpcListItem>>(
    `/npcs?campaignId=${id}&page=1&limit=3`,
    { enabled: tab === 'npcs', errorToast: { message: 'Failed to load NPCs', id: 'load-npcs' } }
  );
  const shopsQuery = useApiQuery<PaginatedResponse<ShopListItem>>(
    `/shops?campaignId=${id}&page=1&limit=6`,
    { enabled: tab === 'shops', errorToast: { message: 'Failed to load shops', id: 'load-shops' } }
  );
  const rosterQuery = useApiQuery<PartyCharacter[]>(`/campaigns/${id}/characters`, {
    enabled: tab === 'roster',
    errorToast: { message: 'Failed to load roster', id: 'load-roster' },
  });
  const roster = rosterQuery.data ?? [];
  // Owner-only: members' unattached characters the DM can attach on their behalf
  // (VEG-361). Gated on owner so non-owners never fetch or see the picker.
  const attachableQuery = useApiQuery<PartyCharacter[]>(`/campaigns/${id}/attachable-characters`, {
    enabled: tab === 'roster' && Boolean(isOwner),
    errorToast: { message: 'Failed to load attachable characters', id: 'load-attachable' },
  });
  const attachable = attachableQuery.data ?? [];

  const notes = notesQuery.data?.data ?? [];
  const notesTotal = notesQuery.data?.total ?? 0;
  const notesLastPage = notesQuery.data?.lastPage ?? 1;
  const encounters = encountersQuery.data?.data ?? [];
  const encountersTotal = encountersQuery.data?.total ?? 0;
  const encountersLastPage = encountersQuery.data?.lastPage ?? 1;
  const recentNpcs = npcsQuery.data?.data ?? [];
  const npcsTotal = npcsQuery.data?.total ?? 0;
  // Players only see open shops; the owner sees all (closed ones are badged).
  const visibleShopList = visibleShops(shopsQuery.data?.data ?? [], Boolean(isOwner));
  const shopsTotal = shopsQuery.data?.total ?? 0;

  // Self-heal: a fetched encounters page that comes back empty and out of range
  // (rows were deleted elsewhere) steps back to the real last page.
  useEffect(() => {
    const d = encountersQuery.data;
    if (
      tab === 'encounters' &&
      d &&
      d.data.length === 0 &&
      encountersPage > Math.max(1, d.lastPage)
    ) {
      setEncountersPage(Math.max(1, d.lastPage));
    }
  }, [encountersQuery.data, encountersPage, tab]);

  const handleTabChange = (newTab: Tab) => {
    if (newTab !== tab) {
      if (newTab === 'notes') setNotesPage(1);
      if (newTab === 'encounters') setEncountersPage(1);
      setTab(newTab);
    }
  };

  const setCachedInviteCode = (code: string | undefined) =>
    queryClient.setQueryData<Campaign>(apiQueryKey(`/campaigns/${id}`), prev =>
      prev ? { ...prev, inviteCode: code } : prev
    );

  const generateInvite = useApiMutation(
    () => apiFetch<InviteCodeResponse>(`/campaigns/${id}/invite-code`, { method: 'POST' }),
    {
      onSuccess: res => {
        setCachedInviteCode(res.inviteCode);
        toast.success('Invite code generated!');
      },
      onError: err =>
        toast.error(err instanceof Error ? err.message : 'Failed to generate invite code'),
    }
  );

  const revokeInvite = useApiMutation(
    () => apiFetch(`/campaigns/${id}/invite-code`, { method: 'DELETE' }),
    {
      onSuccess: () => {
        setCachedInviteCode(undefined);
        toast.success('Invite code revoked');
      },
      onError: err =>
        toast.error(err instanceof Error ? err.message : 'Failed to revoke invite code'),
    }
  );

  const deleteEncounter = useApiMutation(
    (enc: EncounterListItem) => apiFetch(`/encounters/${enc.id}`, { method: 'DELETE' }),
    {
      onSuccess: async () => {
        toast.success('Encounter deleted');
        // Clamp the page in case the last row of the final page went away, then
        // invalidate so the list re-syncs from the server rather than being
        // patched locally (keeps contents, total, and lastPage consistent).
        const lastPageAfterDelete = Math.max(1, Math.ceil((encountersTotal - 1) / LIMIT));
        setEncountersPage(p => Math.min(p, lastPageAfterDelete));
        // Trailing `&` bounds the prefix to this campaign's list keys
        // (`…campaignId=<id>&page=…`) so a sibling id can't be caught.
        await invalidateApiPath(queryClient, `/encounters?campaignId=${id}&`);
        // The row that held focus is about to unmount; if focus dropped to
        // <body>, land it somewhere stable — but never steal it from an element
        // the user has since moved to.
        if (document.activeElement === document.body) {
          encountersHeadingRef.current?.focus();
        }
      },
      onError: err =>
        toast.error(err instanceof Error ? err.message : 'Failed to delete encounter'),
    }
  );

  const detachCharacter = useApiMutation(
    (c: PartyCharacter) => apiFetch(`/campaigns/${id}/characters/${c.id}`, { method: 'DELETE' }),
    {
      onSuccess: async () => {
        toast.success('Character removed from campaign');
        // Re-sync the roster and the campaign (its characterIds count changes),
        // plus the attach picker — the detached character is now unattached, so
        // it should re-enter the owner's "add a member's character" list.
        await queryClient.invalidateQueries({
          queryKey: apiQueryKey(`/campaigns/${id}/characters`),
        });
        queryClient.invalidateQueries({ queryKey: apiQueryKey(`/campaigns/${id}`) });
        queryClient.invalidateQueries({
          queryKey: apiQueryKey(`/campaigns/${id}/attachable-characters`),
        });
        // The removed row is unmounting; if focus dropped to <body>, land it on
        // the roster heading rather than leaving it stranded.
        if (document.activeElement === document.body) {
          rosterHeadingRef.current?.focus();
        }
      },
      onError: err =>
        toast.error(err instanceof Error ? err.message : 'Failed to remove character'),
    }
  );

  const attachCharacter = useApiMutation(
    (characterId: string) =>
      apiFetch(`/campaigns/${id}/characters/${characterId}`, { method: 'POST' }),
    {
      onSuccess: async () => {
        toast.success('Character added to campaign');
        setCharacterToAttach('');
        // Re-sync the roster, the campaign (characterIds count), and the
        // attachable list (the just-added character should drop out of it).
        await queryClient.invalidateQueries({
          queryKey: apiQueryKey(`/campaigns/${id}/characters`),
        });
        queryClient.invalidateQueries({ queryKey: apiQueryKey(`/campaigns/${id}`) });
        queryClient.invalidateQueries({
          queryKey: apiQueryKey(`/campaigns/${id}/attachable-characters`),
        });
      },
      onError: err => toast.error(err instanceof Error ? err.message : 'Failed to add character'),
    }
  );

  const leaveCampaign = useApiMutation(
    () => apiFetch(`/campaigns/${id}/membership`, { method: 'DELETE' }),
    {
      onSuccess: () => {
        toast.success('You left the campaign');
        router.push('/campaigns');
        // Refresh the campaigns LIST only (`/campaigns?…`). Deliberately do NOT
        // invalidate this campaign's detail/roster queries — we've just left, so
        // a refetch would 403 and fire a spurious "Failed to load" toast; they're
        // left to be GC'd as the page unmounts.
        invalidateApiPath(queryClient, '/campaigns?');
      },
      onError: err => toast.error(err instanceof Error ? err.message : 'Failed to leave campaign'),
    }
  );

  if (campaignQuery.isPending)
    return <div className="text-gray-500 dark:text-gray-400">Loading...</div>;
  if (!campaign) return <div className="text-gray-500 dark:text-gray-400">Campaign not found.</div>;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'roster', label: 'Roster' },
    { key: 'notes', label: 'Notes' },
    { key: 'encounters', label: 'Encounters' },
    { key: 'npcs', label: 'NPCs' },
    { key: 'shops', label: 'Shops' },
  ];

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{campaign.name}</h1>
          <div className="flex items-center gap-3 mt-2">
            <span
              className={`px-2 py-1 text-xs font-medium rounded-full ${statusColors[campaign.status] || ''}`}
            >
              {campaign.status}
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {campaign.playerIds.length} player{campaign.playerIds.length !== 1 ? 's' : ''}
            </span>
            {campaign.currentSession != null && (
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Session {campaign.currentSession}
              </span>
            )}
          </div>
        </div>
        {isOwner ? (
          <Link
            href={`/campaigns/${id}/edit`}
            className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
          >
            Edit
          </Link>
        ) : canLeave ? (
          <button
            type="button"
            onClick={() => setConfirmingLeave(true)}
            disabled={leaveCampaign.isPending}
            className="px-4 py-2 text-sm border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 disabled:opacity-50 transition-colors"
          >
            Leave campaign
          </button>
        ) : null}
      </div>

      {campaign.description && (
        <p className="text-gray-600 dark:text-gray-400 mb-4">{campaign.description}</p>
      )}
      {campaign.setting && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          <span className="font-medium">Setting:</span> {campaign.setting}
        </p>
      )}

      {isOwner && (
        <div className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Invite Code</h3>
          {inviteCode ? (
            <div className="flex items-center gap-3">
              <code className="px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded text-sm font-mono text-gray-900 dark:text-white">
                {inviteCode}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(inviteCode);
                  toast.success('Copied!');
                }}
                className="text-sm text-indigo-600 hover:text-indigo-700"
              >
                Copy
              </button>
              <button
                onClick={() => revokeInvite.mutate()}
                disabled={revokeInvite.isPending}
                className="text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
              >
                Revoke
              </button>
            </div>
          ) : (
            <button
              onClick={() => generateInvite.mutate()}
              disabled={generateInvite.isPending}
              className="px-3 py-1 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              Generate Invite Code
            </button>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <nav className="flex gap-6">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => handleTabChange(t.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {tab === 'overview' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
            Campaign Details
          </h2>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Status</dt>
              <dd className="text-gray-900 dark:text-white capitalize">{campaign.status}</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Players</dt>
              <dd className="text-gray-900 dark:text-white">{campaign.playerIds.length}</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Characters</dt>
              <dd className="text-gray-900 dark:text-white">{campaign.characterIds.length}</dd>
            </div>
            {campaign.currentSession != null && (
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Current Session</dt>
                <dd className="text-gray-900 dark:text-white">{campaign.currentSession}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {tab === 'roster' && (
        <div>
          <h2
            ref={rosterHeadingRef}
            tabIndex={-1}
            className="text-lg font-semibold text-gray-900 dark:text-white mb-1 focus:outline-none"
          >
            Party Roster
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Characters attached to this campaign.{' '}
            {isOwner
              ? 'Add a member’s character below, or remove one to detach it.'
              : 'Add your own characters from their character sheet.'}
          </p>
          {isOwner &&
            (attachable.length > 0 ? (
              <div className="mb-4 flex items-end gap-2">
                <div>
                  <label
                    htmlFor="attach-character"
                    className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1"
                  >
                    Add a member&apos;s character
                  </label>
                  <select
                    id="attach-character"
                    value={characterToAttach}
                    onChange={e => setCharacterToAttach(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="">Select a character…</option>
                    {attachable.map(c => {
                      const meta = [c.race, c.class].filter(Boolean).join(' ');
                      return (
                        <option key={c.id} value={c.id}>
                          {c.name} (Lvl {c.level}
                          {meta && ` · ${meta}`})
                        </option>
                      );
                    })}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (characterToAttach) attachCharacter.mutate(characterToAttach);
                  }}
                  disabled={!characterToAttach || attachCharacter.isPending}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {attachCharacter.isPending ? 'Adding…' : 'Add'}
                </button>
              </div>
            ) : (
              // Only on a *successful* empty fetch — an errored load (toasted via
              // errorToast) must not masquerade as "nobody to add".
              attachableQuery.isSuccess && (
                <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
                  No member characters are available to add. Players join via an invite code, then
                  their unattached characters appear here.
                </p>
              )
            ))}
          {rosterQuery.isLoading ? (
            <p className="text-gray-500 dark:text-gray-400">Loading roster…</p>
          ) : roster.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">No characters in this campaign yet.</p>
          ) : (
            <div className="space-y-3">
              {roster.map(c => (
                <div key={c.id} className="flex items-stretch gap-2">
                  <Link
                    href={`/characters/${c.id}`}
                    className="flex-1 block p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-indigo-500 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-medium text-gray-900 dark:text-white">{c.name}</h3>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        Level {c.level}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {[c.race, c.class].filter(Boolean).join(' · ') || '—'}
                      {c.armorClass != null && <> &middot; AC {c.armorClass}</>}
                      {c.hitPoints && (
                        <>
                          {' '}
                          &middot; HP {c.hitPoints.current}/{c.hitPoints.max}
                        </>
                      )}
                    </p>
                  </Link>
                  {isOwner && (
                    <button
                      onClick={() => setCharacterToDetach(c)}
                      disabled={detachCharacter.isPending}
                      aria-label={`Remove ${c.name}`}
                      className="px-3 text-sm border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 disabled:opacity-50 transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'notes' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Notes</h2>
            <Link
              href={`/campaigns/${id}/notes/new`}
              className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              New Note
            </Link>
          </div>
          {notesQuery.isLoading ? (
            <p className="text-gray-500 dark:text-gray-400">Loading notes…</p>
          ) : notes.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">No notes yet.</p>
          ) : (
            <>
              <div className="space-y-3">
                {notes.map(n => (
                  <Link
                    key={n.id}
                    href={`/campaigns/${id}/notes/${n.id}`}
                    className="block p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-indigo-500 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium text-gray-900 dark:text-white">{n.title}</h3>
                      <Badge>{n.visibility}</Badge>
                    </div>
                    {n.tags.length > 0 && (
                      <div className="flex gap-1 mt-2">
                        {n.tags.map(t => (
                          <span
                            key={t}
                            className="text-xs px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </Link>
                ))}
              </div>
              <Pagination
                page={notesPage}
                lastPage={notesLastPage}
                total={notesTotal}
                limit={LIMIT}
                onPageChange={setNotesPage}
              />
            </>
          )}
        </div>
      )}

      {tab === 'npcs' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">NPCs</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {npcsTotal} total · showing {recentNpcs.length} most recent
              </p>
            </div>
            <div className="flex gap-2">
              <Link
                href={`/campaigns/${id}/npcs`}
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
              >
                View all
              </Link>
              <Link
                href={`/campaigns/${id}/npcs/new`}
                className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                New NPC
              </Link>
            </div>
          </div>
          {npcsQuery.isLoading ? (
            <p className="text-gray-500 dark:text-gray-400">Loading NPCs…</p>
          ) : recentNpcs.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">No NPCs yet.</p>
          ) : (
            <div className="space-y-3">
              {recentNpcs.map(npc => (
                <Link
                  key={npc.id}
                  href={`/campaigns/${id}/npcs/${npc.id}`}
                  className="block p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-indigo-500 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-medium text-gray-900 dark:text-white">{npc.name}</h3>
                    {npc.alignment && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                        {npc.alignment}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {npc.profession ? `${npc.race} · ${npc.profession}` : npc.race}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'shops' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Shops</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {isOwner ? `${shopsTotal} total` : 'Browse the campaign’s shops'}
              </p>
            </div>
            <div className="flex gap-2">
              <Link
                href={`/campaigns/${id}/shops`}
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
              >
                View all
              </Link>
              {isOwner && (
                <Link
                  href={`/campaigns/${id}/shops/new`}
                  className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  New Shop
                </Link>
              )}
            </div>
          </div>
          {shopsQuery.isLoading ? (
            <p className="text-gray-500 dark:text-gray-400">Loading shops…</p>
          ) : visibleShopList.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">No shops yet.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {visibleShopList.map(shop => {
                const { icon, accent } = shopVisuals(shop);
                return (
                  <Link
                    key={shop.id}
                    href={`/campaigns/${id}/shops/${shop.id}`}
                    style={{ borderLeftColor: accent }}
                    className="block p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 border-l-4 hover:border-indigo-500 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span aria-hidden className="text-xl">
                          {icon}
                        </span>
                        <h3 className="font-medium text-gray-900 dark:text-white truncate">
                          {shop.name}
                        </h3>
                      </div>
                      {isOwner && !shop.isOpen && <Badge variant="neutral">Closed</Badge>}
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 capitalize">
                      {shop.theme}
                    </p>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'encounters' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2
              ref={encountersHeadingRef}
              tabIndex={-1}
              className="text-lg font-semibold text-gray-900 dark:text-white focus:outline-none"
            >
              Encounters
            </h2>
            <Link
              href={`/campaigns/${id}/encounters/new`}
              className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              New Encounter
            </Link>
          </div>
          {encountersQuery.isLoading ? (
            <p className="text-gray-500 dark:text-gray-400">Loading encounters…</p>
          ) : encounters.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">No encounters yet.</p>
          ) : (
            <>
              <div className="space-y-3">
                {encounters.map(enc => (
                  <div key={enc.id} className="flex items-stretch gap-2">
                    <Link
                      href={`/campaigns/${id}/encounters/${enc.id}`}
                      className="flex-1 block p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-indigo-500 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <h3 className="font-medium text-gray-900 dark:text-white">{enc.name}</h3>
                        <Badge variant={enc.isActive ? 'success' : 'neutral'}>
                          {enc.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {enc.combatants.length} combatant{enc.combatants.length !== 1 ? 's' : ''}{' '}
                        &middot; Round {enc.round}
                      </p>
                    </Link>
                    {isOwner && (
                      <button
                        onClick={() => setEncounterToDelete(enc)}
                        disabled={deleteEncounter.isPending}
                        aria-label={`Delete ${enc.name}`}
                        className="px-3 text-sm border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 disabled:opacity-50 transition-colors"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <Pagination
                page={encountersPage}
                lastPage={encountersLastPage}
                total={encountersTotal}
                limit={LIMIT}
                onPageChange={setEncountersPage}
              />
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        open={encounterToDelete !== null}
        onOpenChange={open => {
          if (!open) setEncounterToDelete(null);
        }}
        title="Delete encounter?"
        description={`Delete "${encounterToDelete?.name ?? ''}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          if (encounterToDelete) deleteEncounter.mutate(encounterToDelete);
        }}
      />

      <ConfirmDialog
        open={characterToDetach !== null}
        onOpenChange={open => {
          if (!open) setCharacterToDetach(null);
        }}
        title="Remove character?"
        description={`Remove "${characterToDetach?.name ?? ''}" from this campaign? The character itself is kept — it's just detached.`}
        confirmLabel="Remove"
        variant="danger"
        onConfirm={() => {
          if (characterToDetach) detachCharacter.mutate(characterToDetach);
        }}
      />

      <ConfirmDialog
        open={confirmingLeave}
        onOpenChange={open => {
          if (!open) setConfirmingLeave(false);
        }}
        title="Leave campaign?"
        description="Leave this campaign? Your characters will be detached from it and your private notes here will be removed. This can't be undone."
        confirmLabel="Leave"
        variant="danger"
        onConfirm={() => leaveCampaign.mutate()}
      />
    </div>
  );
}
