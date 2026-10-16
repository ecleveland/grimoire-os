'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import type { SrdMonster } from '@/lib/types';

/**
 * The narrow-screen stat-block viewer: a modal that opens at once with a
 * loader and fills in when the monster arrives. An imperative fetch, because
 * the 200-null and failure paths close the modal and toast, and doing that
 * from a query result would need a state update inside an effect.
 */
export function useMonsterViewer() {
  const [viewMonster, setViewMonster] = useState<SrdMonster | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [viewLoading, setViewLoading] = useState(false);

  const viewCombatantMonster = (monsterId: string) => {
    setViewMonster(null);
    setViewLoading(true);
    setViewOpen(true);
    apiFetch<SrdMonster | null>(`/srd/monsters/${monsterId}`)
      .then(monster => {
        // 200 null = outside the viewer's visibility (e.g. a player clicking
        // the DM's homebrew-linked combatant, or a deleted monster) — close
        // with a toast instead of sticking on "Loading monster…".
        if (!monster) {
          toast.error('This stat block is not available to you');
          setViewOpen(false);
          return;
        }
        setViewMonster(monster);
      })
      .catch(() => {
        toast.error('Failed to load monster');
        setViewOpen(false);
      })
      .finally(() => setViewLoading(false));
  };

  return {
    open: viewCombatantMonster,
    close: () => setViewOpen(false),
    monster: viewMonster,
    isOpen: viewOpen,
    isLoading: viewLoading,
  };
}
