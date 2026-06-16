import { useState } from 'react';
import type { AbilityScores } from '@/lib/types';
import {
  ABILITY_KEYS,
  ABILITY_KEY_TO_NAME,
  ABILITY_LABELS,
  abilityModifier,
  formatModifier,
  proficiencyBonus,
  skillBonus,
  SKILL_ABILITY_MAP,
} from '@/lib/ability-math';
import type { WizardStepProps } from './types';

type Mode = 'manual' | 'array' | 'pointbuy';

const MODES: { id: Mode; label: string }[] = [
  { id: 'array', label: 'Standard array' },
  { id: 'pointbuy', label: 'Point buy' },
  { id: 'manual', label: 'Manual / rolled' },
];

const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;

// SRD point-buy: 27 points, scores bounded 8–15 with rising marginal cost.
const POINT_BUY_BUDGET = 27;
const POINT_BUY_COST: Record<number, number> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
};

type AbilityKey = keyof AbilityScores;
const emptyAssignments = (): Record<AbilityKey, number | null> =>
  Object.fromEntries(ABILITY_KEYS.map(k => [k, null])) as Record<AbilityKey, number | null>;

const slug = (s: string) => s.toLowerCase().replace(/\s+/g, '-');
const cardClass = 'rounded-md border border-gray-200 p-3 dark:border-gray-700';

/**
 * Step 3 — Ability scores (VEG-381). Three generation modes write the resulting
 * six scores into the draft, and a live computed preview (modifiers, saves,
 * skills) is derived from the shared sheet math so it matches the saved sheet.
 * Each mode just *sets* `abilityScores`, so re-entering the step is idempotent.
 *
 * Deferred (VEG-393): the background ability-score increase is additive on top of
 * the base scores and needs builder-state separation to survive remounts without
 * double-counting — it lands with the source-tagged-grants work.
 */
