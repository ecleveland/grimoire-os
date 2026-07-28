'use client';

import { useEffect, useState } from 'react';
import type { Character, Condition } from '@/lib/types';
import AddConditionSelect from '@/components/AddConditionSelect';
import ConcentrationChip from '@/components/ConcentrationChip';
import ConditionChips from '@/components/ConditionChips';
import {
  toggleConditionInList,
  setExhaustionLevel,
  concentrationFromSpellInput,
} from '@/lib/character-play';
import {
  resolvePlayControls,
  type CharacterPatch,
  type PlayControlProps,
} from './useCharacterMutation';

type StatusTrackerProps = { character: Character } & PlayControlProps;

const EXHAUSTION_LEVELS = [1, 2, 3, 4, 5, 6] as const;

/**
 * PC status tracker (VEG-408): condition chips, an exhaustion 1–6 track, and a
 * concentration indicator — the sheet-side counterpart of the encounter
 * tracker's combatant status UI (VEG-287), sharing its vocabulary and chip
 * rendering but with sheet affordances (a clickable track instead of a select).
 */
export default function StatusTracker(props: StatusTrackerProps) {
  const { character } = props;
  const { editable, patch, isSaving } = resolvePlayControls(props);
  // Guarded for rows predating the VEG-408 columns: `concentration` and
  // `exhaustion` are nullable columns, and payloads older than the migration
  // may omit all three keys entirely. (`conditions` is a Postgres String[], so
  // a *current* backend never sends null for it — see entities.ts.)
  const conditions = character.conditions ?? [];
  const concentration = character.concentration ?? null;
  // 0 means "none", same as the combatant convention — never show "Level 0".
  const exhaustion = character.exhaustion || null;
  // The mechanical effect comes from the server-computed block (VEG-449), not a
  // second client-side copy of the rule — the penalties it summarizes are the
  // ones actually applied to the sheet's saves, skills, initiative and speed.
  const exhaustionEffect = character.computed.exhaustion;

  // Concentration-spell draft, committed on blur/Enter — a per-keystroke PATCH
  // would race the optimistic lock. The commit clears the draft but parks the
  // sent value in `pendingSpell` so the input doesn't snap back to stale data
  // while the write round-trips (and later typing is never wiped by the
  // refetch); the pending value clears when the server echoes a new spell.
  // After a failed write the pending value keeps showing what was attempted —
  // the mutation hook's toast reports the failure, and a re-commit retries.
  const [spellDraft, setSpellDraft] = useState<string | null>(null);
  const [pendingSpell, setPendingSpell] = useState<string | null>(null);
  const serverSpell = concentration?.spell;
  const isConcentrating = concentration !== null;
  useEffect(() => {
    setPendingSpell(null);
  }, [serverSpell]);
  useEffect(() => {
    // Concentration ended: drop any draft/pending so a stale spell name can't
    // resurface (or be stray-committed) on the next concentration.
    if (!isConcentrating) {
      setSpellDraft(null);
      setPendingSpell(null);
    }
  }, [isConcentrating]);

  // The spell name never commits on blur. An implicit blur-commit races the
  // click that caused it (its PATCH flips `isSaving` and disables the clicked
  // control before mouseup — the click is silently swallowed), and every
  // suppression scheme just moves the hazard (stale flags, stranded drafts).
  // Commits are explicit instead: Enter or the Save button, and any status
  // control in this card folds the outstanding draft into its own composite
  // PATCH. Until then the Save button stays visible, so an unsaved draft
  // never masquerades as saved.

  /** Fold any outstanding draft into `fields` so one PATCH carries both. */
  const withSpellCommit = (fields: CharacterPatch): CharacterPatch => {
    if (spellDraft === null || !isConcentrating) return fields;
    const next = concentrationFromSpellInput(spellDraft);
    if (next.spell === serverSpell) {
      // Draft matches the server (an abandoned rename): clear it so it can't
      // linger, mask a concurrent rename, or be stray-committed later.
      setSpellDraft(null);
      setPendingSpell(null);
      return fields;
    }
    setSpellDraft(null);
    setPendingSpell(next.spell ?? '');
    return { concentration: next, ...fields };
  };

  const toggleCondition = (condition: Condition) => {
    patch(withSpellCommit({ conditions: toggleConditionInList(conditions, condition) }));
  };

  const clickExhaustion = (level: number) => {
    patch(withSpellCommit({ exhaustion: setExhaustionLevel(exhaustion, level) }));
  };

  const commitSpell = () => {
    if (spellDraft === null) return;
    const next = concentrationFromSpellInput(spellDraft);
    // Clearing the draft here (not after the round-trip) is what makes the
    // commit single-fire: the blur that follows an Enter commit (the disabled
    // input drops focus) finds no draft and no-ops instead of re-sending the
    // PATCH with a stale expectedVersion.
    setSpellDraft(null);
    if (next.spell === serverSpell) {
      // Re-entering the server's own value abandons any pending rename — the
      // input must show the server value again, not a stale failed attempt.
      setPendingSpell(null);
      return;
    }
    setPendingSpell(next.spell ?? '');
    patch({ concentration: next });
  };

  // Stopping deliberately discards any draft — the spell is ending, so
  // committing a rename alongside the stop would be nonsense.
  const stopConcentrating = () => {
    setSpellDraft(null);
    patch({ concentration: null });
  };

  return (
    <div
      data-testid="status-tracker"
      className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
    >
      <h2 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</h2>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {conditions.length === 0 && !concentration && (
          <span className="text-sm text-gray-400 dark:text-gray-500">No active conditions</span>
        )}
        <ConditionChips
          conditions={conditions}
          onRemove={editable ? toggleCondition : undefined}
          disabled={isSaving}
        />
        {concentration && <ConcentrationChip concentration={concentration} />}
        {editable && (
          <AddConditionSelect
            activeConditions={conditions}
            onAdd={toggleCondition}
            disabled={isSaving}
            className="text-xs px-1.5 py-0.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50"
          />
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        {/* Exhaustion 1–6 track. Clicking the current level clears it. */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
            Exhaustion
          </span>
          {EXHAUSTION_LEVELS.map(level => {
            const filled = exhaustion !== null && level <= exhaustion;
            const shared = {
              'data-testid': `exhaustion-pip-${level}`,
              'data-filled': filled,
              className: `inline-block w-3.5 h-3.5 rounded-full border text-[0] ${
                filled
                  ? 'bg-red-500 border-red-500'
                  : 'bg-transparent border-gray-300 dark:border-gray-600'
              }`,
            };
            return editable ? (
              <button
                key={level}
                type="button"
                {...shared}
                aria-label={`Set exhaustion level ${level}`}
                aria-pressed={filled}
                disabled={isSaving}
                onClick={() => clickExhaustion(level)}
                className={`${shared.className} disabled:opacity-50`}
              />
            ) : (
              <span key={level} {...shared} />
            );
          })}
          {exhaustion !== null && (
            <span className="text-xs text-red-600 dark:text-red-400">Level {exhaustion}</span>
          )}
        </div>

        {/* Concentration controls (owner only; the chip above shows state). */}
        {editable && (
          <div className="flex items-center gap-1.5">
            {concentration ? (
              <>
                <input
                  type="text"
                  aria-label="Concentration spell"
                  placeholder="Spell name"
                  value={spellDraft ?? pendingSpell ?? serverSpell ?? ''}
                  disabled={isSaving}
                  onChange={e => setSpellDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitSpell();
                  }}
                  className="text-xs px-1.5 py-0.5 w-32 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50"
                />
                {spellDraft !== null && (
                  <button
                    type="button"
                    aria-label="Save spell name"
                    disabled={isSaving}
                    onClick={commitSpell}
                    className="text-xs px-1.5 py-0.5 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded disabled:opacity-50"
                  >
                    Save
                  </button>
                )}
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={stopConcentrating}
                  className="text-xs px-1.5 py-0.5 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30 rounded disabled:opacity-50"
                >
                  Stop concentrating
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={isSaving}
                onClick={() => patch({ concentration: {} })}
                className="text-xs px-1.5 py-0.5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded disabled:opacity-50"
              >
                Concentrate
              </button>
            )}
          </div>
        )}
      </div>

      {/* What the level actually costs. Its own row below the controls, not a
          `basis-full` item inside them — wedged into that flex row it would push
          the concentration controls onto a third line. Without it the sheet's
          saves, skills, initiative and speed just drop with no visible cause
          (VEG-449). */}
      {exhaustionEffect && (
        <p data-testid="exhaustion-effect" className="mt-2 text-xs text-red-600 dark:text-red-400">
          {exhaustionEffect.dead
            ? 'Death'
            : // Typographic minus on both halves, matching the dice-roll
              // formatter — `formatModifier` would render an ASCII hyphen and
              // leave the two penalties visibly inconsistent on one line.
              `−${Math.abs(exhaustionEffect.d20Penalty)} to d20 Tests · ` +
              `−${exhaustionEffect.speedPenalty} ft Speed`}
        </p>
      )}
    </div>
  );
}
