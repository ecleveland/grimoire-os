'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
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
  const [campaigns, setCampaigns] = useState<CampaignListItem[]>([]);
  const [campaignsLoaded, setCampaignsLoaded] = useState(false);
  const [campaignId, setCampaignId] = useState('');
  const [encounters, setEncounters] = useState<EncounterListItem[]>([]);
  const [encountersLoaded, setEncountersLoaded] = useState(false);
  const [encounterId, setEncounterId] = useState('');

  useEffect(() => {
    apiFetch<PaginatedResponse<CampaignListItem>>(`/campaigns?page=1&limit=${LIMIT}`)
      .then(res => setCampaigns(res.data))
      .catch(() => toast.error('Failed to load campaigns'))
      .finally(() => setCampaignsLoaded(true));
  }, []);

  useEffect(() => {
    if (!campaignId) {
      setEncounters([]);
      setEncountersLoaded(false);
      return;
    }
    setEncounterId('');
    setEncountersLoaded(false);
    const params = new URLSearchParams({ campaignId, page: '1', limit: String(LIMIT) });
    apiFetch<PaginatedResponse<EncounterListItem>>(`/encounters?${params.toString()}`)
      .then(res => setEncounters(res.data))
      .catch(() => toast.error('Failed to load encounters'))
      .finally(() => setEncountersLoaded(true));
  }, [campaignId]);

  const selectClass =
    'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent';

  const noCampaigns = campaignsLoaded && campaigns.length === 0;

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
              onChange={e => setCampaignId(e.target.value)}
              className={selectClass}
            >
              <option value="">Select a campaign…</option>
              {campaigns.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          {campaignId &&
            (encountersLoaded && encounters.length === 0 ? (
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
                  {encounters.map(e => (
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
