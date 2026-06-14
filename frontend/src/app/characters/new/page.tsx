'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { useApiQuery } from '@/lib/query';
import { toast } from 'sonner';
import type { Character, AbilityScores, CampaignListItem, PaginatedResponse } from '@/lib/types';
import FormField from '@/components/FormField';

// The backend rejects `limit` > 100 (PaginationDto `@Max(100)`); one page is
// plenty to populate this optional single-select picker.
const CAMPAIGN_PICKER_LIMIT = 100;

const abilityKeys: (keyof AbilityScores)[] = [
  'strength',
  'dexterity',
  'constitution',
  'intelligence',
  'wisdom',
  'charisma',
];
const abilityLabels: Record<keyof AbilityScores, string> = {
  strength: 'STR',
  dexterity: 'DEX',
  constitution: 'CON',
  intelligence: 'INT',
  wisdom: 'WIS',
  charisma: 'CHA',
};

export default function NewCharacterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [race, setRace] = useState('');
  const [charClass, setCharClass] = useState('');
  const [level, setLevel] = useState(1);
  const [background, setBackground] = useState('');
  const [alignment, setAlignment] = useState('');
  const [abilityScores, setAbilityScores] = useState<AbilityScores>({
    strength: 10,
    dexterity: 10,
    constitution: 10,
    intelligence: 10,
    wisdom: 10,
    charisma: 10,
  });
  const [maxHp, setMaxHp] = useState(10);
  const [currentHp, setCurrentHp] = useState(10);
  const [armorClass, setArmorClass] = useState(10);
  const [speed, setSpeed] = useState(30);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const character = await apiFetch<Character>('/characters', {
        method: 'POST',
        body: JSON.stringify({
          name,
          race,
          class: charClass,
          level,
          background,
          alignment,
          abilityScores,
          hitPoints: { max: maxHp, current: currentHp, temporary: 0 },
          armorClass,
          speed,
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
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Basic Info</h2>
          <FormField
            label="Name"
            type="text"
            required
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-4">
            <FormField
              label="Race"
              type="text"
              value={race}
              onChange={e => setRace(e.target.value)}
            />
            <FormField
              label="Class"
              type="text"
              value={charClass}
              onChange={e => setCharClass(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <FormField
              label="Level"
              type="number"
              min={1}
              max={20}
              value={level}
              onChange={e => setLevel(Number(e.target.value))}
            />
            <FormField
              label="Background"
              type="text"
              value={background}
              onChange={e => setBackground(e.target.value)}
            />
            <FormField
              label="Alignment"
              type="text"
              value={alignment}
              onChange={e => setAlignment(e.target.value)}
            />
          </div>
          {campaigns.length > 0 && (
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
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Ability Scores
          </h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {abilityKeys.map(key => (
              <div key={key} className="text-center">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  {abilityLabels[key]}
                </label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={abilityScores[key]}
                  onChange={e =>
                    setAbilityScores(prev => ({ ...prev, [key]: Number(e.target.value) }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-center"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Combat Stats</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <FormField
              label="Max HP"
              type="number"
              value={maxHp}
              onChange={e => setMaxHp(Number(e.target.value))}
            />
            <FormField
              label="Current HP"
              type="number"
              value={currentHp}
              onChange={e => setCurrentHp(Number(e.target.value))}
            />
            <FormField
              label="Armor Class"
              type="number"
              value={armorClass}
              onChange={e => setArmorClass(Number(e.target.value))}
            />
            <FormField
              label="Speed"
              type="number"
              value={speed}
              onChange={e => setSpeed(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Creating...' : 'Create Character'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