export default function AbilitiesStep({ value, onChange }: WizardStepProps) {
  const [mode, setMode] = useState<Mode>('manual');
  const [assignments, setAssignments] =
    useState<Record<AbilityKey, number | null>>(emptyAssignments);

  const setScores = (next: AbilityScores) => onChange({ abilityScores: next });

  const selectMode = (next: Mode) => {
    setMode(next);
    if (next === 'pointbuy') {
      // Point-buy baseline: every score at 8 (the full 27 points unspent).
      setScores({
        strength: 8,
        dexterity: 8,
        constitution: 8,
        intelligence: 8,
        wisdom: 8,
        charisma: 8,
      });
    } else if (next === 'array') {
      setAssignments(emptyAssignments());
    }
  };

  // ── Point-buy helpers ──
  const cost = (s: number) => POINT_BUY_COST[s] ?? 0;
  const spent = ABILITY_KEYS.reduce((sum, k) => sum + cost(value.abilityScores[k]), 0);
  const remaining = POINT_BUY_BUDGET - spent;
  const canInc = (k: AbilityKey) => {
    const s = value.abilityScores[k];
    return s < 15 && cost(s + 1) - cost(s) <= remaining;
  };
  const canDec = (k: AbilityKey) => value.abilityScores[k] > 8;
  const step = (k: AbilityKey, delta: 1 | -1) =>
    setScores({ ...value.abilityScores, [k]: value.abilityScores[k] + delta });

  // ── Standard-array helpers ──
  const availableFor = (k: AbilityKey) => {
    const usedElsewhere = ABILITY_KEYS.filter(x => x !== k)
      .map(x => assignments[x])
      .filter((v): v is number => v != null);
    return STANDARD_ARRAY.filter(v => !usedElsewhere.includes(v));
  };
  const assign = (k: AbilityKey, raw: string) => {
    const next = { ...assignments, [k]: raw === '' ? null : Number(raw) };
    setAssignments(next);
    if (ABILITY_KEYS.every(x => next[x] != null)) {
      setScores(
        Object.fromEntries(ABILITY_KEYS.map(x => [x, next[x]])) as unknown as AbilityScores
      );
    }
  };

  // ── Manual helpers ──
  const setManual = (k: AbilityKey, raw: string) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    setScores({ ...value.abilityScores, [k]: Math.max(1, Math.min(30, Math.trunc(n))) });
  };

  const pb = proficiencyBonus(value.level);

  return (
    <section aria-labelledby="step-abilities-heading" className="space-y-4">
      <h2
        id="step-abilities-heading"
        className="text-xl font-semibold text-gray-900 dark:text-white"
      >
        Abilities
      </h2>

      <div role="radiogroup" aria-label="Ability score method" className="flex flex-wrap gap-2">
        {MODES.map(m => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={mode === m.id}
            onClick={() => selectMode(m.id)}
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              mode === m.id
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'manual' && (
        <div className={`grid grid-cols-3 gap-3 ${cardClass}`}>
          {ABILITY_KEYS.map(k => (
            <label key={k} className="flex flex-col text-sm text-gray-600 dark:text-gray-300">
              {ABILITY_LABELS[k]}
              <input
                type="number"
                aria-label={ABILITY_LABELS[k]}
                value={value.abilityScores[k]}
                onChange={e => setManual(k, e.target.value)}
                className="mt-1 rounded border border-gray-300 px-2 py-1 dark:border-gray-600 dark:bg-gray-700"
              />
            </label>
          ))}
        </div>
      )}

      {mode === 'pointbuy' && (
        <div className={`space-y-2 ${cardClass}`}>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Points remaining: <span data-testid="points-remaining">{remaining}</span> /{' '}
            {POINT_BUY_BUDGET}
          </p>
          {ABILITY_KEYS.map(k => (
            <div key={k} className="flex items-center gap-3 text-sm">
              <span className="w-10 text-gray-600 dark:text-gray-300">{ABILITY_LABELS[k]}</span>
              <button
                type="button"
                aria-label={`Decrease ${ABILITY_KEY_TO_NAME[k]}`}
                disabled={!canDec(k)}
                onClick={() => step(k, -1)}
                className="h-6 w-6 rounded border border-gray-300 disabled:opacity-30 dark:border-gray-600"
              >
                −
              </button>
              <span
                data-testid={`score-${k}`}
                className="w-6 text-center text-gray-900 dark:text-white"
              >
                {value.abilityScores[k]}
              </span>
              <button
                type="button"
                aria-label={`Increase ${ABILITY_KEY_TO_NAME[k]}`}
                disabled={!canInc(k)}
                onClick={() => step(k, 1)}
                className="h-6 w-6 rounded border border-gray-300 disabled:opacity-30 dark:border-gray-600"
              >
                +
              </button>
            </div>
          ))}
        </div>
      )}

      {mode === 'array' && (
        <div className={`grid grid-cols-3 gap-3 ${cardClass}`}>
          {ABILITY_KEYS.map(k => (
            <label key={k} className="flex flex-col text-sm text-gray-600 dark:text-gray-300">
              {ABILITY_LABELS[k]}
              <select
                aria-label={ABILITY_LABELS[k]}
                value={assignments[k] ?? ''}
                onChange={e => assign(k, e.target.value)}
                className="mt-1 rounded border border-gray-300 px-2 py-1 dark:border-gray-600 dark:bg-gray-700"
              >
                <option value="">—</option>
                {availableFor(k).map(v => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}

      {/* Live computed preview — display-only, derived from the shared sheet math. */}
      <section aria-label="Ability preview" className={`space-y-2 ${cardClass}`}>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Proficiency bonus: <span data-testid="prof-bonus">{formatModifier(pb)}</span>
        </p>
        <div className="grid grid-cols-[3rem_3rem_4rem_4rem] gap-x-3 gap-y-1 text-sm">
          <span className="text-gray-400">Abil</span>
          <span className="text-gray-400">Score</span>
          <span className="text-gray-400">Mod</span>
          <span className="text-gray-400">Save</span>
          {ABILITY_KEYS.map(k => {
            const score = value.abilityScores[k];
            const saveProf = value.savingThrows.includes(ABILITY_KEY_TO_NAME[k]);
            return (
              <div key={k} className="contents">
                <span className="text-gray-600 dark:text-gray-300">{ABILITY_LABELS[k]}</span>
                <span className="text-gray-900 dark:text-white">{score}</span>
                <span data-testid={`mod-${k}`} className="text-gray-900 dark:text-white">
                  {formatModifier(abilityModifier(score))}
                </span>
                <span
                  data-testid={`save-${k}`}
                  className={saveProf ? 'font-semibold text-indigo-600 dark:text-indigo-400' : ''}
                >
                  {formatModifier(skillBonus(score, value.level, saveProf))}
                </span>
              </div>
            );
          })}
        </div>
        {value.skills.length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-700 dark:text-gray-300">
            {value.skills.map(skill => {
              const abilityName = SKILL_ABILITY_MAP[skill];
              const key = abilityName?.toLowerCase() as AbilityKey | undefined;
              if (!key) return null;
              const bonus = skillBonus(value.abilityScores[key], value.level, true);
              return (
                <span key={skill}>
                  {skill} <span data-testid={`skill-${slug(skill)}`}>{formatModifier(bonus)}</span>
                </span>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}
