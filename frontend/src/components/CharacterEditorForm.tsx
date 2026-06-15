'use client';

import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import type {
  AbilityScores,
  Character,
  DieType,
  HitDice,
  HitPoints,
  Size,
  SrdBackground,
  SrdClass,
  SrdRace,
  SrdSubclass,
} from '@/lib/types';
import { DIE_TYPES, SIZES } from '@/lib/types';
import { useApiQuery } from '@/lib/query';
import FormField from '@/components/FormField';
import SrdCombobox from '@/components/SrdCombobox';

// Editable shape of a character. Slice 1 covered identity/abilities/combat;
// slice 2 (VEG-348) adds the SRD-grant fields below so picking a class/race/
// background can autofill them. Spell/inventory/personality editors come later;
// the page wrappers add `campaignId` (create) and `expectedVersion` (edit) on
// top of the payload below.
export interface CharacterFormValues {
  name: string;
  race: string;
  class: string;
  subclass: string;
  level: number;
  background: string;
  alignment: string;
  size: Size;
  abilityScores: AbilityScores;
  armorClass: number;
  initiative: number;
  speed: number;
  hitPoints: HitPoints;
  hitDice: HitDice;
  // SRD-grant targets. There's no dedicated editor for these yet (slice 3,
  // "Proficiencies & training"); slice 2 fills them via the autofill helpers and
  // surfaces them read-only, but they round-trip through the payload so the
  // grants persist.
  savingThrows: string[];
  skills: string[];
  proficiencies: string[];
  languages: string[];
  armorTraining: string[];
  spellcastingAbility: string;
}

const abilityKeys: (keyof AbilityScores)[] = [
  'strength',
  'dexterity',
  'constitution',
  'intelligence',
  'wisdom',
  'charisma',
];
const abilityLabels: Record<keyof AbilityScores, string> = {
  strength: 'STR',
  dexterity: 'DEX',
  constitution: 'CON',
  intelligence: 'INT',
  wisdom: 'WIS',
  charisma: 'CHA',
};

/** Blank form for the create flow — SRD-default ability scores and d8 hit die. */
export function emptyCharacterFormValues(): CharacterFormValues {
  return {
    name: '',
    race: '',
    class: '',
    subclass: '',
    level: 1,
    background: '',
    alignment: '',
    size: 'Medium',
    abilityScores: {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10,
    },
    armorClass: 10,
    initiative: 0,
    speed: 30,
    hitPoints: { max: 10, current: 10, temporary: 0 },
    hitDice: { dieType: 'd8', total: 1, spent: 0 },
    savingThrows: [],
    skills: [],
    proficiencies: [],
    languages: [],
    armorTraining: [],
    spellcastingAbility: '',
  };
}

/** Map a loaded character onto the editable form shape, filling slice-1 gaps. */
export function characterToFormValues(c: Character): CharacterFormValues {
  return {
    name: c.name,
    race: c.race ?? '',
    class: c.class ?? '',
    subclass: c.subclass ?? '',
    level: c.level,
    background: c.background ?? '',
    alignment: c.alignment ?? '',
    // Server-side `size` is free-text; coerce to the canonical union, falling
    // back to Medium for absent/legacy values outside the set.
    size: (SIZES as readonly string[]).includes(c.size ?? '') ? (c.size as Size) : 'Medium',
    abilityScores: c.abilityScores,
    armorClass: c.armorClass,
    initiative: c.initiative ?? 0,
    speed: c.speed,
    hitPoints: c.hitPoints,
    hitDice: c.hitDice ?? { dieType: 'd8', total: c.level, spent: 0 },
    savingThrows: c.savingThrows ?? [],
    skills: c.skills ?? [],
    proficiencies: c.proficiencies ?? [],
    languages: c.languages ?? [],
    armorTraining: c.armorTraining ?? [],
    spellcastingAbility: c.spellcastingAbility ?? '',
  };
}

/**
 * The API request body for create/update, derived from the form values. The
 * page wrappers spread this and append `campaignId` / `expectedVersion`. The
 * backend `CreateCharacterDto`/`UpdateCharacterDto` accept every key here.
 */
export function characterFormPayload(v: CharacterFormValues) {
  return {
    name: v.name,
    race: v.race,
    class: v.class,
    subclass: v.subclass,
    level: v.level,
    background: v.background,
    alignment: v.alignment,
    size: v.size,
    abilityScores: v.abilityScores,
    armorClass: v.armorClass,
    initiative: v.initiative,
    speed: v.speed,
    hitPoints: v.hitPoints,
    hitDice: v.hitDice,
    savingThrows: v.savingThrows,
    skills: v.skills,
    proficiencies: v.proficiencies,
    languages: v.languages,
    armorTraining: v.armorTraining,
    spellcastingAbility: v.spellcastingAbility,
  };
}

