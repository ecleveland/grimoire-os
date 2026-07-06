'use client';

import { useState } from 'react';
import type { Character } from '@/lib/types';
import { MAX_LEVEL, MAX_XP, xpProgressPercent } from '@/lib/character-level';
import { parseNonNegativeInt } from '@/lib/character-play';
import { resolvePlayControls, type PlayControlProps } from './useCharacterMutation';
import LevelUpDialog from './LevelUpDialog';

type LevelUpSectionProps = { character: Character } & PlayControlProps;

const textInputClass =
  'px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white';

/**
 * XP progress + level-up entry point (VEG-411). The bar reads the server's
 * `computed.xp` band — the frontend owns no threshold table. Leveling is never
 * gated on XP (`readyToLevel` only emphasizes the affordance), so milestone
 * campaigns level with XP untouched.
 */
export default function LevelUpSection(props: LevelUpSectionProps) {
  const { character } = props;
  const { editable, patch, isSaving } = resolvePlayControls(props);
  const [award, setAward] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

  const xp = character.computed.xp;
  const pct = xpProgressPercent(xp);
  const atMax = character.level >= MAX_LEVEL || xp.nextLevelAt === null;
  const xpToNext = atMax ? null : Math.max(0, xp.nextLevelAt! - character.experiencePoints);

  const awardValue = parseNonNegativeInt(award);
  // Refuse an award the int4 column can't hold (the DTO also rejects it).
  const canAward = awardValue > 0 && character.experiencePoints + awardValue <= MAX_XP;
  const awardXp = () => {
    if (!canAward) return;
    patch({ experiencePoints: character.experiencePoints + awardValue });
    setAward('');
  };

  return (
    <div
      data-testid="level-up-section"
      className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase">
            Experience
          </h3>
          <span className="text-sm font-bold text-gray-900 dark:text-white">
            {character.experiencePoints.toLocaleString()} XP
          </span>
          {atMax ? (
            <span className="text-xs text-gray-500 dark:text-gray-400">Max level</span>
          ) : (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {xpToNext!.toLocaleString()} XP to level {character.level + 1}
            </span>
          )}
          {!atMax && xp.readyToLevel && (
            <span
              role="status"
              className="text-xs font-semibold text-green-700 dark:text-green-400"
            >
              Ready to level up!
            </span>
          )}
        </div>

        {editable && (
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              aria-label="XP to award"
              placeholder="XP"
              value={award}
              disabled={isSaving}
              onChange={e => setAward(e.target.value)}
              className={`w-20 ${textInputClass}`}
            />
            <button
              type="button"
              onClick={awardXp}
              disabled={isSaving || !canAward}
              className="px-3 py-1 text-xs font-medium rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
            >
              Award XP
            </button>
            {!atMax && (
              <button
                type="button"
                onClick={() => setDialogOpen(true)}
                disabled={isSaving}
                className={`px-3 py-1 text-xs font-medium rounded text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50${
                  xp.readyToLevel ? ' ring-2 ring-indigo-300 dark:ring-indigo-500' : ''
                }`}
              >
                Level Up
              </button>
            )}
          </div>
        )}
      </div>

      {!atMax && pct !== null && (
        <div
          role="progressbar"
          aria-label={`XP progress to level ${character.level + 1}`}
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden"
        >
          <div
            className="h-full rounded-full bg-indigo-600 dark:bg-indigo-400 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {dialogOpen && (
        <LevelUpDialog
          character={character}
          onClose={() => setDialogOpen(false)}
          onPatch={patch}
          isSaving={isSaving}
        />
      )}
    </div>
  );
}
