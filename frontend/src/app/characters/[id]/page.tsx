'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useApiQuery } from '@/lib/query';
import type { Character } from '@/lib/types';
import CharacterSheet from './_components/CharacterSheet';
import { takeCopiedFrom } from './_components/copied-from';

export default function CharacterSheetPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  // Read once on mount: taking the note removes it, so a reload shows no note.
  const [copiedFrom] = useState(() => takeCopiedFrom(id));
  const characterQuery = useApiQuery<Character>(`/characters/${id}`, {
    errorToast: 'Failed to load character',
  });
  const character = characterQuery.data;

  if (characterQuery.isPending)
    return <div className="text-gray-500 dark:text-gray-400">Loading...</div>;
  if (!character)
    return <div className="text-gray-500 dark:text-gray-400">Character not found.</div>;

  const isOwner = !!(user && character.userId === user.userId);

  return (
    <>
      {copiedFrom && (
        <p
          role="status"
          data-testid="copied-from-note"
          className="max-w-5xl mx-auto mb-4 text-sm text-gray-600 dark:text-gray-400"
        >
          Copied from {copiedFrom.name} at level {copiedFrom.level}.
        </p>
      )}
      <CharacterSheet character={character} isOwner={isOwner} />
    </>
  );
}
