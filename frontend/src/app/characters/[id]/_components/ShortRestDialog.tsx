'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type { Character } from '@/lib/types';
import Modal from '@/components/Modal';
import { rollDie, type Rng } from '@/lib/dice';
import { averageHpForDie, dieFaces } from '@/lib/character-level';
import {
  applyShortRest,
  formatShortRestSummary,
  healHitPoints,
  shortRestHealPerDie,
} from '@/lib/character-play';
import type { CharacterPatch, PatchOptions } from './useCharacterMutation';
import { formatModifier } from './utils';

interface ShortRestDialogProps {
  character: Character;
  onClose: () => void;
  onPatch: (fields: CharacterPatch, options?: PatchOptions) => void;
  isSaving: boolean;
  /** Injectable for deterministic tests, per the `lib/dice` convention. */
  rng?: Rng;
}

const sectionTitleClass = 'text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase';
const noteClass =
  'text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded px-3 py-2';

/**
 * Short rest (VEG-487): spend hit dice one at a time, each healing its roll (or
 * the fixed average) plus the CON modifier, and recharge `recharge: 'short'`
 * resources — as a single composite optimistic-locked PATCH.
 *
 * Dice are spent one click at a time rather than picked as a count up front
 * because that is the actual 5e rule: the player decides whether to spend
 * another die *after* seeing each roll.
 */
export default function ShortRestDialog({
  character,
  onClose,
  onPatch,
  isSaving,
  rng = Math.random,
}: ShortRestDialogProps) {
  const [mode, setMode] = useState<'average' | 'roll'>('average');
  // Raw die faces in spend order — heal totals derive from these, so the CON
  // modifier stays a display-time concern and the rolls survive a failed write.
  const [rolls, setRolls] = useState<number[]>([]);

  const { hitDice } = character;
  const hasHitPoints = character.hitPoints !== null;
  const conMod = character.computed.abilityModifiers.constitution;
  const die = hitDice?.dieType ?? 'd8';
  const available = hitDice ? hitDice.total - hitDice.spent : 0;

  // `rolls` is dialog-local while `available` tracks the character prop, and a
  // 409 deliberately refetches underneath an open dialog (the designed retry
  // path). Deriving the usable rolls means a concurrent spend elsewhere drops
  // the rows the write could never have honoured, instead of rendering a
  // negative count and silently discarding them on confirm.
  const usableRolls = rolls.slice(0, available);

  // Spending a die can't heal a sheet with no stored HP block (VEG-425), so the
  // control is withheld rather than offered as a die that vanishes for nothing.
  const canSpendDice = hasHitPoints && !!hitDice;
  const canSpendMore = canSpendDice && usableRolls.length < available;

  const heals = usableRolls.map(roll => shortRestHealPerDie(roll, conMod));

  const patch = applyShortRest(character, { healPerDie: heals });
  // A rest that writes nothing shouldn't burn an optimistic-lock version.
  const canConfirm = !isSaving && Object.keys(patch).length > 0;

  const spendDie = () => {
    if (!canSpendMore) return;
    setRolls([
      ...usableRolls,
      mode === 'average' ? averageHpForDie(die) : rollDie(dieFaces(die), rng),
    ]);
  };

  const removeLastDie = () => setRolls(usableRolls.slice(0, -1));

  const confirm = () => {
    if (!canConfirm) return;
    // Summary and close both wait on the write: reporting at dispatch time would
    // announce a change a 409 or network failure may never have made.
    onPatch(patch, {
      onSuccess: () => {
        toast.message(formatShortRestSummary(character, patch));
        onClose();
      },
    });
  };

  // Report what the rest actually gains, not the raw dice sum — showing "24 HP"
  // beside a "44 → 44" preview contradicts itself. 5e still permits spending a
  // die that overheals, so the wasted portion is a warning, not a block.
  const rolledTotal = heals.reduce((sum, hp) => sum + hp, 0);
  const previewHp = character.hitPoints
    ? healHitPoints(character.hitPoints, rolledTotal).current
    : null;
  const effectiveHealing =
    previewHp !== null ? previewHp - character.hitPoints!.current : rolledTotal;
  const wastedHealing = rolledTotal - effectiveHealing;

  return (
    <Modal
      open
      onClose={onClose}
      label={`Short rest for ${character.name}`}
      testId="short-rest-dialog"
    >
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Short Rest</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Spend Hit Dice to heal, and recover abilities that recharge on a short rest.
          </p>
        </div>

        {!hasHitPoints ? (
          <p role="status" className={noteClass}>
            No hit points recorded on this sheet, so Hit Dice can&apos;t heal anything. Set your hit
            points in the editor first if you want them tracked.
          </p>
        ) : !hitDice ? (
          <p role="status" className={noteClass}>
            No Hit Dice on this sheet. Only short-rest resources will recover.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className={sectionTitleClass}>Hit Dice</h3>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                <span data-testid="dice-available" className="font-bold">
                  {available - usableRolls.length}
                </span>{' '}
                of {hitDice.total} {die} available
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="radio"
                  name="short-rest-mode"
                  checked={mode === 'average'}
                  onChange={() => setMode('average')}
                  disabled={isSaving}
                />
                Average ({averageHpForDie(die)})
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="radio"
                  name="short-rest-mode"
                  checked={mode === 'roll'}
                  onChange={() => setMode('roll')}
                  disabled={isSaving}
                />
                Roll
              </label>
            </div>

            {usableRolls.length > 0 && (
              <ul className="space-y-1">
                {usableRolls.map((roll, i) => (
                  <li
                    key={`die-${i}`}
                    data-testid={`die-row-${i}`}
                    className="text-sm text-gray-700 dark:text-gray-300"
                  >
                    {die} → {roll} {formatModifier(conMod)} CON ={' '}
                    <span className="font-bold">{heals[i]}</span> HP
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={spendDie}
                disabled={isSaving || !canSpendMore}
                className="px-3 py-1 text-xs font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                Spend a Hit Die
              </button>
              {usableRolls.length > 0 && (
                <button
                  type="button"
                  onClick={removeLastDie}
                  disabled={isSaving}
                  className="px-3 py-1 text-xs font-medium rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  Remove last die
                </button>
              )}
            </div>

            {available === 0 && (
              <p role="status" className={noteClass}>
                No Hit Dice remaining — take a long rest to regain some.
              </p>
            )}

            {wastedHealing > 0 && (
              <p role="status" data-testid="overheal-warning" className={noteClass}>
                {wastedHealing} HP of this roll is wasted — you&apos;re near maximum. Hit Dice are
                spent either way.
              </p>
            )}

            <p className="text-sm text-gray-700 dark:text-gray-300">
              Healing:{' '}
              <span data-testid="heal-total" className="font-bold">
                {effectiveHealing}
              </span>{' '}
              HP
              {previewHp !== null && (
                <>
                  {' '}
                  — {character.hitPoints!.current} →{' '}
                  <span data-testid="hp-preview" className="font-bold">
                    {previewHp}
                  </span>{' '}
                  of {character.hitPoints!.max}
                </>
              )}
            </p>
          </div>
        )}

        {patch.resources && (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Short-rest resources will be restored.
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            // Cancelling mid-write closed the dialog as though nothing had
            // happened while the PATCH still landed and spent the die.
            disabled={isSaving}
            className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!canConfirm}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Confirm Short Rest
          </button>
        </div>
      </div>
    </Modal>
  );
}
