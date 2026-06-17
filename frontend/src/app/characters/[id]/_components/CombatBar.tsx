'use client';

import { useState } from 'react';
import type { Character } from '@/lib/types';
import type { PlayControlProps } from './useCharacterMutation';
import {
  damageHitPoints,
  healHitPoints,
  setTempHitPoints,
  togglePip,
  adjustHitDiceSpent,
  CLEARED_DEATH_SAVES,
} from '@/lib/character-play';

type CombatBarProps = { character: Character } & PlayControlProps;

function hpBarColor(current: number, max: number): string {
  const pct = max > 0 ? current / max : 0;
  if (pct > 0.5) return 'bg-green-500';
  if (pct >= 0.25) return 'bg-yellow-500';
  return 'bg-red-500';
}

export default function CombatBar({ character, isOwner, onPatch, isSaving }: CombatBarProps) {
  const { hitPoints, hitDice } = character;
  const deathSaves = character.deathSaves ?? { successes: 0, failures: 0 };
  const hpPct = hitPoints.max > 0 ? (hitPoints.current / hitPoints.max) * 100 : 0;
  const editable = !!isOwner && !!onPatch;
  const [amount, setAmount] = useState('');

  const amountValue = Math.max(0, Math.floor(Number(amount) || 0));

  const applyDamage = () => {
    if (!onPatch || amountValue <= 0) return;
    onPatch({ hitPoints: damageHitPoints(hitPoints, amountValue) });
    setAmount('');
  };
  const applyHeal = () => {
    if (!onPatch || amountValue <= 0) return;
    const next = healHitPoints(hitPoints, amountValue);
    // Revive: a downed PC healed above 0 clears its death saves (5e).
    const reviving =
      hitPoints.current <= 0 && next.current > 0 && (deathSaves.successes || deathSaves.failures);
    onPatch({ hitPoints: next, ...(reviving ? { deathSaves: { ...CLEARED_DEATH_SAVES } } : {}) });
    setAmount('');
  };
  const applySetTemp = () => {
    if (!onPatch) return;
    onPatch({ hitPoints: setTempHitPoints(hitPoints, amountValue) });
    setAmount('');
  };

  const toggleDeathSave = (track: 'successes' | 'failures', index: number) => {
    if (!onPatch) return;
    onPatch({ deathSaves: { ...deathSaves, [track]: togglePip(deathSaves[track], index, 3) } });
  };

  const spendHitDie = (delta: number) => {
    if (!onPatch || !hitDice) return;
    onPatch({ hitDice: adjustHitDiceSpent(hitDice, delta) });
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
          {character.armorClass}
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
                disabled={isSaving}
                className="flex-1 px-1 py-1 text-xs font-medium rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                Damage
              </button>
              <button
                type="button"
                onClick={applyHeal}
                disabled={isSaving}
                className="flex-1 px-1 py-1 text-xs font-medium rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
              >
                Heal
              </button>
              <button
                type="button"
                onClick={applySetTemp}
                disabled={isSaving}
                className="flex-1 px-1 py-1 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Set Temp
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
            onClick={() => onPatch?.({ heroicInspiration: !character.heroicInspiration })}
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
