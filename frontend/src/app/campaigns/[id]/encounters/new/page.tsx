'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import type { Combatant, Encounter } from '@/lib/types';

const emptyCombatant: Combatant = {
  name: '',
  initiative: 0,
  hp: 10,
  maxHp: 10,
  ac: 10,
  isNpc: false,
};

export default function NewEncounterPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [name, setName] = useState('');
  const [combatants, setCombatants] = useState<Combatant[]>([{ ...emptyCombatant }]);
  const [submitting, setSubmitting] = useState(false);

  const updateCombatant = (index: number, field: keyof Combatant, value: string | number | boolean) => {
    setCombatants((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
  };

  const addCombatant = () => setCombatants((prev) => [...prev, { ...emptyCombatant }]);

  const removeCombatant = (index: number) => {
    setCombatants((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const encounter = await apiFetch<Encounter>('/encounters', {
        method: 'POST',
        body: JSON.stringify({ campaignId: id, name, combatants }),
      });
      toast.success('Encounter created!');
      router.push(`/campaigns/${id}/encounters/${encounter.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create encounter');
      setSubmitting(false);
    }
  };

  const inputClass =
    'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent';

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Create Encounter</h1>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Encounter Name <span className="text-red-500">*</span>
          </label>
          <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Combatants</h2>
            <button
              type="button"
              onClick={addCombatant}
              className="px-3 py-1 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Add Combatant
            </button>
          </div>

          <div className="space-y-4">
            {combatants.map((c, i) => (
              <div key={i} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Combatant {i + 1}</span>
                  {combatants.length > 1 && (
                    <button type="button" onClick={() => removeCombatant(i)} className="text-sm text-red-600 hover:text-red-700">
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Name</label>
                    <input type="text" required value={c.name} onChange={(e) => updateCombatant(i, 'name', e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Initiative</label>
                    <input type="number" value={c.initiative} onChange={(e) => updateCombatant(i, 'initiative', Number(e.target.value))} className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">HP</label>
                    <input type="number" value={c.hp} onChange={(e) => updateCombatant(i, 'hp', Number(e.target.value))} className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Max HP</label>
                    <input type="number" value={c.maxHp} onChange={(e) => updateCombatant(i, 'maxHp', Number(e.target.value))} className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">AC</label>
                    <input type="number" value={c.ac} onChange={(e) => updateCombatant(i, 'ac', Number(e.target.value))} className={inputClass} />
                  </div>
                  <div className="flex items-end pb-2">
                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <input type="checkbox" checked={c.isNpc} onChange={(e) => updateCombatant(i, 'isNpc', e.target.checked)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                      NPC
                    </label>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Creating...' : 'Create Encounter'}
          </button>
          <button type="button" onClick={() => router.back()} className="px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
