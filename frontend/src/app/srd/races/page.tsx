'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import Markdown from '@/components/Markdown';
import PrintToggle from '@/components/PrintToggle';
import type { SrdRace } from '@/lib/types';

export default function RaceListPage() {
  const [races, setRaces] = useState<SrdRace[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    apiFetch<SrdRace[]>('/srd/races')
      .then(setRaces)
      .catch(err => {
        console.error('Failed to load races:', err);
        toast.error('Failed to load races', { id: 'load-races' });
      })
      .finally(() => setLoading(false));
  }, []);

  // Invariant: every trait from the API carries a row id (the races endpoint
  // includes trait rows), so each renders as a print toggle below. An id-less
  // trait silently degrades to an inert chip — surface it loudly, since a
  // backend contract regression here would otherwise drop toggles unnoticed.
  useEffect(() => {
    const idless = races.flatMap(race => race.traits).filter(t => !t.id);
    if (idless.length > 0) {
      console.error(
        'srd/races: race traits rendered without an id — print toggle unavailable (backend contract regression):',
        idless.map(t => t.name)
      );
    }
  }, [races]);

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) return <div className="text-gray-500 dark:text-gray-400">Loading races...</div>;

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Races</h1>
      <div className="space-y-4">
        {races.map(race => (
          <div
            key={race.id}
            className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-center">
              <button
                onClick={() => toggle(race.id)}
                className="flex-1 flex items-center justify-between p-4 text-left"
              >
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {race.name}
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Speed: {race.speed} ft &middot; Size: {race.size}
                  </p>
                </div>
                <span className="text-gray-400 text-lg">
                  {expanded.has(race.id) ? '\u2212' : '+'}
                </span>
              </button>
              <PrintToggle type="race" id={race.id} name={race.name} className="mr-4 shrink-0" />
            </div>
            {expanded.has(race.id) && (
              <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 pt-3 space-y-3">
                {race.description && (
                  <p className="text-gray-600 dark:text-gray-400 text-sm">{race.description}</p>
                )}
                {race.abilityBonuses && Object.keys(race.abilityBonuses).length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Ability Bonuses
                    </h3>
                    <div className="flex gap-2 mt-1">
                      {Object.entries(race.abilityBonuses).map(([ability, bonus]) => (
                        <span
                          key={ability}
                          className="text-xs px-2 py-0.5 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded"
                        >
                          {ability} +{bonus}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {race.traits.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Traits</h3>
                    <div className="mt-1 space-y-2">
                      {race.traits.map(t => (
                        <div key={t.name}>
                          <span className="inline-flex items-center gap-1">
                            <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
                              {t.name}.
                            </span>
                            {t.id && <PrintToggle type="feature" id={t.id} name={t.name} />}
                          </span>{' '}
                          {t.description && <Markdown className="mt-0.5">{t.description}</Markdown>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Languages
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {race.languages.join(', ')}
                  </p>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
