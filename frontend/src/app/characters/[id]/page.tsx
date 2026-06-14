'use client';

import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useApiQuery } from '@/lib/query';
import type { Character } from '@/lib/types';
import CharacterSheet from './_components/CharacterSheet';

export default function CharacterSheetPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const characterQuery = useApiQuery<Character>(`/characters/${id}`, {
    errorToast: 'Failed to load character',
  });
  const character = characterQuery.data;

  if (characterQuery.isPending)
    return <div className="text-gray-500 dark:text-gray-400">Loading...</div>;
  if (!character)
    return <div className="text-gray-500 dark:text-gray-400">Character not found.</div>;

  const isOwner = !!(user && character.userId === user.userId);

  return <CharacterSheet character={character} isOwner={isOwner} />;
}
