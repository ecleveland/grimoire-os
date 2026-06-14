'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { useApiMutation, invalidateApiPath } from '@/lib/query';
import FormField from '@/components/FormField';
import type { Campaign } from '@/lib/types';

export default function JoinCampaignPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');

  const join = useApiMutation(
    (inviteCode: string) =>
      apiFetch<Campaign>(`/campaigns/join/${encodeURIComponent(inviteCode)}`, { method: 'POST' }),
    {
      onSuccess: campaign => {
        toast.success(`Joined ${campaign.name}!`);
        router.push(`/campaigns/${campaign.id}`);
        // Cache refresh is best-effort — it runs *after* the toast/navigate above
        // so a failed refetch can never strand a user who already joined. The
        // campaigns list page isn't on react-query yet, so this currently matches
        // nothing; it's wired ahead of that migration. The trailing `?` keeps the
        // prefix from also matching `/campaigns/<id>` detail keys.
        invalidateApiPath(queryClient, '/campaigns?').catch(err =>
          console.error('Failed to invalidate campaigns list after join:', err)
        );
      },
      onError: err => {
        console.error('Failed to join campaign via invite code:', err);
        toast.error(err instanceof Error ? err.message : 'Failed to join campaign');
      },
    }
  );

  const trimmed = code.trim();

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!trimmed || join.isPending) return;
    join.mutate(trimmed);
  };

  return (
    <div className="max-w-md">
      <div className="mb-6">
        <Link
          href="/campaigns"
          className="text-sm text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
        >
          ← Back to campaigns
        </Link>
      </div>
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Join a campaign</h1>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Paste the invite code your DM shared with you to join their campaign.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField
          label="Invite code"
          type="text"
          value={code}
          onChange={e => setCode(e.target.value)}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="e.g. 3f9a2c…"
        />
        <button
          type="submit"
          disabled={!trimmed || join.isPending}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {join.isPending ? 'Joining…' : 'Join Campaign'}
        </button>
      </form>
    </div>
  );
}
