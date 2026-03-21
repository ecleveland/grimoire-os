'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import type { SrdBackground } from '@/lib/types';

export default function BackgroundListPage() {
  const [backgrounds, setBackgrounds] = useState<SrdBackground[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    apiFetch<SrdBackground[]>('/srd/backgrounds')
      .then(setBackgrounds)
      .catch((err) => {
        console.error('Failed to load backgrounds:', err);
        toast.error('Failed to load backgrounds', { id: 'load-backgrounds' });
      })
      .finally(() => setLoading(false));
  }, []);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) return <div className="text-gray-500 dark:text-gray-400">Loading backgrounds...</div>;

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Backgrounds</h1>
      <div className="space-y-4">
        {backgrounds.map((bg) => (
          <div key={bg.id} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <button
              onClick={() => toggle(bg.id)}
              className="w-full flex items-center justify-between p-4 text-left"
            >
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{bg.name}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Skills: {bg.skillProficiencies.join(', ')}
                  {bg.feat && <> &middot; Feat: {bg.feat}</>}
                </p>
              </div>
              <span className="text-gray-400 text-lg">{expanded.has(bg.id) ? '\u2212' : '+'}</span>
            </button>
            {expanded.has(bg.id) && (
              <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 pt-3 space-y-3">
                {bg.description && (
                  <p className="text-gray-600 dark:text-gray-400 text-sm">{bg.description}</p>
                )}
                {bg.abilityScores && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Ability Scores</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Choose {bg.abilityScores.choose} from: {bg.abilityScores.options.join(', ')}
                    </p>
                  </div>
                )}
                {bg.toolProficiencies.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Tool Proficiencies</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{bg.toolProficiencies.join(', ')}</p>
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
