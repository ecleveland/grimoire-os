'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import type { Character, AbilityScores } from '@/lib/types';

const abilityKeys: (keyof AbilityScores)[] = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
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
    strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10,
  });
  const [maxHp, setMaxHp] = useState(10);
  const [currentHp, setCurrentHp] = useState(10);
  const [armorClass, setArmorClass] = useState(10);
  const [speed, setSpeed] = useState(30);
  const [submitting, setSubmitting] = useState(false);

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
        }),
      });
      toast.success('Character created!');
      router.push(`/characters/${character._id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create character');
      setSubmitting(false);
    }
  };

  const inputClass =
    'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent';

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Create Character</h1>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Basic Info</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Race</label>
              <input type="text" value={race} onChange={(e) => setRace(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Class</label>
              <input type="text" value={charClass} onChange={(e) => setCharClass(e.target.value)} className={inputClass} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Level</label>
              <input type="number" min={1} max={20} value={level} onChange={(e) => setLevel(Number(e.target.value))} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Background</label>
              <input type="text" value={background} onChange={(e) => setBackground(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Alignment</label>
              <input type="text" value={alignment} onChange={(e) => setAlignment(e.target.value)} className={inputClass} />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Ability Scores</h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {abilityKeys.map((key) => (
              <div key={key} className="text-center">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  {abilityLabels[key]}
                </label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={abilityScores[key]}
                  onChange={(e) => setAbilityScores((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
                  className={inputClass + ' text-center'}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Combat Stats</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Max HP</label>
              <input type="number" value={maxHp} onChange={(e) => setMaxHp(Number(e.target.value))} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Current HP</label>
              <input type="number" value={currentHp} onChange={(e) => setCurrentHp(Number(e.target.value))} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Armor Class</label>
              <input type="number" value={armorClass} onChange={(e) => setArmorClass(Number(e.target.value))} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Speed</label>
              <input type="number" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className={inputClass} />
            </div>
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
          <button type="button" onClick={() => router.back()} className="px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
