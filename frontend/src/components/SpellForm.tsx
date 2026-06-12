'use client';

import { useId, useState } from 'react';
import { toast } from 'sonner';
import FormField from '@/components/FormField';
import { SPELL_SCHOOLS, SPELL_LEVELS } from '@/lib/spell-constants';
import type { SrdSpell } from '@/lib/types';
import {
  emptySpellFormState,
  spellToFormState,
  formStateToPayload,
  type SpellFormState,
  type SpellPayload,
} from '@/lib/spell-form';

interface SpellFormProps {
  /** When set, the form starts prefilled (edit mode). */
  initial?: SrdSpell;
  submitting: boolean;
  submitLabel: string;
  onSubmit: (payload: SpellPayload) => void;
  onCancel: () => void;
}

/**
 * Create/edit form for homebrew spells (VEG-294), shared by the new and edit
 * pages. Validation and payload mapping live in `lib/spell-form`; the first
 * error is surfaced as a toast.
 */
export default function SpellForm({
  initial,
  submitting,
  submitLabel,
  onSubmit,
  onCancel,
}: SpellFormProps) {
  const [form, setForm] = useState<SpellFormState>(() =>
    initial ? spellToFormState(initial) : emptySpellFormState()
  );

  const ritualId = useId();
  const concentrationId = useId();

  const update = <K extends keyof SpellFormState>(key: K, value: SpellFormState[K]) => {
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
            label="Level"
            required
            value={form.level}
            onChange={e => update('level', e.target.value)}
          >
            {SPELL_LEVELS.map(l => (
              <option key={l} value={l}>
                {l === 0 ? 'Cantrip' : `Level ${l}`}
              </option>
            ))}
          </FormField>
          <FormField
            as="select"
            label="School"
            required
            value={form.school}
            onChange={e => update('school', e.target.value)}
          >
            <option value="">— select —</option>
            {SPELL_SCHOOLS.map(s => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </FormField>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField
            label="Casting Time"
            required
            placeholder="1 action"
            value={form.castingTime}
            onChange={e => update('castingTime', e.target.value)}
          />
          <FormField
            label="Range"
            required
            placeholder="60 feet"
            value={form.range}
            onChange={e => update('range', e.target.value)}
          />
          <FormField
            label="Components"
            required
            placeholder="V, S, M"
            value={form.components}
            onChange={e => update('components', e.target.value)}
          />
          <FormField
            label="Duration"
            required
            placeholder="Instantaneous"
            value={form.duration}
            onChange={e => update('duration', e.target.value)}
          />
        </div>
      </section>

      <section className="flex flex-wrap gap-6">
        <label
          htmlFor={ritualId}
          className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
        >
          <input
            id={ritualId}
            type="checkbox"
            checked={form.ritual}
            onChange={e => update('ritual', e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          Ritual
        </label>
        <label
          htmlFor={concentrationId}
          className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
        >
          <input
            id={concentrationId}
            type="checkbox"
            checked={form.concentration}
            onChange={e => update('concentration', e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          Concentration
        </label>
      </section>

      <FormField
        label="Classes"
        helperText="Comma-separated, e.g. Bard, Cleric"
        value={form.classes}
        onChange={e => update('classes', e.target.value)}
      />

      <FormField
        as="textarea"
        label="Material"
        helperText="Required material components, if any"
        rows={2}
        value={form.material}
        onChange={e => update('material', e.target.value)}
      />

      <FormField
        as="textarea"
        label="Description"
        required
        rows={5}
        value={form.description}
        onChange={e => update('description', e.target.value)}
      />

      <FormField
        as="textarea"
        label="At Higher Levels"
        rows={2}
        value={form.higherLevels}
        onChange={e => update('higherLevels', e.target.value)}
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
