import FormField from '@/components/FormField';
import type { CharacterFormValues } from '@/components/CharacterEditorForm';
import type { WizardStepProps } from './types';

/** Rows of the review summary — only choices the user has actually made are shown. */
function summaryRows(draft: CharacterFormValues): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [{ label: 'Class', value: draft.class }];
  if (draft.race) rows.push({ label: 'Species', value: draft.race });
  if (draft.background) rows.push({ label: 'Background', value: draft.background });
  if (draft.subclass) rows.push({ label: 'Subclass', value: draft.subclass });
  rows.push({ label: 'Level', value: String(draft.level) });
  return rows.filter(r => r.value.trim() !== '');
}

/**
 * Final step — name the character, review the assembled choices, and submit. The
 * shell owns the actual Create button (in its footer) and the POST; this step
 * collects the name (the last required field) and renders the summary. As the
 * per-step slices land, the summary will grow to cover their choices.
 */
export default function ReviewStep({ value, onChange }: WizardStepProps) {
  const rows = summaryRows(value);
  return (
    <section aria-labelledby="step-review-heading" className="space-y-4">
      <h2 id="step-review-heading" className="text-xl font-semibold text-gray-900 dark:text-white">
        Review &amp; create
      </h2>
      <FormField
        label="Character name"
        required
        placeholder="e.g. Mialee"
        value={value.name}
        onChange={e => onChange({ name: e.target.value })}
      />
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {rows.map(row => (
          <div key={row.label} className="contents">
            <dt className="text-gray-500 dark:text-gray-400">{row.label}</dt>
            <dd className="text-gray-900 dark:text-white">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
