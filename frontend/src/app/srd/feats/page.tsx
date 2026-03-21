'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import type { SrdFeat } from '@/lib/types';

const CATEGORIES = ['All', 'Origin', 'General', 'Fighting Style', 'Epic Boon'];

export default function FeatListPage() {
  const [feats, setFeats] = useState<SrdFeat[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState('All');

  useEffect(() => {
    apiFetch<SrdFeat[]>('/srd/feats')
      .then(setFeats)
      .catch((err) => {
        console.error('Failed to load feats:', err);
        toast.error('Failed to load feats', { id: 'load-feats' });
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(
    () => (categoryFilter === 'All' ? feats : feats.filter((f) => f.category === categoryFilter)),
    [feats, categoryFilter],
  );

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) return <div className="text-gray-500 dark:text-gray-400">Loading feats...</div>;

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Feats</h1>
      <div className="flex gap-2 mb-4 flex-wrap">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={`px-3 py-1 rounded text-sm ${
              categoryFilter === cat
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>
      <div className="space-y-4">
        {filtered.map((feat) => (
          <div key={feat.id} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <button
              onClick={() => toggle(feat.id)}
              className="w-full flex items-center justify-between p-4 text-left"
            >
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {feat.name}
                  {feat.repeatable && (
                    <span className="ml-2 text-xs px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded">
                      Repeatable
                    </span>
                  )}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {feat.category}
                  {feat.prerequisite && <> &middot; {feat.prerequisite}</>}
                </p>
              </div>
              <span className="text-gray-400 text-lg">{expanded.has(feat.id) ? '\u2212' : '+'}</span>
            </button>
            {expanded.has(feat.id) && (
              <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 pt-3">
                <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-line">{feat.description}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
