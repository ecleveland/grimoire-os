'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { toast } from 'sonner';
import type { Character, AbilityScores } from '@/lib/types';

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

function modifier(score: number): string {
  const mod = Math.floor((score - 10) / 2);
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

export default function CharacterSheetPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [character, setCharacter] = useState<Character | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<Character>(`/characters/${id}`)
      .then(setCharacter)
      .catch(() => toast.error('Failed to load character'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="text-gray-500 dark:text-gray-400">Loading...</div>;
  if (!character)
    return <div className="text-gray-500 dark:text-gray-400">Character not found.</div>;

  const isOwner = user && character.userId === user.userId;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{character.name}</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            {character.race} {character.class} &middot; Level {character.level}
          </p>
          {character.background && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {character.background} &middot; {character.alignment}
            </p>
          )}
        </div>
        {isOwner && (
          <Link
            href={`/characters/${id}/edit`}
            className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
          >
            Edit
          </Link>
        )}
      </div>

      {/* Ability Scores */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-6">
        {abilityKeys.map(key => (
          <div
            key={key}
            className="text-center p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
          >
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
              {abilityLabels[key]}
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {character.abilityScores[key]}
            </div>
            <div className="text-sm text-indigo-600 dark:text-indigo-400 font-medium">
              {modifier(character.abilityScores[key])}
            </div>
          </div>
        ))}
      </div>

      {/* Combat Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-center">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
            Armor Class
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {character.armorClass}
          </div>
        </div>
        <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-center">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
            Hit Points
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {character.hitPoints.current}/{character.hitPoints.max}
          </div>
          {character.hitPoints.temporary > 0 && (
            <div className="text-xs text-blue-600 dark:text-blue-400">
              +{character.hitPoints.temporary} temp
            </div>
          )}
        </div>
        <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-center">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
            Speed
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {character.speed} ft
          </div>
        </div>
        <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-center">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
            Initiative
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {modifier(character.abilityScores.dexterity)}
          </div>
        </div>
      </div>

      {/* Proficiencies */}
      {character.proficiencies?.length > 0 && (
        <div className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Proficiencies
          </h2>
          <div className="flex flex-wrap gap-2">
            {character.proficiencies.map(p => (
              <span
                key={p}
                className="px-2 py-1 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded"
              >
                {p}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Languages */}
      {character.languages?.length > 0 && (
        <div className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Languages</h2>
          <p className="text-gray-700 dark:text-gray-300">{character.languages.join(', ')}</p>
        </div>
      )}

      {/* Features */}
      {character.features?.length > 0 && (
        <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Features & Traits
          </h2>
          <div className="space-y-2">
            {character.features.map((f, i) => (
              <div key={i}>
                <span className="font-medium text-gray-900 dark:text-white">{f.name}</span>
                {f.source && (
                  <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                    ({f.source})
                  </span>
                )}
                {f.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-400">{f.description}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