// ── SRD autofill (slice 2) ──────────────────────────────────────────────────
// Pure union-merge helpers: picking a class/race/background offers to fold its
// granted traits into the character without clobbering existing values. Each
// returns the next form values plus a summary of what was newly added (for the
// confirmation toast). Class *skills* are a choose-N pool, not a flat grant, so
// they're intentionally left to the slice-3 proficiencies editor.

export interface GrantSummary {
  label: string;
  values: string[];
}

/** Append only the additions not already present; report which were new. */
function union(current: string[], additions: string[]): { merged: string[]; added: string[] } {
  const have = new Set(current);
  const added = additions.filter(a => !have.has(a));
  return { merged: added.length ? [...current, ...added] : current, added };
}

export function applyClassGrants(
  v: CharacterFormValues,
  c: SrdClass
): { values: CharacterFormValues; added: GrantSummary[] } {
  const added: GrantSummary[] = [];
  const saves = union(v.savingThrows, c.savingThrows);
  const armor = union(v.armorTraining, c.armorProficiencies);
  const profs = union(v.proficiencies, [...c.weaponProficiencies, ...c.toolProficiencies]);
  if (saves.added.length) added.push({ label: 'Saving throws', values: saves.added });
  if (armor.added.length) added.push({ label: 'Armor training', values: armor.added });
  if (profs.added.length) added.push({ label: 'Proficiencies', values: profs.added });

  const dieType = (DIE_TYPES as readonly string[]).includes(c.hitDie)
    ? (c.hitDie as DieType)
    : v.hitDice.dieType;
  if (dieType !== v.hitDice.dieType) added.push({ label: 'Hit die', values: [dieType] });

  const spellcastingAbility = c.spellcasting?.ability ?? v.spellcastingAbility;
  if (spellcastingAbility !== v.spellcastingAbility) {
    added.push({ label: 'Spellcasting ability', values: [spellcastingAbility] });
  }

  return {
    values: {
      ...v,
      savingThrows: saves.merged,
      armorTraining: armor.merged,
      proficiencies: profs.merged,
      hitDice: { ...v.hitDice, dieType },
      spellcastingAbility,
    },
    added,
  };
}

export function applyRaceGrants(
  v: CharacterFormValues,
  r: SrdRace
): { values: CharacterFormValues; added: GrantSummary[] } {
  const added: GrantSummary[] = [];
  const langs = union(v.languages, r.languages);
  if (langs.added.length) added.push({ label: 'Languages', values: langs.added });
  const size = (SIZES as readonly string[]).includes(r.size) ? (r.size as Size) : v.size;
  if (size !== v.size) added.push({ label: 'Size', values: [size] });
  return { values: { ...v, languages: langs.merged, size }, added };
}

export function applyBackgroundGrants(
  v: CharacterFormValues,
  b: SrdBackground
): { values: CharacterFormValues; added: GrantSummary[] } {
  const added: GrantSummary[] = [];
  const skills = union(v.skills, b.skillProficiencies);
  const profs = union(v.proficiencies, b.toolProficiencies);
  if (skills.added.length) added.push({ label: 'Skills', values: skills.added });
  if (profs.added.length) added.push({ label: 'Proficiencies', values: profs.added });
  // Background `languages` is a count (how many to choose), not named langs, so
  // there's nothing to copy into Character.languages here.
  return { values: { ...v, skills: skills.merged, proficiencies: profs.merged }, added };
}

/** Human-readable summary for the autofill toast. */
export function summarizeGrants(source: string, added: GrantSummary[]): string {
  if (!added.length) return `${source}'s granted traits are already applied.`;
  const parts = added.map(g => `${g.label}: ${g.values.join(', ')}`);
  return `Applied from ${source} — ${parts.join('; ')}`;
}

const cardClass =
  'bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700 space-y-4';
const sectionHeading = 'text-lg font-semibold text-gray-900 dark:text-white';

interface CharacterEditorFormProps {
  initialValues: CharacterFormValues;
  submitLabel: string;
  submitting: boolean;
  onSubmit: (values: CharacterFormValues) => void | Promise<void>;
  onCancel: () => void;
  /** Extra control rendered at the bottom of the Identity section (campaign picker). */
  identityExtra?: ReactNode;
  /** Extra control rendered opposite the submit/cancel buttons (delete). */
  footerExtra?: ReactNode;
}

function Chips({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map(i => (
        <span
          key={i}
          className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200"
        >
          {i}
        </span>
      ))}
    </div>
  );
}

