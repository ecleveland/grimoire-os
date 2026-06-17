'use client';

import type { ReactNode } from 'react';

const ROLL_HOVER = 'hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors';

interface RollableStatProps {
  /** When true the value renders as a roll button; otherwise a static element. */
  canRoll?: boolean;
  /** Accessible name for the roll button, e.g. "Roll Strength check". */
  label: string;
  onRoll: () => void;
  /** Value styling shared by both the static and button render. */
  className: string;
  testId?: string;
  children: ReactNode;
}

/**
 * A character-sheet stat value that becomes a dice-roll button for the owner
 * (VEG-349, slice 7) and a plain `<span>` otherwise. Centralizes the roll
 * button's hover/focus affordance so the ability/save/skill/initiative roll
 * sites can't drift in styling.
 */
export default function RollableStat({
  canRoll,
  label,
  onRoll,
  className,
  testId,
  children,
}: RollableStatProps) {
  if (!canRoll) {
    return (
      <span data-testid={testId} className={className}>
        {children}
      </span>
    );
  }
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      onClick={onRoll}
      className={`${className} ${ROLL_HOVER}`}
    >
      {children}
    </button>
  );
}
