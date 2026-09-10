'use client';

import { useEffect, useState } from 'react';
import type { Character, DieType, SrdClass } from '@/lib/types';
import { asHitDie, DEFAULT_HIT_DIE, HIT_DIE_TYPES } from '@/lib/types';
import Modal from '@/components/Modal';
import { useApiQuery } from '@/lib/query';
import { resolveClass } from '@/lib/class-selection';
import { rollDie } from '@/lib/dice';
import { proficiencyBonus } from '@/lib/ability-math';
import {
  applyLevelUp,
  averageHpForDie,
  classFeaturesAtLevel,
  dieFaces,
  hpGain,
  MAX_LEVEL,
} from '@/lib/character-level';
import { characterFeatureIdentity, featureRenderKey } from '@/lib/character-features';
import type { CharacterPatch } from './useCharacterMutation';
import { formatModifier } from './utils';

interface LevelUpDialogProps {
  character: Character;
  onClose: () => void;
  onPatch: (fields: CharacterPatch) => void;
  isSaving: boolean;
}

const sectionTitleClass = 'text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase';
const noteClass =
  'text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded px-3 py-2';

/**
 * Guided level-up (VEG-411): one composite optimistic-locked PATCH bumping
 * `level`, applying the HP gain (roll or fixed average + CON), adding a hit
 * die, and appending the chosen class features. Spell-slot maxima and the
 * proficiency bonus are deliberately not written — the computed-stats layer
 * re-derives both from the new level on the next read.
 */
