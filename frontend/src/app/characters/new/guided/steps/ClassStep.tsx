import FormField from '@/components/FormField';
import type { WizardStepProps } from './types';

/**
 * Step 1 — Class. Stub for VEG-379, which will replace the bare text input with
 * the SRD-driven class picker (hit die, saves, skill choices, proficiencies) and
 * grant autofill. For now it collects just enough (a class name) to exercise the
 * shell's required-choice gating and a minimal valid submission.
 */
export default function ClassStep({ value, onChange }: WizardStepProps) {
  return (
    <section aria-labelledby="step-class-heading" className="space-y-4">
      <h2 id="step-class-heading" className="text-xl font-semibold text-gray-900 dark:text-white">
        Class
      </h2>
      <FormField
        label="Class"
        required
        placeholder="e.g. Wizard"
        helperText="The full SRD class picker arrives in a later slice (VEG-379)."
        value={value.class}
        onChange={e => onChange({ class: e.target.value })}
      />
    </section>
  );
}
