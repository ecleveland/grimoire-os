'use client';

import { useId, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { invalidateApiPath, useApiMutation, useApiQuery } from '@/lib/query';
import Modal from '@/components/Modal';
import type { CampaignListItem, Character, PaginatedResponse } from '@/lib/types';
import { rememberCopiedFrom } from './copied-from';

interface PlayCopyDialogProps {
  characterId: string;
  characterName: string;
  snapshot: { id: string; level: number };
  onClose: () => void;
}

interface CopyBody {
  name?: string;
  campaignId?: string;
}

// The backend rejects `limit` over 100, and one page is plenty for a picker.
const CAMPAIGNS_PATH = '/campaigns?page=1&limit=100';

const fieldLabelClass = 'block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1';
const fieldClass =
  'w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50';

/**
 * Creates a new character from one of this character's snapshots and opens it.
 * The copy starts at the snapshot's level with everything restored, and the
 * original character and its snapshots stay as they are. The new sheet shows
 * a one-time note naming where it came from.
 */
export default function PlayCopyDialog({
  characterId,
  characterName,
  snapshot,
  onClose,
}: PlayCopyDialogProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const nameInputId = useId();
  const campaignSelectId = useId();
  const [name, setName] = useState(`${characterName} (level ${snapshot.level})`);
  const [campaignId, setCampaignId] = useState('');

  const campaignsQuery = useApiQuery<PaginatedResponse<CampaignListItem>>(CAMPAIGNS_PATH, {
    errorToast: 'Failed to load your campaigns',
  });
  const campaigns = campaignsQuery.data?.data ?? [];

  const copy = useApiMutation<Character, CopyBody>(
    body =>
      apiFetch<Character>(`/characters/${characterId}/snapshots/${snapshot.id}/copy`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    {
      onSuccess: created => {
        toast.success(`Created ${created.name}`);
        rememberCopiedFrom(created.id, { name: characterName, level: snapshot.level });
        // Best-effort: a failed refetch must not surface as an unobserved rejection.
        invalidateApiPath(queryClient, '/characters?').catch(err =>
          console.error('Failed to refetch characters after a copy:', err)
        );
        onClose();
        router.push(`/characters/${created.id}`);
      },
      onError: err => {
        console.error('Failed to create the copy:', err);
        toast.error(err instanceof Error ? err.message : 'Failed to create the copy');
      },
    }
  );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (copy.isPending) return;
    const trimmed = name.trim();
    copy.mutate({
      ...(trimmed ? { name: trimmed } : {}),
      ...(campaignId ? { campaignId } : {}),
    });
  };

  return (
    <Modal open onClose={onClose} label="Play a copy" testId="play-copy-dialog">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Play a copy</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            A fresh character at level {snapshot.level}. Hit points, slots and resources start full.
            The original is untouched.
          </p>
        </div>
        <div>
          <label htmlFor={nameInputId} className={fieldLabelClass}>
            Name
          </label>
          <input
            id={nameInputId}
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={100}
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor={campaignSelectId} className={fieldLabelClass}>
            Campaign
          </label>
          <select
            id={campaignSelectId}
            value={campaignId}
            onChange={e => setCampaignId(e.target.value)}
            disabled={campaignsQuery.isPending}
            className={fieldClass}
          >
            <option value="">No campaign</option>
            {campaigns.map(campaign => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={copy.isPending}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Create
          </button>
        </div>
      </form>
    </Modal>
  );
}
