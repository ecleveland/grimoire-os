'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import type { SrdClass } from '@/lib/types';

export default function ClassListPage() {
  const [classes, setClasses] = useState<SrdClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    apiFetch<SrdClass[]>('/srd/classes')
      .then(setClasses)
      .catch(() => {})
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

  if (loading) return <div className="text-gray-500 dark:text-gray-400">Loading classes...</div>;

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Classes</h1>
      <div className="space-y-4">
        {classes.map((cls) => (
          <div key={cls._id} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <button
              onClick={() => toggle(cls._id)}
              className="w-full flex items-center justify-between p-4 text-left"
            >
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{cls.name}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Hit Die: {cls.hitDie} &middot; {cls.primaryAbilities.join(', ')}
                </p>
              </div>
              <span className="text-gray-400 text-lg">{expanded.has(cls._id) ? '\u2212' : '+'}</span>
            </button>
            {expanded.has(cls._id) && (
              <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 pt-3 space-y-3">
                {cls.description && (
                  <p className="text-gray-600 dark:text-gray-400 text-sm">{cls.description}</p>
                )}
                <div>
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Saving Throws</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{cls.savingThrows.join(', ')}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Armor Proficiencies</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {cls.armorProficiencies.length > 0 ? cls.armorProficiencies.join(', ') : 'None'}
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Weapon Proficiencies</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {cls.weaponProficiencies.length > 0 ? cls.weaponProficiencies.join(', ') : 'None'}
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Skill Choices</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{cls.skillChoices.join(', ')}</p>
                </div>
                {cls.features.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Features</h3>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {cls.features.map((f) => (
                        <span key={f} className="text-xs px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded">
                          {f}
                        </span>
                      ))}
                    </div>
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
