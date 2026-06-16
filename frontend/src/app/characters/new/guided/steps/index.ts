import type { CharacterFormValues } from '@/components/CharacterEditorForm';
import type { WizardStepDef } from './types';
import ClassStep from './ClassStep';
import OriginStep from './OriginStep';
import AbilitiesStep from './AbilitiesStep';
import EquipmentStep from './EquipmentStep';
import SpellsStep from './SpellsStep';
import ReviewStep from './ReviewStep';

const isNonEmpty = (s: string) => s.trim() !== '';

/** A class is a spellcaster once its selection has recorded a spellcasting
 * ability (written by the Class step). Drives whether the Spells step is shown. */
export const isSpellcaster = (d: CharacterFormValues) => isNonEmpty(d.spellcastingAbility);

/**
 * The guided builder steps, in SRD creation order. The shell drives ordering,
 * progress, gating, and submission off this list — adding/replacing a slice is a
 * matter of editing the relevant step file, not the shell.
 */
export const STEPS: WizardStepDef[] = [
  {
    id: 'class',
    title: 'Class',
    optional: false,
    isValid: (d: CharacterFormValues) => isNonEmpty(d.class),
    Component: ClassStep,
  },
  { id: 'origin', title: 'Origin', optional: true, isValid: () => true, Component: OriginStep },
  {
    id: 'abilities',
    title: 'Abilities',
    optional: true,
    isValid: () => true,
    Component: AbilitiesStep,
  },
  {
    id: 'equipment',
    title: 'Equipment',
    optional: true,
    isValid: () => true,
    Component: EquipmentStep,
  },
  {
    id: 'spells',
    title: 'Spells',
    optional: true,
    isValid: () => true,
    isVisible: isSpellcaster,
    Component: SpellsStep,
  },
  {
    id: 'review',
    title: 'Review',
    optional: false,
    isValid: (d: CharacterFormValues) => isNonEmpty(d.name),
    Component: ReviewStep,
  },
];

export type { WizardStepDef, WizardStepProps, WizardStepId } from './types';
