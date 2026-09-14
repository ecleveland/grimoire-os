'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import ClassFeaturesEditor from '@/components/ClassFeaturesEditor';
import FormField from '@/components/FormField';
import {
  emptySubclassFormState,
  formStateToPayload,
  subclassToFormState,
  type SubclassFormState,
  type SubclassPayload,
} from '@/lib/subclass-form';
import type { SrdSubclass } from '@/lib/types';

interface SubclassFormProps {
  /** When set, the form starts prefilled (edit mode). */
  initial?: SrdSubclass;
  submitting: boolean;
  submitLabel: string;
  onSubmit: (payload: SubclassPayload) => void;
  onCancel: () => void;
}

/**
 * Create and edit form for homebrew subclasses, rendered inline on the class
 * page. Validation and payload mapping live in `lib/subclass-form`, and the
 * first error shows as a toast. Same shape as `ClassForm`, one entity down.
 */
export default function SubclassForm({
  initial,
  submitting,
  submitLabel,
  onSubmit,
  onCancel,
}: SubclassFormProps) {
  // The loaded form state, so a save can tell what the author changed. A new
  // subclass has none. Frozen on mount: the class page keeps its query mounted,
  // so a background refetch hands over a new `initial`, and neither the edit nor
  // what a save compares against may swap under the author.
  const [baseline] = useState<SubclassFormState | undefined>(() =>
    initial ? subclassToFormState(initial) : undefined
  );
  // Seeded once from the loaded state. The features editor keys its rows on
  // mount, so handing it a different list later would pair those keys with the
  // wrong rows. Nothing mutates state in place, so sharing the baseline's arrays
  // is safe.
  const [form, setForm] = useState<SubclassFormState>(() => baseline ?? emptySubclassFormState());

  const update = <K extends keyof SubclassFormState>(key: K, value: SubclassFormState[K]) => {
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
    <form onSubmit={handleSubmit} className="space-y-4">
      <FormField
        label="Name"
        required
        value={form.name}
        onChange={e => update('name', e.target.value)}
      />
      <FormField
        as="textarea"
        label="Description"
        rows={3}
        value={form.description}
        onChange={e => update('description', e.target.value)}
      />
      <ClassFeaturesEditor value={form.features} onChange={next => update('features', next)} />

      <div className="flex gap-3 pt-1">
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
