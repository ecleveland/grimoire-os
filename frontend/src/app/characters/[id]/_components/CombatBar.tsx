'use client';

import { useState } from 'react';
import type { Character } from '@/lib/types';
import { ZERO_HIT_POINTS } from '@/lib/character-defaults';
import { resolvePlayControls, type PlayControlProps } from './useCharacterMutation';
import {
  damageHitPoints,
  healHitPoints,
  setTempHitPoints,
  togglePip,
  adjustHitDiceSpent,
  deathSavesAfterRevive,
  parseNonNegativeInt,
  applyLongRest,
  applyShortRest,
  CLEARED_DEATH_SAVES,
} from '@/lib/character-play';

type CombatBarProps = { character: Character } & PlayControlProps;

function hpBarColor(current: number, max: number): string {
  const pct = max > 0 ? current / max : 0;
  if (pct > 0.5) return 'bg-green-500';
  if (pct >= 0.25) return 'bg-yellow-500';
  return 'bg-red-500';
}

export default function CombatBar(props: CombatBarProps) {
  const { character } = props;
  const { editable, patch, isSaving } = resolvePlayControls(props);
  // hitPoints/deathSaves are nullable at the API boundary (VEG-425); fall back
  // so a minimal character's combat bar renders instead of crashing. The HP
  // fallback is display-only — `hasHitPoints` gates the write actions so we never
  // persist a fabricated {0,0,0} block onto a null-HP record.
  const { hitDice } = character;
  const hasHitPoints = character.hitPoints !== null;
  const hitPoints = character.hitPoints ?? ZERO_HIT_POINTS;
  const deathSaves = character.deathSaves ?? CLEARED_DEATH_SAVES;
  const hpPct = hitPoints.max > 0 ? (hitPoints.current / hitPoints.max) * 100 : 0;
  const [amount, setAmount] = useState('');

  const amountValue = parseNonNegativeInt(amount);

  // HP writes no-op for a null-HP record: modifying a display-only fallback would
  // persist a fabricated block. The owner sets HP through the editor first.
  const applyDamage = () => {
    if (amountValue <= 0 || !hasHitPoints) return;
    patch({ hitPoints: damageHitPoints(hitPoints, amountValue) });
    setAmount('');
  };
  const applyHeal = () => {
    if (amountValue <= 0 || !hasHitPoints) return;
    const next = healHitPoints(hitPoints, amountValue);
    // A downed PC healed above 0 clears its death saves (5e).
    const cleared = deathSavesAfterRevive(next.current, deathSaves);
    patch({ hitPoints: next, ...(cleared ? { deathSaves: cleared } : {}) });
    setAmount('');
  };
  const applySetTemp = () => {
    if (!hasHitPoints) return;
    patch({ hitPoints: setTempHitPoints(hitPoints, amountValue) });
    setAmount('');
  };

  const toggleDeathSave = (track: 'successes' | 'failures', index: number) => {
    patch({ deathSaves: { ...deathSaves, [track]: togglePip(deathSaves[track], index, 3) } });
  };

  const spendHitDie = (delta: number) => {
    if (!hitDice) return;
    patch({ hitDice: adjustHitDiceSpent(hitDice, delta) });
  };

  // One-click long rest: HP to max, temp cleared, slots reset, hit dice regained,
  // death saves cleared, resources recharged — a single optimistic-locked
  // composite write (VEG-407, VEG-409).
  const longRest = () => patch(applyLongRest(character));

  // Short rest (VEG-409) only recharges `recharge: 'short'` resources; HP and
  // hit-die spending stay manual. The button disables when nothing would
  // change — an always-clickable control that silently does nothing (and an
  // empty PATCH would burn an optimistic-lock version) both mislead.
  const shortRestPatch = applyShortRest(character);
  const canShortRest = shortRestPatch.resources !== undefined;
  const shortRest = () => {
    if (canShortRest) patch(shortRestPatch);
  };

  const renderPips = (track: 'successes' | 'failures', filledClass: string) => {
    const filled = deathSaves[track];
    const label = track === 'successes' ? 'success' : 'failure';
    const prefix = track === 'successes' ? 'death-success' : 'death-failure';
    return [0, 1, 2].map(i => {
      const isFilled = i < filled;
      const className = `inline-block w-3.5 h-3.5 rounded-full border ${
        isFilled ? filledClass : 'bg-transparent border-gray-300 dark:border-gray-600'
      }`;
      return editable ? (
        <button
          key={`${prefix}-${i}`}
          type="button"
          data-testid={`${prefix}-${i}`}
          aria-label={`Toggle ${label} ${i + 1}`}
          aria-pressed={isFilled}
          disabled={isSaving}
          onClick={() => toggleDeathSave(track, i)}
          className={`${className} disabled:opacity-50`}
        />
      ) : (
        <span key={`${prefix}-${i}`} data-testid={`${prefix}-${i}`} className={className} />
      );
    });
  };

  const blockClass =
    'p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-center';

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-4 mb-6">
      {/* Armor Class */}
      <div data-testid="ac-block" className={blockClass}>
        <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
          Armor Class
        </div>
        <div className="text-3xl font-bold text-gray-900 dark:text-white mt-1">
          {character.armorClass ?? '—'}
        </div>
      </div>

      {/* Hit Points */}
      <div data-testid="hp-block" className={blockClass}>
        <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
          Hit Points
        </div>
        <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
          {hitPoints.current}/{hitPoints.max}
        </div>
        {hitPoints.temporary > 0 && (
          <div className="text-xs text-blue-600 dark:text-blue-400">
            +{hitPoints.temporary} temp
          </div>
        )}
        <div className="mt-2 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            data-testid="hp-bar"
            className={`h-full rounded-full transition-all ${hpBarColor(hitPoints.current, hitPoints.max)}`}
            style={{ width: `${Math.min(hpPct, 100)}%` }}
          />
        </div>
        {editable && (
          <div className="mt-3 space-y-2">
            <input
              type="number"
              min={0}
              aria-label="HP amount"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-full px-2 py-1 text-sm text-center rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
            />
            <div className="flex gap-1">
              <button
                type="button"
                onClick={applyDamage}
                disabled={isSaving || !hasHitPoints}
                className="flex-1 px-1 py-1 text-xs font-medium rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                Damage
              </button>
              <button
                type="button"
                onClick={applyHeal}
                disabled={isSaving || !hasHitPoints}
                className="flex-1 px-1 py-1 text-xs font-medium rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
              >
                Heal
              </button>
              <button
                type="button"
                onClick={applySetTemp}
                disabled={isSaving || !hasHitPoints}
                className="flex-1 px-1 py-1 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Set Temp
              </button>
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={shortRest}
                disabled={isSaving || !canShortRest}
                className="flex-1 px-1 py-1 text-xs font-medium rounded border border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 disabled:opacity-50"
              >
                Short Rest
              </button>
              <button
                type="button"
                onClick={longRest}
                disabled={isSaving}
                className="flex-1 px-1 py-1 text-xs font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                Long Rest
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Hit Dice */}
      {hitDice && (
        <div data-testid="hd-block" className={blockClass}>
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
            Hit Dice
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {hitDice.spent}/{hitDice.total}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">{hitDice.dieType}</div>
          {editable && (
            <div className="flex justify-center gap-2 mt-2">
              <button
                type="button"
                aria-label="Restore hit die"
                onClick={() => spendHitDie(-1)}
                disabled={isSaving || hitDice.spent <= 0}
                className="w-7 h-7 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40"
              >
                −
              </button>
              <button
                type="button"
                aria-label="Spend hit die"
                onClick={() => spendHitDie(1)}
                disabled={isSaving || hitDice.spent >= hitDice.total}
                className="w-7 h-7 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40"
              >
                +
              </button>
            </div>
          )}
        </div>
      )}

      {/* Death Saves */}
      <div data-testid="death-saves-block" className={blockClass}>
        <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
          Death Saves
        </div>
        <div className="mt-2 space-y-1">
          <div className="flex items-center justify-center gap-1.5">
            <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">S</span>
            {renderPips('successes', 'bg-green-500 border-green-600')}
          </div>
          <div className="flex items-center justify-center gap-1.5">
            <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">F</span>
            {renderPips('failures', 'bg-red-500 border-red-600')}
          </div>
        </div>
      </div>

      {/* Heroic Inspiration */}
      <div data-testid="inspiration-block" className={blockClass}>
        <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
          Inspiration
        </div>
        {editable ? (
          <button
            type="button"
            aria-label="Toggle heroic inspiration"
            aria-pressed={!!character.heroicInspiration}
            disabled={isSaving}
            onClick={() => patch({ heroicInspiration: !character.heroicInspiration })}
            className={`mt-2 text-3xl leading-none disabled:opacity-50 ${
              character.heroicInspiration ? 'text-amber-500' : 'text-gray-300 dark:text-gray-600'
            }`}
          >
            ★
          </button>
        ) : (
          <div
            data-testid="inspiration-state"
            className={`mt-2 text-3xl leading-none ${
              character.heroicInspiration ? 'text-amber-500' : 'text-gray-300 dark:text-gray-600'
            }`}
          >
            ★
          </div>
        )}
      </div>
    </div>
  );
}
