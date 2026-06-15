'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { useApiQuery } from '@/lib/query';
import { toast } from 'sonner';
import type { Character, CampaignListItem, PaginatedResponse } from '@/lib/types';
import FormField from '@/components/FormField';
import CharacterEditorForm, {
  characterFormPayload,
  emptyCharacterFormValues,
  type CharacterFormValues,
} from '@/components/CharacterEditorForm';

// The backend rejects `limit` > 100 (PaginationDto `@Max(100)`); one page is
// plenty to populate this optional single-select picker.
const CAMPAIGN_PICKER_LIMIT = 100;

export default function NewCharacterPage() {
  const router = useRouter();
  const [campaignId, setCampaignId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const campaignsQuery = useApiQuery<PaginatedResponse<CampaignListItem>>(
    `/campaigns?page=1&limit=${CAMPAIGN_PICKER_LIMIT}`,
    {
      errorToast:
        'Could not load your campaigns — you can add this character to one later from its sheet.',
    }
  );
  const campaigns = campaignsQuery.data?.data ?? [];

  const handleSubmit = async (values: CharacterFormValues) => {
    setSubmitting(true);
    try {
      const character = await apiFetch<Character>('/characters', {
        method: 'POST',
        body: JSON.stringify({
          ...characterFormPayload(values),
          ...(campaignId ? { campaignId } : {}),
        }),
      });
      toast.success('Character created!');
      router.push(`/characters/${character.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create character');
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Create Character</h1>
      <CharacterEditorForm
        initialValues={emptyCharacterFormValues()}
        submitLabel="Create Character"
        submitting={submitting}
        onSubmit={handleSubmit}
        onCancel={() => router.back()}
        identityExtra={
          campaigns.length > 0 ? (
            <FormField
              as="select"
              label="Campaign"
              helperText="Optionally add this character to one of your campaigns."
              value={campaignId}
              onChange={e => setCampaignId(e.target.value)}
            >
              <option value="">None</option>
              {campaigns.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </FormField>
          ) : undefined
        }
      />
    </div>
  );
}
