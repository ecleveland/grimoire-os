'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useApiQuery } from '@/lib/query';
import type { CharacterDetail } from '@/lib/types';
import CharacterSheet from './_components/CharacterSheet';
import { takeCopiedFrom } from './_components/copied-from';

export default function CharacterSheetPage() {
  const { id } = useParams<{ id: string }>();
  // Read once on mount: taking the note removes it, so a reload shows no note.
  const [copiedFrom] = useState(() => takeCopiedFrom(id));
  const characterQuery = useApiQuery<CharacterDetail>(`/characters/${id}`, {
    errorToast: 'Failed to load character',
    // A DM's combat write changes HP while the player's tab sits in the
    // background, so refetch on every focus. 'always' ignores the app-wide
    // 60 s stale window, which `true` would respect.
    refetchOnWindowFocus: 'always',
  });
  const character = characterQuery.data;

  if (characterQuery.isPending)
    return <div className="text-gray-500 dark:text-gray-400">Loading...</div>;
  if (!character)
    return <div className="text-gray-500 dark:text-gray-400">Character not found.</div>;

  // The server decides: false when a campaign DM reads a player's sheet.
  const isOwner = character.isOwner;

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
      {!isOwner && (
        <div
          role="status"
          data-testid="owner-banner"
          className="max-w-5xl mx-auto mb-6 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20 px-4 py-3 text-sm text-gray-900 dark:text-gray-100"
        >
          {character.ownerName}&rsquo;s character. Read only.
        </div>
      )}
      <CharacterSheet character={character} isOwner={isOwner} />
    </>
  );
}
