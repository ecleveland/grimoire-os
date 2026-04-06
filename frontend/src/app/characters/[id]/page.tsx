'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { toast } from 'sonner';
import type { Character } from '@/lib/types';
import CharacterSheet from './_components/CharacterSheet';

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

  const isOwner = !!(user && character.userId === user.userId);

  return <CharacterSheet character={character} isOwner={isOwner} />;
}
