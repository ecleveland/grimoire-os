'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import ClassFeaturesEditor from '@/components/ClassFeaturesEditor';
import FormField from '@/components/FormField';
import ToggleChips from '@/components/ToggleChips';
import TokenListEditor from '@/components/TokenListEditor';
import { MAX_LEVEL } from '@/lib/character-level';
import { ABILITY_NAMES, SKILL_NAMES } from '@/lib/dnd-constants';
import { HIT_DIE_TYPES, type SrdClass } from '@/lib/types';
import {
  classToFormState,
  emptyClassFormState,
  formStateToPayload,
  type ClassFormState,
  type ClassPayload,
} from '@/lib/class-form';

// The phrases the seeded SRD classes use, so homebrew classes read the same way.
const ARMOR_SUGGESTIONS = ['Light armor', 'Medium armor', 'Heavy armor', 'Shields', 'All armor'];
const WEAPON_SUGGESTIONS = ['Simple weapons', 'Martial weapons'];

/** The JSON rule columns this form leaves alone, in the order the note names them. */
const UNEDITED_RULES = [
  { key: 'spellcasting', label: 'spellcasting' },
  { key: 'equipmentChoices', label: 'starting equipment' },
  { key: 'multiclassing', label: 'multiclassing' },
] as const;

/** "a", "a and b", "a, b and c". */
function joinNaturally(items: readonly string[]): string {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

interface ClassFormProps {
  /** When set, the form starts prefilled (edit mode). */
  initial?: SrdClass;
  submitting: boolean;
  submitLabel: string;
  onSubmit: (payload: ClassPayload) => void;
  onCancel: () => void;
}

/**
 * Create and edit form for homebrew classes, shared by the new and edit pages.
 * Validation and payload mapping live in `lib/class-form`, and the first error
 * shows as a toast.
 */
export default function ClassForm({
  initial,
  submitting,
  submitLabel,
  onSubmit,
  onCancel,
}: ClassFormProps) {
  // Seeded once. The features editor keys its rows on mount, so handing it a
  // different list later would pair those keys with the wrong rows.
  const [form, setForm] = useState<ClassFormState>(() =>
    initial ? classToFormState(initial) : emptyClassFormState()
  );
  // The values as loaded, so a save can tell skill fields the author changed
  // from ones they left alone. A new class has none.
  const [baseline] = useState<ClassFormState | undefined>(() =>
    initial ? classToFormState(initial) : undefined
  );

  // The API accepts d20 and d100 as a class hit die, and a select can't show a
  // value it has no option for. The extra comes from `initial`, not live state,
  // so it stays on offer after the author switches away from it.
  const hitDieOptions: string[] = [...HIT_DIE_TYPES];
  if (initial?.hitDie && !hitDieOptions.includes(initial.hitDie)) {
    hitDieOptions.push(initial.hitDie);
  }

  const uneditedRules = UNEDITED_RULES.filter(rule => initial?.[rule.key] != null).map(
    rule => rule.label
  );

  const update = <K extends keyof ClassFormState>(key: K, value: ClassFormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = formStateToPayload(form, baseline);
    if ('error' in result) {
      toast.error(result.error);
      return;
    }
    onSubmit(result.payload);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField
            label="Name"
            required
            value={form.name}
            onChange={e => update('name', e.target.value)}
          />
          <FormField
            as="select"
            label="Hit die"
            value={form.hitDie}
            onChange={e => update('hitDie', e.target.value)}
          >
            {hitDieOptions.map(die => (
              <option key={die} value={die}>
                {die}
              </option>
            ))}
          </FormField>
        </div>
        <FormField
          as="textarea"
          label="Description"
          rows={4}
          value={form.description}
          onChange={e => update('description', e.target.value)}
        />
      </section>

      <section className="space-y-4">
        <ToggleChips
          label="Primary abilities"
          options={ABILITY_NAMES}
          value={form.primaryAbilities}
          onChange={next => update('primaryAbilities', next)}
        />
        <ToggleChips
          label="Saving throws"
          options={ABILITY_NAMES}
          value={form.savingThrows}
          onChange={next => update('savingThrows', next)}
        />
      </section>

      <section className="space-y-4">
        <ToggleChips
          label="Skill choices"
          options={SKILL_NAMES}
          value={form.skillChoices}
          onChange={next => update('skillChoices', next)}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField
            label="Number of skill choices"
            type="number"
            min={0}
            max={18}
            helperText="How many of these skills a player picks"
            value={form.numSkillChoices}
            onChange={e => update('numSkillChoices', e.target.value)}
          />
        </div>
      </section>

      <section className="space-y-4">
        <TokenListEditor
          label="Armor proficiencies"
          value={form.armorProficiencies}
          onChange={next => update('armorProficiencies', next)}
          suggestions={ARMOR_SUGGESTIONS}
          helperText="Add one armor proficiency at a time. Press Enter or Add after each."
        />
        <TokenListEditor
          label="Weapon proficiencies"
          value={form.weaponProficiencies}
          onChange={next => update('weaponProficiencies', next)}
          suggestions={WEAPON_SUGGESTIONS}
          helperText="Add one weapon proficiency at a time. Press Enter or Add after each."
        />
        <TokenListEditor
          label="Tool proficiencies"
          value={form.toolProficiencies}
          onChange={next => update('toolProficiencies', next)}
          helperText="Add one tool at a time. Press Enter or Add after each."
        />
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField
          label="Subclass level"
          type="number"
          min={1}
          max={MAX_LEVEL}
          helperText="The level at which a character picks a subclass. Leave blank for none."
          value={form.subclassLevel}
          onChange={e => update('subclassLevel', e.target.value)}
        />
      </section>

      <section>
        <ClassFeaturesEditor value={form.features} onChange={next => update('features', next)} />
      </section>

      {uneditedRules.length > 0 && (
        <p className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm text-gray-600 dark:text-gray-300">
          {`This class also has ${joinNaturally(uneditedRules)} rules. This form doesn't edit them yet, and saving keeps them as they are.`}
        </p>
      )}

      <div className="flex gap-3 pt-2">
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
    </form>
  );
}