export default function LevelUpDialog({
  character,
  onClose,
  onPatch,
  isSaving,
}: LevelUpDialogProps) {
  const newLevel = character.level + 1;
  const [mode, setMode] = useState<'average' | 'roll'>('average');
  const [roll, setRoll] = useState<number | null>(null);
  // Identities the player unchecked — defaulting to "none" keeps every suggested
  // feature checked without syncing state when the class catalog resolves. Keyed
  // the same way the rows are, rather than on the bare name, so the checkbox
  // state doesn't quietly depend on names being unique within one level.
  const [unchecked, setUnchecked] = useState<ReadonlySet<string>>(new Set());
  // Level the confirmed write targets, or null before confirming. The dialog
  // closes only once the bumped character flows back down — a failed write
  // (409 conflict, network error) leaves it open with the roll and feature
  // choices intact so the player can retry against the refetched version.
  const [targetLevel, setTargetLevel] = useState<number | null>(null);

  useEffect(() => {
    if (targetLevel !== null && character.level >= targetLevel) onClose();
  }, [targetLevel, character.level, onClose]);

  // A concurrent edit (other tab, DM) can bring the character to the cap while
  // the dialog is open — the section's atMax gate only hides the button, so
  // close rather than offer an impossible 20 → 21 transition the DTO rejects.
  useEffect(() => {
    if (character.level >= MAX_LEVEL) onClose();
  }, [character.level, onClose]);

  // Cached and shared with SpellcastingSection's identical fetch.
  const classesQuery = useApiQuery<SrdClass[]>('/srd/classes');
  // id-first (VEG-524). Both reads below are silently wrong against the wrong
  // row: the feature list is this class's per-level grants, and the hit die feeds
  // hpGain, which writes a *permanent* HP maximum. A colliding name with no
  // stored id resolves to nothing, which surfaces as the warning below rather
  // than a confident wrong die.
  const srdClass = resolveClass(classesQuery.data ?? [], {
    id: character.classId,
    name: character.class,
  });
  // Confirming before the catalog resolves would silently drop this level's
  // feature suggestions (and fall back to the wrong hit die), so a classed
  // character waits for it. Once settled, a load failure — or a class the SRD
  // catalog simply doesn't know (homebrew, typo) — only warns: blocking would
  // make leveling impossible offline or for custom classes, but staying silent
  // would read as "no new features this level".
  const classDataPending = !!character.class && !!classesQuery.isPending;
  const classDataUnavailable =
    !!character.class && !classesQuery.isPending && (!!classesQuery.isError || !srdClass);

  // The character's own stored die wins (a DM may have granted a nonstandard
  // one); the class die covers a sheet without hit dice.
  //
  // When neither exists this used to fall to a hardcoded d8, silently (VEG-528).
  // A sheet with hitPoints but no hitDice — API-created, or predating the
  // builder — whose class won't resolve then offered 4 + CON where a Fighter
  // gives 5 and a Barbarian 6, and confirming wrote that into `hitPoints.max`
  // permanently. So ask instead: the player knows their class's die even when
  // the catalog doesn't. Still no blocking — the existing decision above stands,
  // since blocking would make leveling impossible offline or for a custom class.
  const storedDie = character.hitDice?.dieType ?? null;
  // Narrowed to real hit dice (VEG-530). A homebrew class may declare d20 or
  // d100 — legal for the content DTO, not a hit die — and accepting one skipped
  // the picker and fed +51 a level straight into a permanent maximum, the same
  // mis-pick the picker's own narrowed list exists to prevent. Declining falls
  // through to `needsDiePick`, so the player is asked.
  const classHitDie = asHitDie(srdClass?.hitDie);
  const [pickedDie, setPickedDie] = useState<DieType>(DEFAULT_HIT_DIE);
  // Gated on the catalog having settled, so the selector doesn't flash in during
  // the fetch and then vanish once the class resolves.
  const needsDiePick = !storedDie && !classHitDie && !classDataPending;
  const die = storedDie ?? classHitDie ?? pickedDie;
  const conMod = character.computed.abilityModifiers.constitution;

  const hasHitPoints = character.hitPoints !== null;
  const base = mode === 'average' ? averageHpForDie(die) : roll;
  const gain = hasHitPoints && base !== null ? hpGain(base, conMod) : null;

  // Never re-offer a grant the character already owns *at this level* (e.g. after
  // a manual level revert) — a duplicate append would put two identical entries
  // on the sheet. The level is load-bearing: keyed on name and source alone this
  // also swallowed every recurring feature after the first, so a class carrying
  // Ability Score Improvement at 4 and 8 silently granted it once (VEG-454).
  // A stored feature with no level can't claim one, so it no longer suppresses.
  const ownedFeatureKeys = new Set((character.features ?? []).map(characterFeatureIdentity));
  const suggestedFeatures = (srdClass ? classFeaturesAtLevel(srdClass, newLevel) : []).filter(
    f => !ownedFeatureKeys.has(characterFeatureIdentity(f))
  );
  const chosenFeatures = suggestedFeatures.filter(f => !unchecked.has(characterFeatureIdentity(f)));

  const oldProf = proficiencyBonus(character.level);
  const newProf = proficiencyBonus(newLevel);

  const toggleFeature = (identity: string) => {
    setUnchecked(prev => {
      const next = new Set(prev);
      if (next.has(identity)) next.delete(identity);
      else next.add(identity);
      return next;
    });
  };

  // In roll mode the player must actually roll before the gain exists.
  const canConfirm = !isSaving && !classDataPending && (!hasHitPoints || gain !== null);

  const confirm = () => {
    // `die`, not `classHitDie`: the seeded hit-dice pool has to match the die the
    // HP gain was computed from, including when the player picked it themselves.
    onPatch(
      applyLevelUp(character, { hpGain: gain, newFeatures: chosenFeatures, classHitDie: die })
    );
    setTargetLevel(newLevel);
  };

  return (
    <Modal open onClose={onClose} label={`Level up ${character.name}`} testId="level-up-dialog">
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Level {character.level} → {newLevel}
          </h2>
          {newProf !== oldProf && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Proficiency bonus: {formatModifier(oldProf)} → {formatModifier(newProf)}
            </p>
          )}
        </div>

        {!character.computed.xp.readyToLevel && (
          <p role="status" className={noteClass}>
            Below the XP threshold for level {newLevel} — leveling anyway (milestone or DM
            discretion).
          </p>
        )}

        {classDataUnavailable && (
          <p role="status" className={noteClass}>
            Class data is unavailable, so new-feature suggestions can&apos;t be shown. You can still
            level up and add features from the sheet afterwards.
          </p>
        )}

        {/* Hit points */}
        <div className="space-y-2">
          <h3 className={sectionTitleClass}>Hit Points</h3>
          {needsDiePick && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                Hit die
                <select
                  value={pickedDie}
                  // Discard any roll taken on the previous die. `roll` is a bare
                  // number carrying no record of what it was rolled on, and
                  // before this selector existed `die` could only change when the
                  // class catalog settled, which canConfirm already gates on.
                  // Without this, rolling 11 on a d12 and then switching to d4
                  // keeps the 11: the button reads "Roll d4" beside "Rolled 11",
                  // and confirming writes 11 + CON into a permanent maximum
                  // beside a d4 pool.
                  onChange={e => {
                    setPickedDie(e.target.value as DieType);
                    setRoll(null);
                  }}
                  className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  {HIT_DIE_TYPES.map(d => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              {/* Says nothing about the class. When the class is set but
                  unresolvable the advisory above already covers that, and this
                  would stack a second amber box on the same fact; when the
                  character is simply classless, blaming the class would be false.
                  It also has to stop promising an HP change for a sheet with no
                  hit points — applyLevelUp skips hitPoints there, and the note
                  below already says so, so the two would contradict each other.
                  What is always true is that the die is a guess seeding the pool. */}
              <p role="status" className={noteClass}>
                {hasHitPoints
                  ? `No hit dice are recorded on this sheet, so HP is computed from ${die}. Confirming writes a permanent maximum, so pick the die your class uses if it differs.`
                  : `No hit dice are recorded on this sheet, so the new pool is seeded with ${die}. Pick the die your class uses if it differs.`}
              </p>
            </div>
          )}
          {hasHitPoints ? (
            <>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="radio"
                    name="hp-mode"
                    checked={mode === 'average'}
                    onChange={() => setMode('average')}
                  />
                  Average ({averageHpForDie(die)})
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="radio"
                    name="hp-mode"
                    checked={mode === 'roll'}
                    onChange={() => setMode('roll')}
                  />
                  Roll
                </label>
                {mode === 'roll' && (
                  <button
                    type="button"
                    onClick={() => setRoll(rollDie(dieFaces(die)))}
                    className="px-3 py-1 text-xs font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700"
                  >
                    Roll {die}
                  </button>
                )}
                {mode === 'roll' && roll !== null && (
                  <span data-testid="hp-roll-result" className="text-sm font-bold self-center">
                    Rolled {roll}
                  </span>
                )}
              </div>
              {gain !== null && (
                <p
                  data-testid="hp-gain-preview"
                  className="text-sm text-gray-700 dark:text-gray-300"
                >
                  +{gain} HP ({base} {formatModifier(conMod)} CON, minimum 1) — new maximum{' '}
                  {character.hitPoints!.max + gain}
                </p>
              )}
            </>
          ) : (
            <p role="status" className={noteClass}>
              No hit points recorded on this sheet — this level-up won&apos;t change HP. Set your
              hit points in the editor first if you want them tracked.
            </p>
          )}
        </div>

        {/* New class features */}
        {suggestedFeatures.length > 0 && (
          <div className="space-y-2">
            <h3 className={sectionTitleClass}>New Features at Level {newLevel}</h3>
            {suggestedFeatures.map((feature, i) => (
              <label
                key={featureRenderKey(feature, i)}
                className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300"
              >
                <input
                  type="checkbox"
                  aria-label={feature.name}
                  checked={!unchecked.has(characterFeatureIdentity(feature))}
                  onChange={() => toggleFeature(characterFeatureIdentity(feature))}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {feature.name}
                  </span>
                  {feature.description && (
                    <span className="block text-gray-500 dark:text-gray-400">
                      {feature.description}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
        )}

        {/* Spellcasting reminder — slots and budget derive from the new level */}
        {character.spellcastingAbility && (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Spell slots and your preparation budget update automatically at level {newLevel}. Add
            new spells from the Spells &amp; Details tab after leveling.
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!canConfirm}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Confirm Level Up
          </button>
        </div>
      </div>
    </Modal>
  );
}