/** Read-only view of the SRD-granted lists (the slice-3 editor will make them editable). */
function GrantedTraits({ values }: { values: CharacterFormValues }) {
  const rows: { label: string; items: string[] }[] = [
    { label: 'Saving throws', items: values.savingThrows },
    { label: 'Skills', items: values.skills },
    { label: 'Languages', items: values.languages },
    { label: 'Armor training', items: values.armorTraining },
    { label: 'Other proficiencies', items: values.proficiencies },
  ];
  const hasAny = rows.some(r => r.items.length > 0) || values.spellcastingAbility !== '';

  return (
    <div className={cardClass}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className={sectionHeading}>Proficiencies &amp; Training</h2>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          Granted — full editing comes in a later update
        </span>
      </div>
      {!hasAny ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Nothing yet. Pick an SRD class, species, or background above and use “Apply … traits”.
        </p>
      ) : (
        <div className="space-y-3">
          {values.spellcastingAbility !== '' && (
            <div>
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Spellcasting ability
              </div>
              <Chips items={[values.spellcastingAbility]} />
            </div>
          )}
          {rows
            .filter(r => r.items.length > 0)
            .map(r => (
              <div key={r.label}>
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  {r.label}
                </div>
                <Chips items={r.items} />
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

export default function CharacterEditorForm({
  initialValues,
  submitLabel,
  submitting,
  onSubmit,
  onCancel,
  identityExtra,
  footerExtra,
}: CharacterEditorFormProps) {
  const [values, setValues] = useState<CharacterFormValues>(initialValues);

  // SRD catalogs for the pickers. These endpoints return small full arrays, so
  // we fetch once and filter client-side. A failed load degrades gracefully —
  // the comboboxes simply offer no suggestions and free-text entry still works.
  const classes = useApiQuery<SrdClass[]>('/srd/classes').data ?? [];
  const races = useApiQuery<SrdRace[]>('/srd/races').data ?? [];
  const backgrounds = useApiQuery<SrdBackground[]>('/srd/backgrounds').data ?? [];

  // Resolve the current free-text values back to SRD entities (by name) so we
  // can scope subclasses and offer the autofill action — works whether the user
  // just picked from the list or loaded an existing character.
  const selectedClass = classes.find(c => c.name === values.class);
  const selectedRace = races.find(r => r.name === values.race);
  const selectedBackground = backgrounds.find(b => b.name === values.background);

  const subclasses =
    useApiQuery<SrdSubclass[]>(`/srd/subclasses?classId=${selectedClass?.id ?? ''}`, {
      enabled: !!selectedClass,
    }).data ?? [];

  const set = <K extends keyof CharacterFormValues>(key: K, value: CharacterFormValues[K]) =>
    setValues(prev => ({ ...prev, [key]: value }));

  const applyGrants = (
    source: string,
    apply: (v: CharacterFormValues) => { values: CharacterFormValues; added: GrantSummary[] }
  ) => {
    const { values: next, added } = apply(values);
    setValues(next);
    toast.success(summarizeGrants(source, added));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Callers own the user-facing success/error toasts; this is a backstop so a
    // handler that rejects without its own catch can't fail silently (which
    // would leave the submit button stuck on "Saving…").
    Promise.resolve(onSubmit(values)).catch(err => {
      console.error('CharacterEditorForm onSubmit failed:', err);
      toast.error('Something went wrong saving the character.');
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* ── Identity ───────────────────────────────────────────── */}
      <div className={cardClass}>
        <h2 className={sectionHeading}>Identity</h2>
        <FormField
          label="Name"
          type="text"
          required
          value={values.name}
          onChange={e => set('name', e.target.value)}
        />
        <div className="grid grid-cols-2 gap-4">
          <SrdCombobox
            label="Race"
            value={values.race}
            options={races}
            onChange={v => set('race', v)}
            helperText="Pick from the SRD or type a custom species."
          />
          <SrdCombobox
            label="Class"
            value={values.class}
            options={classes}
            onChange={v => set('class', v)}
            helperText="Pick from the SRD or type a custom class."
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <SrdCombobox
            label="Subclass"
            value={values.subclass}
            options={subclasses}
            onChange={v => set('subclass', v)}
            helperText={selectedClass ? undefined : 'Select an SRD class to list its subclasses.'}
          />
          <FormField
            label="Level"
            type="number"
            min={1}
            max={20}
            value={values.level}
            onChange={e => set('level', Number(e.target.value))}
          />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <SrdCombobox
            label="Background"
            value={values.background}
            options={backgrounds}
            onChange={v => set('background', v)}
            helperText="Pick from the SRD or type a custom background."
          />
          <FormField
            label="Alignment"
            type="text"
            value={values.alignment}
            onChange={e => set('alignment', e.target.value)}
          />
          <FormField
            as="select"
            label="Size"
            value={values.size}
            onChange={e => set('size', e.target.value as Size)}
          >
            {SIZES.map(s => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </FormField>
        </div>

        {/* Offer to fold each matched SRD entity's granted traits into the
            character (union-merge — never clobbers manual edits). */}
        {(selectedClass || selectedRace || selectedBackground) && (
          <div className="flex flex-wrap gap-2">
            {selectedClass && (
              <button
                type="button"
                onClick={() =>
                  applyGrants(selectedClass.name, v => applyClassGrants(v, selectedClass))
                }
                className="px-3 py-1.5 text-sm rounded-lg border border-indigo-300 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-900/20 transition-colors"
              >
                Apply {selectedClass.name} traits
              </button>
            )}
            {selectedRace && (
              <button
                type="button"
                onClick={() =>
                  applyGrants(selectedRace.name, v => applyRaceGrants(v, selectedRace))
                }
                className="px-3 py-1.5 text-sm rounded-lg border border-indigo-300 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-900/20 transition-colors"
              >
                Apply {selectedRace.name} traits
              </button>
            )}
            {selectedBackground && (
              <button
                type="button"
                onClick={() =>
                  applyGrants(selectedBackground.name, v =>
                    applyBackgroundGrants(v, selectedBackground)
                  )
                }
                className="px-3 py-1.5 text-sm rounded-lg border border-indigo-300 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-900/20 transition-colors"
              >
                Apply {selectedBackground.name} traits
              </button>
            )}
          </div>
        )}
        {identityExtra}
      </div>

      {/* ── Proficiencies & Training (granted) ─────────────────────
          Read-only for now; a dedicated editor arrives in slice 3. Surfaces
          what the autofill applied so it isn't an invisible black box. */}
      <GrantedTraits values={values} />

      {/* ── Ability Scores ─────────────────────────────────────── */}
      <div className={cardClass}>
        <h2 className={sectionHeading}>Ability Scores</h2>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {abilityKeys.map(key => (
            <div key={key} className="text-center">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                {abilityLabels[key]}
              </label>
              <input
                type="number"
                min={1}
                max={30}
                aria-label={abilityLabels[key]}
                value={values.abilityScores[key]}
                onChange={e =>
                  set('abilityScores', {
                    ...values.abilityScores,
                    [key]: Number(e.target.value),
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-center"
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── Combat ─────────────────────────────────────────────── */}
      <div className={cardClass}>
        <h2 className={sectionHeading}>Combat</h2>
        <div className="grid grid-cols-3 gap-4">
          <FormField
            label="Armor Class"
            type="number"
            min={0}
            value={values.armorClass}
            onChange={e => set('armorClass', Number(e.target.value))}
          />
          <FormField
            label="Initiative"
            type="number"
            value={values.initiative}
            onChange={e => set('initiative', Number(e.target.value))}
          />
          <FormField
            label="Speed"
            type="number"
            min={0}
            value={values.speed}
            onChange={e => set('speed', Number(e.target.value))}
          />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <FormField
            label="Max HP"
            type="number"
            min={0}
            value={values.hitPoints.max}
            onChange={e => set('hitPoints', { ...values.hitPoints, max: Number(e.target.value) })}
          />
          <FormField
            label="Current HP"
            type="number"
            value={values.hitPoints.current}
            onChange={e =>
              set('hitPoints', { ...values.hitPoints, current: Number(e.target.value) })
            }
          />
          <FormField
            label="Temp HP"
            type="number"
            min={0}
            value={values.hitPoints.temporary}
            onChange={e =>
              set('hitPoints', { ...values.hitPoints, temporary: Number(e.target.value) })
            }
          />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <FormField
            as="select"
            label="Hit Die"
            value={values.hitDice.dieType}
            onChange={e =>
              set('hitDice', { ...values.hitDice, dieType: e.target.value as DieType })
            }
          >
            {DIE_TYPES.map(d => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </FormField>
          <FormField
            label="Hit Dice Total"
            type="number"
            min={0}
            value={values.hitDice.total}
            onChange={e => set('hitDice', { ...values.hitDice, total: Number(e.target.value) })}
          />
          <FormField
            label="Hit Dice Spent"
            type="number"
            min={0}
            value={values.hitDice.spent}
            onChange={e => set('hitDice', { ...values.hitDice, spent: Number(e.target.value) })}
          />
        </div>
      </div>

      {/* ── Actions ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Saving...' : submitLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
        </div>
        {footerExtra}
      </div>
    </form>
  );
}
