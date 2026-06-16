import { useEffect } from 'react';
import { useApiQuery } from '@/lib/query';
import { DIE_TYPES, type DieType, type SrdClass, type SrdSubclass } from '@/lib/types';
import {
  normalizeArmorProficiencies,
  type CharacterFormValues,
} from '@/components/CharacterEditorForm';
import SrdCombobox from '@/components/SrdCombobox';
import ToggleChips from '@/components/ToggleChips';
import type { WizardStepProps } from './types';

/** Class grants are authoritative in the guided flow: selecting a class replaces
 * the class-derived fields (saves, armor, weapon/tool profs, hit die,
 * spellcasting ability) and resets the choose-N skills + subclass for the new
 * class. This differs from the editor's additive `applyClassGrants` merge, which
 * is right for hand-editing an existing sheet but wrong for a fresh build where
 * switching class shouldn't leave the previous class's traits behind. */
function classGrants(c: SrdClass, prev: CharacterFormValues): Partial<CharacterFormValues> {
  const dieType = (DIE_TYPES as readonly string[]).includes(c.hitDie)
    ? (c.hitDie as DieType)
    : prev.hitDice.dieType;
  return {
    class: c.name,
    level: 1,
    savingThrows: [...c.savingThrows],
    armorTraining: normalizeArmorProficiencies(c.armorProficiencies),
    proficiencies: [...c.weaponProficiencies, ...c.toolProficiencies],
    hitDice: { ...prev.hitDice, dieType },
    spellcastingAbility: c.spellcasting?.ability ?? '',
    skills: [],
    subclass: '',
  };
}

/**
 * Step 1 — Class (VEG-379). Searchable SRD class picker; on selection it folds
 * the class's hit die, saves, and proficiencies into the draft and offers the
 * choose-N skill pool (count enforced) plus, for classes that pick a subclass at
 * level 1, an optional subclass picker. Records the spellcasting ability so the
 * shell can show/hide the later Spells step.
 */
export default function ClassStep({ value, onChange, onValidChange }: WizardStepProps) {
  const classesQuery = useApiQuery<SrdClass[]>('/srd/classes');
  const classes = classesQuery.data ?? [];
  const selectedClass = classes.find(c => c.name === value.class);

  // Subclasses are only chosen now when the class does so at level 1 (cleric,
  // sorcerer, warlock); otherwise the choice is deferred to a later level.
  const showSubclass = !!selectedClass && (selectedClass.subclassLevel ?? Infinity) <= 1;
  const subclassesQuery = useApiQuery<SrdSubclass[]>(
    `/srd/subclasses?classId=${selectedClass?.id ?? ''}`,
    { enabled: showSubclass }
  );
  const subclasses = subclassesQuery.data ?? [];

  const skillPool = selectedClass?.skillChoices ?? [];
  const numSkillChoices = selectedClass?.numSkillChoices ?? 0;
  const chosenPoolSkills = value.skills.filter(s => skillPool.includes(s));

  // Valid once a class is named and (for a recognized SRD class) exactly the
  // required number of skills are picked. A custom/homebrew class name has no
  // pool, so the count requirement is trivially met.
  const stepValid =
    value.class.trim() !== '' &&
    (numSkillChoices === 0 || chosenPoolSkills.length === numSkillChoices);

  useEffect(() => {
    onValidChange?.(stepValid);
  }, [stepValid, onValidChange]);

  const toggleSkill = (next: string[]) => {
    // Cap at the allowed count: ignore a pick that would exceed numSkillChoices.
    if (next.filter(s => skillPool.includes(s)).length > numSkillChoices) return;
    onChange({ skills: next });
  };

  return (
    <section aria-labelledby="step-class-heading" className="space-y-4">
      <h2 id="step-class-heading" className="text-xl font-semibold text-gray-900 dark:text-white">
        Class
      </h2>

      <SrdCombobox
        label="Class"
        required
        value={value.class}
        onChange={v => onChange({ class: v })}
        onSelect={opt => {
          const c = classes.find(x => x.id === opt.id);
          if (c) onChange(classGrants(c, value));
        }}
        options={classes.map(c => ({ id: c.id, name: c.name }))}
        loading={classesQuery.isLoading}
        placeholder="Search classes…"
        helperText="Pick your class — its hit die, saves, and proficiencies fill in automatically."
      />

      {selectedClass && (
        <>
          <fieldset
            aria-label="Class grants"
            className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md border border-gray-200 p-3 text-sm dark:border-gray-700"
          >
            <span className="text-gray-500 dark:text-gray-400">Hit die</span>
            <span className="text-gray-900 dark:text-white">{value.hitDice.dieType}</span>
            <span className="text-gray-500 dark:text-gray-400">Saving throws</span>
            <span className="text-gray-900 dark:text-white">
              {value.savingThrows.join(', ') || '—'}
            </span>
            <span className="text-gray-500 dark:text-gray-400">Armor</span>
            <span className="text-gray-900 dark:text-white">
              {value.armorTraining.join(', ') || '—'}
            </span>
            <span className="text-gray-500 dark:text-gray-400">Proficiencies</span>
            <span className="text-gray-900 dark:text-white">
              {value.proficiencies.join(', ') || '—'}
            </span>
            {value.spellcastingAbility && (
              <>
                <span className="text-gray-500 dark:text-gray-400">Spellcasting</span>
                <span className="text-gray-900 dark:text-white">
                  Spellcaster ({value.spellcastingAbility})
                </span>
              </>
            )}
          </fieldset>

          {skillPool.length > 0 && (
            <ToggleChips
              label="Skills"
              options={skillPool}
              value={value.skills}
              onChange={toggleSkill}
              highlight={skillPool}
              helperText={`Choose ${numSkillChoices}: ${chosenPoolSkills.length} of ${numSkillChoices} chosen`}
            />
          )}

          {showSubclass && (
            <SrdCombobox
              label="Subclass (optional)"
              value={value.subclass}
              onChange={v => onChange({ subclass: v })}
              onSelect={opt => onChange({ subclass: opt.name })}
              options={subclasses.map(s => ({ id: s.id, name: s.name }))}
              loading={subclassesQuery.isLoading}
              placeholder="Search subclasses…"
              helperText="Your class chooses a subclass at level 1."
            />
          )}
        </>
      )}
    </section>
  );
}
