'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import type { Character } from '@/lib/types';

export default function CharactersPage() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<Character[]>('/characters')
      .then(setCharacters)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-gray-500 dark:text-gray-400">Loading characters...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Characters</h1>
        <Link
          href="/characters/new"
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          New Character
        </Link>
      </div>

      {characters.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">No characters yet. Create one to get started!</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {characters.map((c) => (
            <Link
              key={c._id}
              href={`/characters/${c._id}`}
              className="block p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-indigo-500 transition-colors"
            >
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">{c.name}</h2>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                {c.race} {c.class}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Level {c.level}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
