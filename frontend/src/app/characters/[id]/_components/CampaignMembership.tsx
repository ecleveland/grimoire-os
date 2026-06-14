'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { useApiQuery, useApiMutation, apiQueryKey } from '@/lib/query';
import type { Campaign, CampaignListItem, Character, PaginatedResponse } from '@/lib/types';

// The picker lists the caller's campaigns in a single page. The backend caps
// `limit` at 100 (PaginationDto); a player in >100 campaigns is not a realistic
// case for this single-select control, and slice 3 owns richer roster tooling.
const CAMPAIGN_PICKER_LIMIT = 100;

interface CampaignMembershipProps {
  character: Character;
  isOwner: boolean;
}

export default function CampaignMembership({ character, isOwner }: CampaignMembershipProps) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState('');

  // Only the owner picks a campaign to attach to, and we only need the list to
  // resolve the attached campaign's name — skip the fetch otherwise.
  const needsCampaigns = isOwner || !!character.campaignId;
  const campaignsQuery = useApiQuery<PaginatedResponse<CampaignListItem>>(
    `/campaigns?page=1&limit=${CAMPAIGN_PICKER_LIMIT}`,
    { enabled: needsCampaigns }
  );
  const campaigns = campaignsQuery.data?.data ?? [];

  const attach = useApiMutation(
    (campaignId: string) =>
      apiFetch<Campaign>(`/campaigns/${campaignId}/characters/${character.id}`, { method: 'POST' }),
    {
      onSuccess: () => {
        toast.success('Added to campaign!');
        // Refetch the character so the sheet reflects its new campaign.
        queryClient.invalidateQueries({ queryKey: apiQueryKey(`/characters/${character.id}`) });
      },
      onError: err => {
        console.error('Failed to add character to campaign:', err);
        toast.error(err instanceof Error ? err.message : 'Failed to add to campaign');
      },
    }
  );

  // Already attached: show the campaign (linked). Detach is owner-only and lives
  // on the campaign roster (slice 3), so there's no player-facing detach here.
  if (character.campaignId) {
    const current = campaigns.find(c => c.id === character.campaignId);
    return (
      <div data-testid="campaign-membership">
        <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
          Campaign
        </div>
        <Link
          href={`/campaigns/${character.campaignId}`}
          className="text-sm text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
        >
          {current?.name ?? 'View campaign'}
        </Link>
      </div>
    );
  }

  // Unattached: only the owner can attach their character.
  if (!isOwner) return null;

  if (!campaignsQuery.isPending && campaigns.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        <Link
          href="/campaigns/join"
          className="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
        >
          Join a campaign
        </Link>{' '}
        to add this character to it.
      </p>
    );
  }

  const handleAttach = () => {
    if (!selected || attach.isPending) return;
    attach.mutate(selected);
  };

  return (
    <div className="flex items-end gap-2">
      <div>
        <label
          htmlFor="attach-campaign"
          className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1"
        >
          Add to campaign
        </label>
        <select
          id="attach-campaign"
          value={selected}
          onChange={e => setSelected(e.target.value)}
          className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        >
          <option value="">Select a campaign…</option>
          {campaigns.map(c => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        onClick={handleAttach}
        disabled={!selected || attach.isPending}
        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {attach.isPending ? 'Adding…' : 'Add to campaign'}
      </button>
    </div>
  );
}
