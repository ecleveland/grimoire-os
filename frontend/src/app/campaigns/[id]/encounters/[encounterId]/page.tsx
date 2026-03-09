'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { toast } from 'sonner';
import type { Encounter, Combatant } from '@/lib/types';

export default function InitiativeTrackerPage() {
  const { id, encounterId } = useParams<{ id: string; encounterId: string }>();
  const { user, isDm } = useAuth();
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchEncounter = useCallback(() => {
    apiFetch<Encounter>(`/encounters/${encounterId}`)
      .then(setEncounter)
      .catch(() => toast.error('Failed to load encounter'))
      .finally(() => setLoading(false));
  }, [encounterId]);

  useEffect(() => {
    fetchEncounter();
  }, [fetchEncounter]);

  const patchEncounter = async (updates: Partial<Encounter>) => {
    try {
      const updated = await apiFetch<Encounter>(`/encounters/${encounterId}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
      setEncounter(updated);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update encounter');
    }
  };

  const nextTurn = () => {
    if (!encounter) return;
    const sorted = [...encounter.combatants].sort((a, b) => b.initiative - a.initiative);
    const activeCombatants = sorted.filter((c) => c.hp > 0);
    if (activeCombatants.length === 0) return;

    let nextIndex = encounter.currentTurn + 1;
    let newRound = encounter.round;
    if (nextIndex >= sorted.length) {
      nextIndex = 0;
      newRound += 1;
    }
    patchEncounter({ currentTurn: nextIndex, round: newRound });
  };

  const updateCombatantHp = (index: number, newHp: number) => {
    if (!encounter) return;
    const sorted = [...encounter.combatants].sort((a, b) => b.initiative - a.initiative);
    sorted[index] = { ...sorted[index], hp: Math.max(0, Math.min(newHp, sorted[index].maxHp)) };
    patchEncounter({ combatants: sorted });
  };

  const toggleActive = () => {
    if (!encounter) return;
    patchEncounter({ isActive: !encounter.isActive });
  };

  if (loading) return <div className="text-gray-500 dark:text-gray-400">Loading...</div>;
  if (!encounter) return <div className="text-gray-500 dark:text-gray-400">Encounter not found.</div>;

  const sorted = [...encounter.combatants].sort((a, b) => b.initiative - a.initiative);
  const isController = isDm || (user && encounter.createdBy === user.userId);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{encounter.name}</h1>
          <div className="flex items-center gap-3 mt-2">
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${encounter.isActive ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'}`}>
              {encounter.isActive ? 'Active' : 'Inactive'}
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400">Round {encounter.round}</span>
          </div>
        </div>
        {isController && (
          <div className="flex gap-2">
            <button
              onClick={toggleActive}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
            >
              {encounter.isActive ? 'End Combat' : 'Start Combat'}
            </button>
            <button
              onClick={nextTurn}
              className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Next Turn
            </button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {sorted.map((c, i) => {
          const isCurrent = i === encounter.currentTurn;
          const isDead = c.hp <= 0;
          return (
            <div
              key={`${c.name}-${i}`}
              className={`flex items-center gap-4 p-4 rounded-lg border transition-colors ${
                isCurrent
                  ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-300 dark:border-indigo-700'
                  : isDead
                    ? 'bg-red-50/50 dark:bg-red-900/10 border-gray-200 dark:border-gray-700 opacity-60'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
              }`}
            >
              {isCurrent && (
                <span className="text-indigo-600 dark:text-indigo-400 text-lg font-bold">&raquo;</span>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 dark:text-white">{c.name}</span>
                  {c.isNpc && (
                    <span className="text-xs px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded">
                      NPC
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="text-center">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Init</div>
                  <div className="font-mono font-medium text-gray-900 dark:text-white">{c.initiative}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500 dark:text-gray-400">AC</div>
                  <div className="font-mono font-medium text-gray-900 dark:text-white">{c.ac}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500 dark:text-gray-400">HP</div>
                  {isController ? (
                    <input
                      type="number"
                      value={c.hp}
                      onChange={(e) => updateCombatantHp(i, Number(e.target.value))}
                      className="w-16 px-1 py-0.5 text-center font-mono font-medium border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  ) : (
                    <div className="font-mono font-medium text-gray-900 dark:text-white">
                      {c.hp}/{c.maxHp}
                    </div>
                  )}
                </div>
                {isController && (
                  <div className="text-xs text-gray-400">/{c.maxHp}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
