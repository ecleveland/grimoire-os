'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import FormField from '@/components/FormField';
import FormCheckbox from '@/components/FormCheckbox';
import { ITEM_CATEGORIES, ITEM_RARITIES } from '@/lib/item-constants';
import type { SrdItem } from '@/lib/types';
import {
  emptyItemFormState,
  itemToFormState,
  formStateToPayload,
  type ItemFormState,
  type ItemPayload,
} from '@/lib/item-form';

interface ItemFormProps {
  /** When set, the form starts prefilled (edit mode). */
  initial?: SrdItem;
  submitting: boolean;
  submitLabel: string;
  onSubmit: (payload: ItemPayload) => void;
  onCancel: () => void;
}

/**
 * Create/edit form for homebrew items (VEG-296), shared by the new and edit
 * pages. Validation and payload mapping live in `lib/item-form`; the first
 * error is surfaced as a toast.
 */
export default function ItemForm({
  initial,
  submitting,
  submitLabel,
  onSubmit,
  onCancel,
}: ItemFormProps) {
  const [form, setForm] = useState<ItemFormState>(() =>
    initial ? itemToFormState(initial) : emptyItemFormState()
  );

  const update = <K extends keyof ItemFormState>(key: K, value: ItemFormState[K]) => {
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
            label="Category"
            required
            value={form.category}
            onChange={e => update('category', e.target.value)}
          >
            <option value="">— select —</option>
            {ITEM_CATEGORIES.map(c => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </FormField>
          <FormField
            as="select"
            label="Rarity"
            value={form.rarity}
            onChange={e => update('rarity', e.target.value)}
          >
            <option value="">— none —</option>
            {ITEM_RARITIES.map(r => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </FormField>
        </div>
      </section>

      <section className="flex flex-wrap gap-x-6 gap-y-2">
        <FormCheckbox
          label="Magic item"
          checked={form.isMagic}
          onChange={checked => update('isMagic', checked)}
        />
        <FormCheckbox
          label="Requires attunement"
          checked={form.requiresAttunement}
          onChange={checked => update('requiresAttunement', checked)}
        />
        <FormCheckbox
          label="Stealth disadvantage"
          checked={form.stealthDisadvantage}
          onChange={checked => update('stealthDisadvantage', checked)}
        />
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField
          label="Cost"
          placeholder="500 gp"
          value={form.cost}
          onChange={e => update('cost', e.target.value)}
        />
        <FormField
          label="Weight (lb.)"
          placeholder="2.5"
          value={form.weight}
          onChange={e => update('weight', e.target.value)}
        />
        <FormField
          label="Damage"
          placeholder="1d8"
          value={form.damage}
          onChange={e => update('damage', e.target.value)}
        />
        <FormField
          label="Damage type"
          placeholder="Slashing"
          value={form.damageType}
          onChange={e => update('damageType', e.target.value)}
        />
        <FormField
          label="Armor class"
          placeholder="14 + Dex modifier (max 2)"
          value={form.armorClass}
          onChange={e => update('armorClass', e.target.value)}
        />
        <FormField
          label="Strength requirement"
          placeholder="13"
          value={form.strengthRequirement}
          onChange={e => update('strengthRequirement', e.target.value)}
        />
      </section>

      <FormField
        label="Properties"
        helperText="Comma-separated, e.g. Finesse, Light"
        value={form.properties}
        onChange={e => update('properties', e.target.value)}
      />

      <FormField
        as="textarea"
        label="Description"
        rows={5}
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
