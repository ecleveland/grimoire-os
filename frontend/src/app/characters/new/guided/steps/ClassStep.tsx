import { useEffect } from 'react';
import { useApiQuery } from '@/lib/query';
import { asDieType, type SrdClass, type SrdSubclass } from '@/lib/types';
import { normalizeArmorProficiencies } from '@/components/CharacterEditorForm';
import SrdCombobox from '@/components/SrdCombobox';
import ToggleChips from '@/components/ToggleChips';
import { useDraftGrants } from '../useCharacterDraft';
import type { WizardStepProps } from './types';

/**
 * Step 1 — Class (VEG-379). Searchable SRD class picker; on selection it folds
 * the class's hit die, saves, and proficiencies into the draft and offers the
 * choose-N skill pool (count enforced) plus, for classes that pick a subclass at
 * level 1, an optional subclass picker. Records the spellcasting ability so the
 * shell can show/hide the later Spells step.
 */
export default function ClassStep({ value, onChange, onValidChange }: WizardStepProps) {
  const { grants, reconcileSource, setSourceField } = useDraftGrants();
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
  // The class owns the choose-N skill picks as its own grant slice, so they
  // survive a background switch and don't double-count a background-granted skill
  // that happens to be in the pool.
  const classSkills = grants.class?.skills ?? [];
  const chosenPoolSkills = classSkills.filter(s => skillPool.includes(s));

  // Reconcile the class-derived grants whenever the resolved SRD class changes —
  // whether the user clicked an option or typed the name exactly. Keyed off the
  // resolved class id; the registry's identity guard applies once per class (and
  // survives this step remounting on navigation, so revisiting Class no longer
  // wipes the picked skills/subclass). When the name no longer matches an SRD
  // class (custom/homebrew entry), drop the previous class's grants.
  useEffect(() => {
    if (selectedClass) {
      const changed = reconcileSource('class', selectedClass.id, {
        proficiencies: [...selectedClass.weaponProficiencies, ...selectedClass.toolProficiencies],
        skills: [],
      });
      if (changed) {
        const dieType = asDieType(selectedClass.hitDie) ?? value.hitDice.dieType;
        onChange({
          level: 1,
          savingThrows: [...selectedClass.savingThrows],
          armorTraining: normalizeArmorProficiencies(selectedClass.armorProficiencies),
          hitDice: { ...value.hitDice, dieType },
          spellcastingAbility: selectedClass.spellcasting?.ability ?? '',
          subclass: '',
        });
      }
    } else if (reconcileSource('class', '', {})) {
      onChange({ savingThrows: [], armorTraining: [], spellcastingAbility: '', subclass: '' });
    }
    // Keyed on the resolved class identity only; reading value.* here is
    // intentional (it is current when the effect runs on an identity change).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClass?.id, reconcileSource, onChange]);

  // The class-name gate lives in the step def's isValid; this reports the extra
  // SRD-derived rule: an unrecognized class has no pool (count trivially met),
  // a recognized one needs exactly numSkillChoices picks.
  const skillsComplete = numSkillChoices === 0 || chosenPoolSkills.length === numSkillChoices;
  useEffect(() => {
    onValidChange?.(skillsComplete);
  }, [skillsComplete, onValidChange]);

  const toggleSkill = (next: string[]) => {
    const picks = next.filter(s => skillPool.includes(s));
    // Cap at the allowed count: ignore a pick that would exceed numSkillChoices.
    if (picks.length > numSkillChoices) return;
    setSourceField('class', 'skills', picks);
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
        // Just set the name on change/pick; the effect above reconciles the
        // grants once value.class resolves to (or away from) an SRD class.
        onChange={v => onChange({ class: v })}
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
              value={classSkills}
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
