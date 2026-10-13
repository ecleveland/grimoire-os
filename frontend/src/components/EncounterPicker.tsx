'use client';

import { useState } from 'react';
import { useApiQuery } from '@/lib/query';
import type { CampaignListItem, EncounterListItem, PaginatedResponse } from '@/lib/types';

interface Props {
  /** Called with the chosen encounter's id once the DM confirms the picker. */
  onSelect: (encounterId: string) => void;
  onCancel: () => void;
}

const LIMIT = 100;

/**
 * Campaign → encounter chooser for the SRD-page "Add to encounter" entry point
 * (VEG-260), where there is no ambient encounter. Lists the DM's campaigns, then
 * the encounters within the chosen one. The encounter tracker entry point skips
 * this entirely since it already knows its encounter.
 */
export default function EncounterPicker({ onSelect, onCancel }: Props) {
  const [campaignId, setCampaignId] = useState('');
  const [encounterId, setEncounterId] = useState('');

  const campaigns = useApiQuery<PaginatedResponse<CampaignListItem>>(
    `/campaigns?page=1&limit=${LIMIT}`,
    { errorToast: 'Failed to load campaigns' }
  );
  const encounterParams = new URLSearchParams({ campaignId, page: '1', limit: String(LIMIT) });
  const encounters = useApiQuery<PaginatedResponse<EncounterListItem>>(
    `/encounters?${encounterParams}`,
    { enabled: campaignId !== '', errorToast: 'Failed to load encounters' }
  );
  const campaignRows = campaigns.data?.data ?? [];
  const encounterRows = campaignId ? (encounters.data?.data ?? []) : [];

  const selectClass =
    'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent';

  const noCampaigns = campaigns.isSuccess && campaignRows.length === 0;

  return (
    <div data-testid="encounter-picker" className="space-y-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Choose the campaign and encounter to add this monster to.
      </p>

      {noCampaigns ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No campaigns yet. Create a campaign and an encounter first.
        </p>
      ) : (
        <>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">
              Campaign
            </span>
            <select
              aria-label="Campaign"
              value={campaignId}
              onChange={e => {
                // An encounter belongs to one campaign, so a new campaign
                // drops the old pick.
                setCampaignId(e.target.value);
                setEncounterId('');
              }}
              className={selectClass}
            >
              <option value="">Select a campaign…</option>
              {campaignRows.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          {campaignId &&
            (encounters.isSuccess && encounterRows.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No encounters in this campaign yet.
              </p>
            ) : (
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">
                  Encounter
                </span>
                <select
                  aria-label="Encounter"
                  value={encounterId}
                  onChange={e => setEncounterId(e.target.value)}
                  className={selectClass}
                >
                  <option value="">Select an encounter…</option>
                  {encounterRows.map(e => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
        </>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSelect(encounterId)}
          disabled={!encounterId}
          className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
