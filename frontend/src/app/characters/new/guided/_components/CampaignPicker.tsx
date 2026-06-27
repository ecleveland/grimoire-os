'use client';

import { useApiQuery } from '@/lib/query';
import type { CampaignListItem, PaginatedResponse } from '@/lib/types';
import FormField from '@/components/FormField';

// The backend rejects `limit` > 100 (PaginationDto `@Max(100)`); one page is
// plenty to populate this optional single-select picker.
const CAMPAIGN_PICKER_LIMIT = 100;

interface CampaignPickerProps {
  value: string;
  onChange: (campaignId: string) => void;
}

/**
 * Optional campaign-attach control for the guided builder's Review step. Mirrors
 * the classic create form's picker (`characters/new/page.tsx`): the shell owns
 * the selected id and appends it to the create POST, because `campaignId` is
 * deliberately not part of `CharacterFormValues` (the page wrappers add it). The
 * service still member-gates the attach server-side, so a stale option is safe.
 *
 * Renders nothing until the user actually has a campaign to attach to, keeping the
 * Review step uncluttered for solo characters (and matching the classic form,
 * which only shows the picker when `campaigns.length > 0`).
 */
export default function CampaignPicker({ value, onChange }: CampaignPickerProps) {
  const campaignsQuery = useApiQuery<PaginatedResponse<CampaignListItem>>(
    `/campaigns?page=1&limit=${CAMPAIGN_PICKER_LIMIT}`,
    {
      errorToast:
        'Could not load your campaigns — you can add this character to one later from its sheet.',
    }
  );
  const campaigns = campaignsQuery.data?.data ?? [];
  if (campaigns.length === 0) return null;

  return (
    <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
      <FormField
        as="select"
        label="Campaign"
        helperText="Optionally add this character to one of your campaigns."
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        <option value="">None</option>
        {campaigns.map(c => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </FormField>
    </div>
  );
}
