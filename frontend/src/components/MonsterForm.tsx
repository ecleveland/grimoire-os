'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import FormField from '@/components/FormField';
import { MONSTER_SIZES, MONSTER_TYPES } from '@/lib/monster-constants';
import type { MonsterAction, SrdMonster } from '@/lib/types';
import {
  emptyMonsterFormState,
  monsterToFormState,
  formStateToPayload,
  type MonsterFormState,
  type MonsterPayload,
} from '@/lib/monster-form';

const ABILITY_FIELDS = [
  { key: 'str', label: 'STR' },
  { key: 'dex', label: 'DEX' },
  { key: 'con', label: 'CON' },
  { key: 'int', label: 'INT' },
  { key: 'wis', label: 'WIS' },
  { key: 'cha', label: 'CHA' },
] as const;

interface MonsterFormProps {
  /** When set, the form starts prefilled (edit mode). */
  initial?: SrdMonster;
  submitting: boolean;
  submitLabel: string;
  onSubmit: (payload: MonsterPayload) => void;
  onCancel: () => void;
}

/**
 * Create/edit form for homebrew monsters (VEG-293), shared by the new and edit
 * pages. Validation and payload mapping live in `lib/monster-form`; the first
 * error is surfaced as a toast.
 */
export default function MonsterForm({
  initial,
  submitting,
  submitLabel,
  onSubmit,
  onCancel,
}: MonsterFormProps) {
  const [form, setForm] = useState<MonsterFormState>(() =>
    initial ? monsterToFormState(initial) : emptyMonsterFormState()
  );

  const update = <K extends keyof MonsterFormState>(key: K, value: MonsterFormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = formStateToPayload(form);
    if ('error' in result) {
      toast.error(result.error);
      return;
    }
    onSubmit(result.payload);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="space-y-4">
        <FormField
          label="Name"
          required
          value={form.name}
          onChange={e => update('name', e.target.value)}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField
            as="select"
            label="Size"
            required
            value={form.size}
            onChange={e => update('size', e.target.value)}
          >
            <option value="">— select —</option>
            {MONSTER_SIZES.map(s => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </FormField>
          <FormField
            as="select"
            label="Type"
            required
            value={form.type}
            onChange={e => update('type', e.target.value)}
          >
            <option value="">— select —</option>
            {MONSTER_TYPES.map(t => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </FormField>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField
            label="Subtype"
            value={form.subtype}
            onChange={e => update('subtype', e.target.value)}
          />
          <FormField
            label="Alignment"
            value={form.alignment}
            onChange={e => update('alignment', e.target.value)}
          />
        </div>
      </section>

      <section className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <FormField
          label="Armor Class"
          required
          inputMode="numeric"
          value={form.armorClass}
          onChange={e => update('armorClass', e.target.value)}
        />
        <FormField
          label="Armor type"
          placeholder="natural armor"
          value={form.armorType}
          onChange={e => update('armorType', e.target.value)}
        />
        <FormField
          label="Hit Points"
          required
          inputMode="numeric"
          value={form.hitPoints}
          onChange={e => update('hitPoints', e.target.value)}
        />
        <FormField
          label="Hit dice"
          placeholder="8d10 + 40"
          value={form.hitDice}
          onChange={e => update('hitDice', e.target.value)}
        />
        <FormField
          label="Speed"
          required
          placeholder="30 ft."
          value={form.speed}
          onChange={e => update('speed', e.target.value)}
        />
      </section>

      <section>
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Ability scores
        </h3>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {ABILITY_FIELDS.map(a => (
            <FormField
              key={a.key}
              label={a.label}
              required
              inputMode="numeric"
              value={form[a.key]}
              onChange={e => update(a.key, e.target.value)}
            />
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField
          label="Saving throws"
          helperText='e.g. "str +7, con +9"'
          value={form.savingThrows}
          onChange={e => update('savingThrows', e.target.value)}
        />
        <FormField
          label="Skills"
          helperText='e.g. "perception +2, stealth +4"'
          value={form.skills}
          onChange={e => update('skills', e.target.value)}
        />
        <FormField
          label="Damage resistances"
          helperText="Comma-separated"
          value={form.damageResistances}
          onChange={e => update('damageResistances', e.target.value)}
        />
        <FormField
          label="Damage immunities"
          helperText="Comma-separated"
          value={form.damageImmunities}
          onChange={e => update('damageImmunities', e.target.value)}
        />
        <FormField
          label="Damage vulnerabilities"
          helperText="Comma-separated"
          value={form.damageVulnerabilities}
          onChange={e => update('damageVulnerabilities', e.target.value)}
        />
        <FormField
          label="Condition immunities"
          helperText="Comma-separated"
          value={form.conditionImmunities}
          onChange={e => update('conditionImmunities', e.target.value)}
        />
        <FormField
          label="Senses"
          placeholder="darkvision 60 ft., passive Perception 12"
          value={form.senses}
          onChange={e => update('senses', e.target.value)}
        />
        <FormField
          label="Languages"
          placeholder="Common, Giant"
          value={form.languages}
          onChange={e => update('languages', e.target.value)}
        />
        <FormField
          label="Challenge Rating"
          required
          helperText='Number or fraction, e.g. "1/4"'
          value={form.challengeRating}
          onChange={e => update('challengeRating', e.target.value)}
        />
        <FormField
          label="XP"
          inputMode="numeric"
          value={form.experiencePoints}
          onChange={e => update('experiencePoints', e.target.value)}
        />
      </section>

      <ActionListEditor
        title="Traits"
        kind="trait"
        items={form.specialAbilities}
        onChange={items => update('specialAbilities', items)}
      />
      <ActionListEditor
        title="Actions"
        kind="action"
        items={form.actions}
        onChange={items => update('actions', items)}
      />
      <ActionListEditor
        title="Reactions"
        kind="reaction"
        items={form.reactions}
        onChange={items => update('reactions', items)}
      />
      <ActionListEditor
        title="Legendary Actions"
        kind="legendary action"
        items={form.legendaryActions}
        onChange={items => update('legendaryActions', items)}
      />

      <FormField
        as="textarea"
        label="Description"
        rows={3}
        value={form.description}
        onChange={e => update('description', e.target.value)}
      />

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

function ActionListEditor({
  title,
  kind,
  items,
  onChange,
}: {
  title: string;
  /** Singular noun used in labels, e.g. "action" -> "Action name", "Add action". */
  kind: string;
  items: MonsterAction[];
  onChange: (items: MonsterAction[]) => void;
}) {
  const kindLabel = kind.charAt(0).toUpperCase() + kind.slice(1);

  const updateItem = (index: number, patch: Partial<MonsterAction>) => {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  return (
    <section className="border-t border-gray-100 dark:border-gray-700 pt-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">{title}</h3>
        <button
          type="button"
          onClick={() => onChange([...items, { name: '', description: '' }])}
          className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          {`Add ${kind}`}
        </button>
      </div>
      <div className="space-y-3">
        {items.map((item, i) => (
          <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-2 items-start">
            <FormField
              label={`${kindLabel} name`}
              value={item.name}
              onChange={e => updateItem(i, { name: e.target.value })}
            />
            <FormField
              label={`${kindLabel} description`}
              value={item.description}
              onChange={e => updateItem(i, { description: e.target.value })}
            />
            <button
              type="button"
              aria-label={`Remove ${kind} ${i + 1}`}
              onClick={() => onChange(items.filter((_, idx) => idx !== i))}
              className="mt-6 px-2 py-1.5 text-sm text-red-600 dark:text-red-400 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
