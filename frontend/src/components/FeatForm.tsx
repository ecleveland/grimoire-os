'use client';

import { useId, useState } from 'react';
import { toast } from 'sonner';
import FormField from '@/components/FormField';
import { FEAT_CATEGORIES } from '@/lib/feat-constants';
import type { SrdFeat } from '@/lib/types';
import {
  emptyFeatFormState,
  featToFormState,
  formStateToPayload,
  type FeatFormState,
  type FeatPayload,
} from '@/lib/feat-form';

interface FeatFormProps {
  /** When set, the form starts prefilled (edit mode). */
  initial?: SrdFeat;
  submitting: boolean;
  submitLabel: string;
  onSubmit: (payload: FeatPayload) => void;
  onCancel: () => void;
}

/**
 * Create/edit form for homebrew feats (VEG-295), shared by the new and edit
 * pages. Validation and payload mapping live in `lib/feat-form`; the first
 * error is surfaced as a toast.
 */
export default function FeatForm({
  initial,
  submitting,
  submitLabel,
  onSubmit,
  onCancel,
}: FeatFormProps) {
  const [form, setForm] = useState<FeatFormState>(() =>
    initial ? featToFormState(initial) : emptyFeatFormState()
  );

  const repeatableId = useId();

  const update = <K extends keyof FeatFormState>(key: K, value: FeatFormState[K]) => {
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
            value={form.category}
            onChange={e => update('category', e.target.value)}
          >
            <option value="">— none —</option>
            {FEAT_CATEGORIES.map(c => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </FormField>
          <FormField
            label="Prerequisite"
            placeholder="Level 4+, Strength 13+"
            value={form.prerequisite}
            onChange={e => update('prerequisite', e.target.value)}
          />
        </div>
      </section>

      <section>
        <label
          htmlFor={repeatableId}
          className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
        >
          <input
            id={repeatableId}
            type="checkbox"
            checked={form.repeatable}
            onChange={e => update('repeatable', e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          Repeatable
        </label>
      </section>

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
        label="Benefits"
        helperText="One benefit per line, shown as a bulleted list"
        rows={4}
        value={form.benefits}
        onChange={e => update('benefits', e.target.value)}
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
