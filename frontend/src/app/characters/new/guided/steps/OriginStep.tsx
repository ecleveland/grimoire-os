import { useEffect } from 'react';
import { useApiQuery } from '@/lib/query';
import { SIZES, type Feature, type Size, type SrdBackground, type SrdRace } from '@/lib/types';
import SrdCombobox from '@/components/SrdCombobox';
import { useDraftGrants } from '../useCharacterDraft';
import type { WizardStepProps } from './types';

const summaryCard =
  'grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md border border-gray-200 p-3 text-sm dark:border-gray-700';

/**
 * Step 2 — Origin (VEG-380): background + species pickers. Selecting a background
 * folds its skill/tool proficiencies into the draft; selecting a species records
 * its name, speed, size, languages, and traits (as species-sourced features).
 *
 * Skills/proficiencies/languages are source-tagged grants (VEG-393): each picker
 * replaces only its own source slice via `reconcileSource`, so the compiled draft
 * fields reconcile by source — switching or clearing a background/species removes
 * exactly that source's grants (a class skill pick or the other source's grants
 * survive), and the identity guard makes re-entering the step idempotent without
 * step-local refs. Species traits are reconciled by their `source` tag the same
 * way they always have been (so the sheet groups them under Species Traits).
 *
 * Deferred by design: the background ability-score increase (no seeded data; the
 * Abilities step owns "+ background increases", VEG-381), starting equipment
 * (VEG-382), and the background feat / personality suggestions.
 */
export default function OriginStep({ value, onChange }: WizardStepProps) {
  const { reconcileSource } = useDraftGrants();
  const racesQuery = useApiQuery<SrdRace[]>('/srd/races');
  const backgroundsQuery = useApiQuery<SrdBackground[]>('/srd/backgrounds');
  const races = racesQuery.data ?? [];
  const backgrounds = backgroundsQuery.data ?? [];
  const selectedRace = races.find(r => r.name === value.race);
  const selectedBackground = backgrounds.find(b => b.name === value.background);

  // Species reconciliation. Languages are a source slice; the species' traits are
  // single-source features reconciled by their `source` tag (drop every
  // species-sourced feature, re-add the current species'), gated on a genuine
  // species change so a remount/re-render can't duplicate them.
  useEffect(() => {
    const raceNames = new Set(races.map(r => r.name));
    if (selectedRace) {
      const changed = reconcileSource('species', selectedRace.name, {
        languages: selectedRace.languages,
      });
      if (changed) {
        const traitFeatures: Feature[] = selectedRace.traits.map(t => ({
          name: t.name,
          description: t.description,
          source: selectedRace.name,
        }));
        const size = (SIZES as readonly string[]).includes(selectedRace.size)
          ? (selectedRace.size as Size)
          : value.size;
        onChange({
          features: [
            ...value.features.filter(f => !raceNames.has(f.source ?? '')),
            ...traitFeatures,
          ],
          speed: selectedRace.speed,
          size,
        });
      }
    } else if (reconcileSource('species', '', {})) {
      onChange({ features: value.features.filter(f => !raceNames.has(f.source ?? '')) });
    }
    // Keyed on the resolved species identity (and the race catalog it resolves
    // against); reading value.* here is intentional (current at run time).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRace?.name, races, reconcileSource, onChange]);

  // Background reconciliation: replace the background source slice with its
  // skill/tool proficiencies. Clearing/switching removes exactly this source's
  // grants; class skill picks (the 'class' slice) survive.
  useEffect(() => {
    reconcileSource(
      'background',
      selectedBackground?.id ?? '',
      selectedBackground
        ? {
            skills: selectedBackground.skillProficiencies,
            proficiencies: selectedBackground.toolProficiencies,
          }
        : {}
    );
  }, [selectedBackground?.id, reconcileSource]);

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
