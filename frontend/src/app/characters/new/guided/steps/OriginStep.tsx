import { useEffect, useRef } from 'react';
import { useApiQuery } from '@/lib/query';
import { SIZES, type Feature, type Size, type SrdBackground, type SrdRace } from '@/lib/types';
import SrdCombobox from '@/components/SrdCombobox';
import type { WizardStepProps } from './types';

/** Append additions not already present; report which were newly added (so a
 * later switch can remove exactly this source's contribution). */
function mergeUnique(
  current: string[],
  additions: string[]
): { merged: string[]; added: string[] } {
  const have = new Set(current);
  const added = additions.filter(a => !have.has(a));
  return { merged: added.length ? [...current, ...added] : current, added };
}

const summaryCard =
  'grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md border border-gray-200 p-3 text-sm dark:border-gray-700';

/**
 * Step 2 — Origin (VEG-380): background + species pickers. Selecting a background
 * folds its skill/tool proficiencies into the draft; selecting a species records
 * its name, speed, size, languages, and traits (as species-sourced features).
 * Grants from class + background + species are union-merged and de-duplicated,
 * and each picker tracks its own contribution so switching a pick cleanly
 * replaces it (class skill picks and the other source's grants are preserved).
 *
 * Deferred by design: the background ability-score increase (no seeded data; the
 * Abilities step owns "+ background increases", VEG-381), starting equipment
 * (VEG-382), and the background feat / personality suggestions.
 */
export default function OriginStep({ value, onChange }: WizardStepProps) {
  const racesQuery = useApiQuery<SrdRace[]>('/srd/races');
  const backgroundsQuery = useApiQuery<SrdBackground[]>('/srd/backgrounds');
  const races = racesQuery.data ?? [];
  const backgrounds = backgroundsQuery.data ?? [];
  const selectedRace = races.find(r => r.name === value.race);
  const selectedBackground = backgrounds.find(b => b.name === value.background);

  // Species reconciliation. Track the languages this species added and its name
  // (which sources its trait-features) so a switch removes exactly those.
  const appliedRace = useRef<{ name: string; langs: string[] } | null>(null);
  useEffect(() => {
    if (selectedRace) {
      if (appliedRace.current?.name !== selectedRace.name) {
        const prev = appliedRace.current;
        const baseLangs = prev
          ? value.languages.filter(l => !prev.langs.includes(l))
          : value.languages;
        const baseFeatures = prev
          ? value.features.filter(f => f.source !== prev.name)
          : value.features;
        const langs = mergeUnique(baseLangs, selectedRace.languages);
        const traitFeatures: Feature[] = selectedRace.traits.map(t => ({
          name: t.name,
          description: t.description,
          source: selectedRace.name,
        }));
        const size = (SIZES as readonly string[]).includes(selectedRace.size)
          ? (selectedRace.size as Size)
          : value.size;
        appliedRace.current = { name: selectedRace.name, langs: langs.added };
        onChange({
          languages: langs.merged,
          features: [...baseFeatures, ...traitFeatures],
          speed: selectedRace.speed,
          size,
        });
      }
    } else if (appliedRace.current) {
      const prev = appliedRace.current;
      appliedRace.current = null;
      onChange({
        languages: value.languages.filter(l => !prev.langs.includes(l)),
        features: value.features.filter(f => f.source !== prev.name),
      });
    }
  }, [selectedRace, value, onChange]);

  // Background reconciliation. Track the skills/proficiencies this background
  // added so a switch removes exactly those (class skill picks survive).
  const appliedBg = useRef<{ id: string; skills: string[]; profs: string[] } | null>(null);
  useEffect(() => {
    if (selectedBackground) {
      if (appliedBg.current?.id !== selectedBackground.id) {
        const prev = appliedBg.current;
        const baseSkills = prev ? value.skills.filter(s => !prev.skills.includes(s)) : value.skills;
        const baseProfs = prev
          ? value.proficiencies.filter(p => !prev.profs.includes(p))
          : value.proficiencies;
        const skills = mergeUnique(baseSkills, selectedBackground.skillProficiencies);
        const profs = mergeUnique(baseProfs, selectedBackground.toolProficiencies);
        appliedBg.current = { id: selectedBackground.id, skills: skills.added, profs: profs.added };
        onChange({ skills: skills.merged, proficiencies: profs.merged });
      }
    } else if (appliedBg.current) {
      const prev = appliedBg.current;
      appliedBg.current = null;
      onChange({
        skills: value.skills.filter(s => !prev.skills.includes(s)),
        proficiencies: value.proficiencies.filter(p => !prev.profs.includes(p)),
      });
    }
  }, [selectedBackground, value, onChange]);

  return (
    <section aria-labelledby="step-origin-heading" className="space-y-4">
      <h2 id="step-origin-heading" className="text-xl font-semibold text-gray-900 dark:text-white">
        Origin
      </h2>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Your background and species. Their proficiencies, languages, and traits merge into your
        character.
      </p>

      <SrdCombobox
        label="Background"
        value={value.background}
        onChange={v => onChange({ background: v })}
        options={backgrounds.map(b => ({ id: b.id, name: b.name }))}
        loading={backgroundsQuery.isLoading}
        placeholder="Search backgrounds…"
        helperText="Grants skill and tool proficiencies."
      />
      {selectedBackground && (
        <fieldset className={summaryCard} aria-label="Background grants">
          <span className="text-gray-500 dark:text-gray-400">Skills</span>
          <span className="text-gray-900 dark:text-white">
            {selectedBackground.skillProficiencies.join(', ') || '—'}
          </span>
          <span className="text-gray-500 dark:text-gray-400">Tools</span>
          <span className="text-gray-900 dark:text-white">
            {selectedBackground.toolProficiencies.join(', ') || '—'}
          </span>
        </fieldset>
      )}

      <SrdCombobox
        label="Species"
        value={value.race}
        onChange={v => onChange({ race: v })}
        options={races.map(r => ({ id: r.id, name: r.name }))}
        loading={racesQuery.isLoading}
        placeholder="Search species…"
        helperText="Sets speed, size, languages, and species traits."
      />
      {selectedRace && (
        <fieldset className={summaryCard} aria-label="Species grants">
          <span className="text-gray-500 dark:text-gray-400">Speed</span>
          <span className="text-gray-900 dark:text-white">{value.speed} ft</span>
          <span className="text-gray-500 dark:text-gray-400">Size</span>
          <span className="text-gray-900 dark:text-white">{value.size}</span>
          <span className="text-gray-500 dark:text-gray-400">Languages</span>
          <span className="text-gray-900 dark:text-white">{value.languages.join(', ') || '—'}</span>
          <span className="text-gray-500 dark:text-gray-400">Traits</span>
          <span className="text-gray-900 dark:text-white">
            {selectedRace.traits.map(t => t.name).join(', ') || '—'}
          </span>
        </fieldset>
      )}
    </section>
  );
}
