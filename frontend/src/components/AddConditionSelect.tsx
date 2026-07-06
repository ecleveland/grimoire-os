'use client';

import { CONDITIONS } from '@grimoire-os/shared';
import type { Condition } from '@/lib/types';

interface AddConditionSelectProps {
  /** Conditions already active — excluded from the option list. */
  activeConditions: Condition[];
  onAdd: (condition: Condition) => void;
  /** Defaults to "Add condition"; the tracker names the combatant. */
  ariaLabel?: string;
  disabled?: boolean;
  /** Caller-supplied styling so each surface keeps its own idiom. */
  className?: string;
}

/**
 * The "+ Condition" placeholder select (VEG-287), shared by the encounter
 * tracker and the character sheet's status tracker (VEG-408) so the two
 * surfaces can't drift. Renders nothing once every SRD condition is active.
 */
export default function AddConditionSelect({
  activeConditions,
  onAdd,
  ariaLabel = 'Add condition',
  disabled = false,
  className,
}: AddConditionSelectProps) {
  const available = CONDITIONS.filter(c => !activeConditions.includes(c));
  if (available.length === 0) return null;

  return (
    <select
      aria-label={ariaLabel}
      value=""
      disabled={disabled}
      onChange={e => {
        if (e.target.value) onAdd(e.target.value as Condition);
      }}
      className={className}
    >
      <option value="">+ Condition</option>
      {available.map(c => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}
