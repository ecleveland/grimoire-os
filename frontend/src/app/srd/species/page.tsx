'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import type { SrdSpecies } from '@/lib/types';

export default function SpeciesListPage() {
  const [species, setSpecies] = useState<SrdSpecies[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    apiFetch<SrdSpecies[]>('/srd/species')
      .then(setSpecies)
      .catch(err => {
        console.error('Failed to load species:', err);
        toast.error('Failed to load species', { id: 'load-species' });
      })
      .finally(() => setLoading(false));
  }, []);

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) return <div className="text-gray-500 dark:text-gray-400">Loading species...</div>;

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Species</h1>
      <div className="space-y-4">
        {species.map(sp => (
          <div
            key={sp.id}
            className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
          >
            <button
              onClick={() => toggle(sp.id)}
              className="w-full flex items-center justify-between p-4 text-left"
            >
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{sp.name}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Speed: {sp.speed} ft &middot; Size: {sp.size}
                </p>
              </div>
              <span className="text-gray-400 text-lg">{expanded.has(sp.id) ? '\u2212' : '+'}</span>
            </button>
            {expanded.has(sp.id) && (
              <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 pt-3 space-y-3">
                {sp.description && (
                  <p className="text-gray-600 dark:text-gray-400 text-sm">{sp.description}</p>
                )}
                {sp.traits && sp.traits.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Traits</h3>
                    {sp.traits.map(t => (
                      <div key={t.name} className="ml-2">
                        <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
                          {t.name}.
                        </span>{' '}
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {t.description}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
