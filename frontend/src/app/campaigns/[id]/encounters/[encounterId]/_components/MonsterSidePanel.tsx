'use client';

import { useEffect, useState, type RefObject } from 'react';
import { useApiQuery } from '@/lib/query';
import type { Combatant, SrdMonster } from '@/lib/types';
import MonsterStatBlock from '@/components/MonsterStatBlock';

export interface MonsterSidePanelProps {
  /** The monster to show: the pin, else the active combatant's. null below `lg`. */
  monsterId: string | null;
  isWide: boolean;
  isPeeking: boolean;
  activeCombatant: Combatant | null;
  currentTurn: number;
  containerRef: RefObject<HTMLDivElement | null>;
  activeCardRef: RefObject<HTMLDivElement | null>;
  onBackToTurn: () => void;
}

export default function MonsterSidePanel({
  monsterId,
  isWide,
  isPeeking,
  activeCombatant,
  currentTurn,
  containerRef,
  activeCardRef,
  onBackToTurn,
}: MonsterSidePanelProps) {
  const [measuredOffset, setMeasuredOffset] = useState(0);

  // Load the panel's stat block. The QueryProvider cache keeps each fetched
  // monster, so returning to one on a later turn skips the loader. A 200-null
  // body (not visible to this viewer, or deleted) clears the panel rather than
  // sticking on the loader. A failed fetch clears it at once and silently:
  // retries are off, so a server error never holds the loader through the
  // provider's retry backoff.
  const panelQuery = useApiQuery<SrdMonster | null>(`/srd/monsters/${monsterId}`, {
    enabled: monsterId !== null,
    retry: false,
  });
  const panelMonster = monsterId ? (panelQuery.data ?? null) : null;
  const panelLoading = monsterId !== null && panelQuery.isPending;

  // Anchor the right-hand stat panel level with the active card: measure the
  // card's offset within the two-column row and push the panel down to match,
  // re-measuring when the active card changes, when cards resize (HP/condition
  // edits shift the list), or on window resize. Only on wide screens — the
  // panel is hidden below `lg`, so a narrow screen reads an offset of 0
  // whatever was last measured. The first measurement waits one animation
  // frame. getBoundingClientRect is 0 and ResizeObserver and
  // requestAnimationFrame may be absent under jsdom, so this no-ops harmlessly
  // in tests.
  const panelOffset = isWide ? measuredOffset : 0;
  useEffect(() => {
    if (!isWide) return;
    const measure = () => {
      const container = containerRef.current;
      const card = activeCardRef.current;
      if (!container || !card) return;
      const offset = card.getBoundingClientRect().top - container.getBoundingClientRect().top;
      setMeasuredOffset(prev => (Math.abs(prev - offset) > 1 ? Math.max(0, offset) : prev));
    };
    const frame =
      typeof requestAnimationFrame === 'function' ? requestAnimationFrame(measure) : null;
    const Observer = typeof ResizeObserver !== 'undefined' ? ResizeObserver : null;
    const ro = Observer ? new Observer(measure) : null;
    if (ro && containerRef.current) ro.observe(containerRef.current);
    window.addEventListener('resize', measure);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [isWide, currentTurn, containerRef, activeCardRef]);

  // Floating stat block (VEG-384): follows the active combatant (or a
  // pinned one) so the DM reads the fighting creature without scrolling.
  // The wrapper's margin-top anchors it level with the active card (see
  // panelOffset); a long block scrolls within the panel. Hidden below
  // `lg`, where the modal viewer takes over instead.
  return (
    <aside
      className="hidden lg:block min-w-0"
      aria-label="Active creature stat block"
      data-testid="active-stat-panel"
    >
      <div
        className="transition-[margin-top] duration-200 ease-out"
        style={{ marginTop: panelOffset }}
      >
        {/* Quick-reference banner (VEG-384): shown when the panel is peeking a
              non-active combatant, reassuring the DM the turn hasn't moved and
              offering a one-click snap back to the active creature. */}
        {isPeeking && activeCombatant && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-900/20 px-3 py-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                Quick reference
              </p>
              <p className="truncate text-xs text-amber-700/90 dark:text-amber-300">
                Still {activeCombatant.name}&apos;s turn
              </p>
            </div>
            <button
              type="button"
              onClick={onBackToTurn}
              className="shrink-0 rounded border border-amber-400 px-2 py-1 text-xs text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-600 dark:text-amber-200 dark:hover:bg-amber-900/40"
            >
              Back to current turn
            </button>
          </div>
        )}
        <div className="max-h-[calc(100vh-2rem)] overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          {panelLoading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading stat block…</p>
          ) : panelMonster ? (
            <MonsterStatBlock monster={panelMonster} />
          ) : activeCombatant ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No stat block for {activeCombatant.name}. Click a monster combatant&apos;s name to pin
              its stat block here.
            </p>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              The active creature&apos;s stat block will appear here.
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}
