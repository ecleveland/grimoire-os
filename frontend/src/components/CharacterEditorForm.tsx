'use client';

import { useState, type ReactNode } from 'react';
import type { AbilityScores, Character, DieType, HitDice, HitPoints } from '@/lib/types';
import { DIE_TYPES, SIZES } from '@/lib/types';
import FormField from '@/components/FormField';

// Editable shape of a character — every field this slice of the editor (VEG-348
// workstream A, slice 1) covers. Spells/inventory/proficiencies/personality live
// in later slices; the page wrappers add `campaignId` (create) and
// `expectedVersion` (edit) on top of the payload below.
export interface CharacterFormValues {
  name: string;
  race: string;
  class: string;
  subclass: string;
  level: number;
  background: string;
  alignment: string;
  size: string;
  abilityScores: AbilityScores;
  armorClass: number;
  initiative: number;
  speed: number;
  hitPoints: HitPoints;
  hitDice: HitDice;
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
    size: c.size ?? 'Medium',
    abilityScores: c.abilityScores,
    armorClass: c.armorClass,
    initiative: c.initiative ?? 0,
    speed: c.speed,
    hitPoints: c.hitPoints,
    hitDice: c.hitDice ?? { dieType: 'd8', total: c.level, spent: 0 },
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
  };
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

  const set = <K extends keyof CharacterFormValues>(key: K, value: CharacterFormValues[K]) =>
    setValues(prev => ({ ...prev, [key]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void onSubmit(values);
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
          <FormField
            label="Race"
            type="text"
            value={values.race}
            onChange={e => set('race', e.target.value)}
          />
          <FormField
            label="Class"
            type="text"
            value={values.class}
            onChange={e => set('class', e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            label="Subclass"
            type="text"
            value={values.subclass}
            onChange={e => set('subclass', e.target.value)}
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
          <FormField
            label="Background"
            type="text"
            value={values.background}
            onChange={e => set('background', e.target.value)}
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
            onChange={e => set('size', e.target.value)}
          >
            {SIZES.map(s => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </FormField>
        </div>
        {identityExtra}
      </div>

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
