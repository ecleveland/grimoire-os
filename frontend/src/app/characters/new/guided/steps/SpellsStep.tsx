import { useEffect, useMemo, useRef, useState } from 'react';
import { useApiQuery } from '@/lib/query';
import type { PaginatedResponse, SrdClass, SrdSpell } from '@/lib/types';
import { formatModifier } from '@/lib/ability-math';
import {
  abilityModForName,
  cantripCount,
  leveledSpellAllowance,
  toSpellEntry,
} from './spell-rules';
import type { WizardStepProps } from './types';

const cardClass = 'rounded-md border border-gray-200 p-3 dark:border-gray-700';

/** A capped checkbox list over a class's spell options at one spell level. */
function SpellChecklist({
  label,
  chosen,
  cap,
  options,
  selectedIds,
  onToggle,
  loading,
}: {
  label: string;
  chosen: number;
  cap: number;
  options: SrdSpell[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  loading: boolean;
}) {
  if (cap === 0) return null;
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-gray-700 dark:text-gray-200">
        {label}{' '}
        <span className="font-normal text-gray-500 dark:text-gray-400">
          ({chosen} of {cap} chosen)
        </span>
      </legend>
      {loading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading spells…</p>
      ) : options.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No spells available.</p>
      ) : (
        <div
          className={`grid max-h-56 gap-x-4 gap-y-1 overflow-y-auto sm:grid-cols-2 ${cardClass}`}
        >
          {options.map(spell => {
            const checked = selectedIds.includes(spell.id);
            // Disable unpicked options once the cap is reached so the limit reads
            // visually, not just on click.
            const atCap = !checked && chosen >= cap;
            return (
              <label
                key={spell.id}
                className={`flex items-center gap-2 text-sm ${
                  atCap ? 'text-gray-400 dark:text-gray-600' : 'text-gray-900 dark:text-white'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={atCap}
                  onChange={() => onToggle(spell.id)}
                  className="accent-indigo-600"
                />
                <span>{spell.name}</span>
              </label>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}

/**
 * Step 5 — Spell selection (VEG-383). Shown only for spellcasting classes (the
 * shell gates visibility on `isSpellcaster`). Derives the level-1 allowance from
 * the class's `spellcasting` tables — cantrips known, and spells known (Bard/
 * Ranger/Sorcerer/Warlock) or prepared (Cleric/Druid/Paladin/Wizard, count =
 * `level [/2] + ability mod`, min 1) — and drives a picker off `GET /srd/spells`
 * filtered to the class list. Selections (capped at the allowance) are written to
 * the draft `spells: SpellEntry[]` with catalog metadata and the prepared flag,
 * and the spellcasting ability is (re)affirmed on the draft.
 *
 * Like the other steps, the picker's selection state is local and resets on
 * remount (the resolved `spells` survive in the draft); persisting working state
 * across remounts is part of the VEG-393 builder-state work.
 */
export default function SpellsStep({ value, onChange, onValidChange }: WizardStepProps) {
  const classesQuery = useApiQuery<SrdClass[]>('/srd/classes');

  const selectedClass = useMemo(
    () => classesQuery.data?.find(c => c.name === value.class),
    [classesQuery.data, value.class]
  );
  const spellcasting = selectedClass?.spellcasting;

  const abilityMod = abilityModForName(value.abilityScores, value.spellcastingAbility);
  const cantripAllowed = spellcasting ? cantripCount(spellcasting, value.level) : 0;
  const leveled = spellcasting
    ? leveledSpellAllowance(spellcasting, value.level, abilityMod)
    : { count: 0, mode: 'known' as const };

  // The catalog is paginated and large, so fetch only this class's spells at each
  // selectable level (server-side `class` + `level` filters), capped at the API
  // max of 100 — comfortably above any single class/level list.
  const classParam = encodeURIComponent(value.class);
  const cantripsQuery = useApiQuery<PaginatedResponse<SrdSpell>>(
    `/srd/spells?class=${classParam}&level=0&limit=100`,
    { enabled: !!value.class && cantripAllowed > 0, errorToast: 'Could not load cantrips.' }
  );
  const leveledQuery = useApiQuery<PaginatedResponse<SrdSpell>>(
    `/srd/spells?class=${classParam}&level=1&limit=100`,
    { enabled: !!value.class && leveled.count > 0, errorToast: 'Could not load spells.' }
  );
  const cantripOptions = useMemo(() => cantripsQuery.data?.data ?? [], [cantripsQuery.data]);
  const leveledOptions = useMemo(() => leveledQuery.data?.data ?? [], [leveledQuery.data]);

  // Restore prior picks on remount (the shell unmounts inactive steps) by matching
  // the draft's already-resolved spells back to their catalog ids — so navigating
  // away and back doesn't silently wipe the selection.
  const [cantripIds, setCantripIds] = useState<string[]>(() =>
    value.spells.filter(s => s.level === 0 && s.spellId).map(s => s.spellId as string)
  );
  const [leveledIds, setLeveledIds] = useState<string[]>(() =>
    value.spells.filter(s => s.level > 0 && s.spellId).map(s => s.spellId as string)
  );

  const byId = useMemo(
    () => new Map([...cantripOptions, ...leveledOptions].map(s => [s.id, s])),
    [cantripOptions, leveledOptions]
  );

  // This step owns the draft's `spells`, so it rewrites the resolved list (and
  // re-affirms the spellcasting ability) whenever a selection or the catalog
  // changes. The ref dedups so an unrelated re-render can't re-fire onChange.
  // Skip while the catalog is still loading: ids can't resolve through an empty
  // `byId` yet, so writing now would clobber the restored draft selection with [].
  const catalogLoading = cantripsQuery.isLoading || leveledQuery.isLoading;
  const lastWritten = useRef('');
  useEffect(() => {
    if (catalogLoading) return;
    const spells = [...cantripIds, ...leveledIds]
      .map(id => byId.get(id))
      .filter((s): s is SrdSpell => !!s)
      .map(toSpellEntry);
    const next = { spells, spellcastingAbility: value.spellcastingAbility };
    const key = JSON.stringify(next);
    if (key !== lastWritten.current) {
      lastWritten.current = key;
      onChange(next);
    }
  }, [catalogLoading, cantripIds, leveledIds, byId, value.spellcastingAbility, onChange]);

  // Cosmetic completion: both allowances exactly met (0/0 counts as complete).
  const complete = cantripIds.length === cantripAllowed && leveledIds.length === leveled.count;
  useEffect(() => {
    onValidChange?.(complete);
  }, [complete, onValidChange]);

  const makeToggle =
    (cap: number, ids: string[], setIds: (v: string[]) => void) => (id: string) => {
      if (ids.includes(id)) setIds(ids.filter(x => x !== id));
      else if (ids.length < cap) setIds([...ids, id]);
      // else: at the cap and not already picked — ignore.
    };

  const leveledLabel =
    leveled.mode === 'prepared' ? 'Prepared spells (level 1)' : 'Spells known (level 1)';
  const nothingToPick = cantripAllowed === 0 && leveled.count === 0;
  const loadFailed = classesQuery.isError || cantripsQuery.isError || leveledQuery.isError;

  return (
    <section aria-labelledby="step-spells-heading" className="space-y-4">
      <h2 id="step-spells-heading" className="text-xl font-semibold text-gray-900 dark:text-white">
        Spells
      </h2>

      {value.spellcastingAbility && (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Spellcasting ability:{' '}
          <span className="font-medium text-gray-900 dark:text-white">
            {value.spellcastingAbility}
          </span>{' '}
          ({formatModifier(abilityMod)})
        </p>
      )}

      {loadFailed ? (
        <p className={`${cardClass} text-sm text-red-600 dark:text-red-400`}>
          Couldn’t load spell options. Check your connection and try again.
        </p>
      ) : classesQuery.isLoading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
      ) : !spellcasting ? (
        <p className={`${cardClass} text-sm text-gray-600 dark:text-gray-300`}>
          Spell options aren’t available for this class.
        </p>
      ) : nothingToPick ? (
        <p className={`${cardClass} text-sm text-gray-600 dark:text-gray-300`}>
          Your class learns no spells at level 1 — you’ll gain them as you level up.
        </p>
      ) : (
        <>
          <SpellChecklist
            label="Cantrips"
            chosen={cantripIds.length}
            cap={cantripAllowed}
            options={cantripOptions}
            selectedIds={cantripIds}
            onToggle={makeToggle(cantripAllowed, cantripIds, setCantripIds)}
            loading={cantripsQuery.isLoading}
          />
          <SpellChecklist
            label={leveledLabel}
            chosen={leveledIds.length}
            cap={leveled.count}
            options={leveledOptions}
            selectedIds={leveledIds}
            onToggle={makeToggle(leveled.count, leveledIds, setLeveledIds)}
            loading={leveledQuery.isLoading}
          />
        </>
      )}
    </section>
  );
}
