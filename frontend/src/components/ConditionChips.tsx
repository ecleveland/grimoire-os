'use client';

import type { Condition } from '@/lib/types';

interface ConditionChipsProps {
  conditions: Condition[];
  /** Per-chip remove callback; omitting it renders the chips read-only. */
  onRemove?: (condition: Condition) => void;
  /** Accessible label for a chip's remove button (default `Remove <condition>`). */
  removeLabel?: (condition: Condition) => string;
  /** Disables the remove buttons while a write is in flight. */
  disabled?: boolean;
}

/**
 * The purple SRD-condition pill list (VEG-287), extracted from the encounter
 * tracker so the tracker and the character sheet's status tracker (VEG-408)
 * can't drift. Purely presentational: state and write paths stay with the
 * caller. Renders as a fragment so the parent controls layout.
 */
export default function ConditionChips({
  conditions,
  onRemove,
  removeLabel = cond => `Remove ${cond}`,
  disabled = false,
}: ConditionChipsProps) {
  return (
    <>
      {conditions.map(cond => (
        <span
          key={cond}
          data-testid={`condition-chip-${cond}`}
          className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded"
        >
          {cond}
          {onRemove && (
            <button
              type="button"
              aria-label={removeLabel(cond)}
              onClick={() => onRemove(cond)}
              disabled={disabled}
              className="hover:text-purple-900 dark:hover:text-purple-100 disabled:opacity-50"
            >
              &times;
            </button>
          )}
        </span>
      ))}
    </>
  );
}
