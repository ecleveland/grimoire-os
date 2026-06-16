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
  /**
   * Steps whose "is this complete?" answer depends on data the draft alone can't
   * express — e.g. the Class step enforcing exactly `numSkillChoices` picks,
   * where the required count comes from async SRD data — report their validity
   * here. The shell prefers a reported value over the step def's `isValid`.
   * Pure steps can ignore this and rely on `isValid(draft)`.
   */
  onValidChange?: (valid: boolean) => void;
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
  /**
   * Default "is this step complete?" derived from the draft. A step may refine
   * this at runtime via `onValidChange` (see WizardStepProps); when it does, the
   * reported value wins.
   */
  isValid: (draft: CharacterFormValues) => boolean;
  /**
   * Whether this step is shown for the given draft (default: always shown). Lets
   * the shell drop steps that don't apply — e.g. the Spells step for a
   * non-spellcasting class.
   */
  isVisible?: (draft: CharacterFormValues) => boolean;
  Component: (props: WizardStepProps) => ReactNode;
}
