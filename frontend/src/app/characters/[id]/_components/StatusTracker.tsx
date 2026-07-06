'use client';

import { useEffect, useState } from 'react';
import type { Character, Condition } from '@/lib/types';
import { CONDITIONS } from '@grimoire-os/shared';
import ConcentrationChip from '@/components/ConcentrationChip';
import ConditionChips from '@/components/ConditionChips';
import {
  toggleConditionInList,
  setExhaustionLevel,
  concentrationFromSpellInput,
} from '@/lib/character-play';
import { resolvePlayControls, type PlayControlProps } from './useCharacterMutation';

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
  // All three are guarded: rows predating the VEG-408 columns deserialize
  // without them (or with null), and the section must render, not crash.
  const conditions = character.conditions ?? [];
  const concentration = character.concentration ?? null;
  const exhaustion = character.exhaustion ?? null;

  // Concentration-spell draft, committed on blur/Enter — a per-keystroke PATCH
  // would race the optimistic lock (mirrors the encounter tracker's concDraft).
  // The draft survives the commit (clearing it early would snap the input back
  // to the stale server value mid-write, and lose the text on a failed write);
  // it resets only when the refetched server value arrives below.
  const [spellDraft, setSpellDraft] = useState<string | null>(null);
  const serverSpell = character.concentration?.spell;
  useEffect(() => {
    setSpellDraft(null);
  }, [serverSpell]);

  const availableConditions = CONDITIONS.filter(c => !conditions.includes(c));

  const toggleCondition = (condition: Condition) => {
    patch({ conditions: toggleConditionInList(conditions, condition) });
  };

  const clickExhaustion = (level: number) => {
    patch({ exhaustion: setExhaustionLevel(exhaustion, level) });
  };

  const commitSpell = () => {
    if (spellDraft === null) return;
    const next = concentrationFromSpellInput(spellDraft);
    if (next.spell === concentration?.spell) {
      setSpellDraft(null);
      return;
    }
    patch({ concentration: next });
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
        {editable && availableConditions.length > 0 && (
          <select
            aria-label="Add condition"
            value=""
            disabled={isSaving}
            onChange={e => {
              if (e.target.value) toggleCondition(e.target.value as Condition);
            }}
            className="text-xs px-1.5 py-0.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50"
          >
            <option value="">+ Condition</option>
            {availableConditions.map(c => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
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
            const className = `inline-block w-3.5 h-3.5 rounded-full border text-[0] ${
              filled
                ? 'bg-red-500 border-red-500'
                : 'bg-transparent border-gray-300 dark:border-gray-600'
            }`;
            return editable ? (
              <button
                key={level}
                type="button"
                data-testid={`exhaustion-pip-${level}`}
                data-filled={filled}
                aria-label={`Set exhaustion level ${level}`}
                aria-pressed={filled}
                disabled={isSaving}
                onClick={() => clickExhaustion(level)}
                className={`${className} disabled:opacity-50`}
              />
            ) : (
              <span
                key={level}
                data-testid={`exhaustion-pip-${level}`}
                data-filled={filled}
                className={className}
              />
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
                  value={spellDraft ?? concentration.spell ?? ''}
                  disabled={isSaving}
                  onChange={e => setSpellDraft(e.target.value)}
                  onBlur={commitSpell}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitSpell();
                  }}
                  className="text-xs px-1.5 py-0.5 w-32 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50"
                />
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => patch({ concentration: null })}
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
    </div>
  );
}
