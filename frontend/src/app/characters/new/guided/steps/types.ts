import type { ReactNode } from 'react';
import type { CharacterFormValues } from '@/components/CharacterEditorForm';

/**
 * The closed set of guided-builder step ids, in SRD creation order. A union (not
 * a bare string) keeps `id`s unique-by-construction and lets future slices
 * deep-link / resume / analytics-tag by step without typo drift.
 */
export type WizardStepId = 'class' | 'origin' | 'abilities' | 'equipment' | 'spells' | 'review';

/**
 * Props every wizard step slice receives. Steps read their slice from `value`
 * (the whole in-progress draft) and write changes back via `onChange`, which
 * shallow-merges a partial into the draft. Keeping the contract uniform lets the
 * shell stay agnostic about what each step collects — the per-step slices
 * (VEG-379…383) plug in without the shell changing.
 */
export interface WizardStepProps {
  value: CharacterFormValues;
  onChange: (patch: Partial<CharacterFormValues>) => void;
}

/**
 * A step in the guided builder. The shell owns ordering, progress, and
 * navigation gating; each step only declares its title, whether it can be
 * skipped, the minimum required to advance/submit (`isValid`), and how it
 * renders.
 */
export interface WizardStepDef {
  id: WizardStepId;
  title: string;
  /**
   * Optional steps can be advanced past (Skip) without satisfying `isValid`.
   * Note: `isValid` does NOT gate an optional step (Skip always advances) — on
   * an optional step it only drives the progress-bar checkmark.
   */
  optional: boolean;
  /** Whether this step's minimum choice has been made for the given draft. */
  isValid: (draft: CharacterFormValues) => boolean;
  Component: (props: WizardStepProps) => ReactNode;
}
