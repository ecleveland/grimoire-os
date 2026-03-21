'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { toast } from 'sonner';
import type { Campaign, Note, Encounter } from '@/lib/types';

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  paused: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  completed: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
};

type Tab = 'overview' | 'notes' | 'encounters';

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [inviteCode, setInviteCode] = useState<string | null>(null);

  const isOwner = campaign && user && campaign.ownerId === user.userId;

  useEffect(() => {
    apiFetch<Campaign>(`/campaigns/${id}`)
      .then((c) => {
        setCampaign(c);
        if (c.inviteCode) setInviteCode(c.inviteCode);
      })
      .catch(() => toast.error('Failed to load campaign'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (tab === 'notes') {
      apiFetch<Note[]>(`/notes?campaignId=${id}`)
        .then(setNotes)
        .catch((err) => {
          console.error('Failed to load notes:', err);
          toast.error('Failed to load notes');
        });
    }
    if (tab === 'encounters') {
      apiFetch<Encounter[]>(`/encounters?campaignId=${id}`)
        .then(setEncounters)
        .catch((err) => {
          console.error('Failed to load encounters:', err);
          toast.error('Failed to load encounters');
        });
    }
  }, [tab, id]);

  const generateInviteCode = async () => {
    try {
      const res = await apiFetch<{ inviteCode: string }>(`/campaigns/${id}/invite`, { method: 'POST' });
      setInviteCode(res.inviteCode);
      toast.success('Invite code generated!');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate invite code');
    }
  };

  if (loading) return <div className="text-gray-500 dark:text-gray-400">Loading...</div>;
  if (!campaign) return <div className="text-gray-500 dark:text-gray-400">Campaign not found.</div>;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'notes', label: 'Notes' },
    { key: 'encounters', label: 'Encounters' },
  ];

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{campaign.name}</h1>
          <div className="flex items-center gap-3 mt-2">
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusColors[campaign.status] || ''}`}>
              {campaign.status}
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {campaign.playerIds.length} player{campaign.playerIds.length !== 1 ? 's' : ''}
            </span>
            {campaign.currentSession != null && (
              <span className="text-sm text-gray-500 dark:text-gray-400">Session {campaign.currentSession}</span>
            )}
          </div>
        </div>
        {isOwner && (
          <Link
            href={`/campaigns/${id}/edit`}
            className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
          >
            Edit
          </Link>
        )}
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
            </div>
          ) : (
            <button
              onClick={generateInviteCode}
              className="px-3 py-1 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Generate Invite Code
            </button>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <nav className="flex gap-6">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
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
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Campaign Details</h2>
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
          {notes.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">No notes yet.</p>
          ) : (
            <div className="space-y-3">
              {notes.map((n) => (
                <Link
                  key={n.id}
                  href={`/campaigns/${id}/notes/${n.id}`}
                  className="block p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-indigo-500 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-gray-900 dark:text-white">{n.title}</h3>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                      {n.visibility}
                    </span>
                  </div>
                  {n.tags.length > 0 && (
                    <div className="flex gap-1 mt-2">
                      {n.tags.map((t) => (
                        <span key={t} className="text-xs px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'encounters' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Encounters</h2>
            <Link
              href={`/campaigns/${id}/encounters/new`}
              className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              New Encounter
            </Link>
          </div>
          {encounters.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">No encounters yet.</p>
          ) : (
            <div className="space-y-3">
              {encounters.map((enc) => (
                <Link
                  key={enc.id}
                  href={`/campaigns/${id}/encounters/${enc.id}`}
                  className="block p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-indigo-500 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-gray-900 dark:text-white">{enc.name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${enc.isActive ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'}`}>
                      {enc.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {enc.combatants.length} combatant{enc.combatants.length !== 1 ? 's' : ''} &middot; Round {enc.round}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
