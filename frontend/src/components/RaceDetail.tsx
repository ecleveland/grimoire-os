import Markdown from '@/components/Markdown';
import PrintToggle from '@/components/PrintToggle';
import type { SrdRace } from '@/lib/types';

const headingClass = 'text-sm font-medium text-gray-700 dark:text-gray-300';
const bodyTextClass = 'text-sm text-gray-600 dark:text-gray-400';

/** Races already reported for the id-less-trait invariant, keyed by race id. */
const reportedIdlessTraits = new Set<string>();

/**
 * Expanded race view shared by the race list cards and the race page:
 * description, ability bonuses, a chip per trait that adds it to the print set,
 * languages and the flavour paragraphs. Subraces stay with the race page, since
 * only the detail GET returns them.
 *
 * `headingLevel` places the sections under whatever the caller has above them:
 * a list card names the race in an h2, while the race page has only its h1.
 */
export default function RaceDetail({
  race,
  headingLevel = 3,
}: {
  race: SrdRace;
  headingLevel?: 2 | 3;
}) {
  // A row can reach here without its traits array when the API breaks its
  // contract, and losing the whole card over that hides the rest of the race.
  const traits = race.traits ?? [];

  // Every trait the API returns carries a row id, so an id-less one means the
  // backend contract regressed and its print toggle has quietly become an inert
  // chip. Nothing about the rendered card gives that away, so say it loudly.
  //
  // The check runs in the render body because the list page renders this as a
  // server component, where no effect ever runs. The set keeps a client
  // re-render, such as the race page's query resolving, from repeating the line.
  const idless = traits.filter(t => !t.id);
  if (idless.length > 0 && !reportedIdlessTraits.has(race.id)) {
    reportedIdlessTraits.add(race.id);
    console.error(
      'RaceDetail: race traits rendered without an id, print toggle unavailable (backend contract regression):',
      idless.map(t => t.name)
    );
  }

  const Heading = headingLevel === 2 ? 'h2' : 'h3';

  // Seeded SRD 5.2.1 species persist no ability bonuses at all, so the column
  // arrives as null however the type reads.
  const abilityBonuses = Object.entries(race.abilityBonuses ?? {});

  return (
    <div className="space-y-3">
      {race.description && (
        <p className="text-gray-600 dark:text-gray-400 text-sm">{race.description}</p>
      )}
      {abilityBonuses.length > 0 && (
        <div>
          <Heading className={headingClass}>Ability Bonuses</Heading>
          <div className="flex gap-2 mt-1">
            {abilityBonuses.map(([ability, bonus]) => (
              <span
                key={ability}
                className="text-xs px-2 py-0.5 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded"
              >
                {ability} +{bonus}
              </span>
            ))}
          </div>
        </div>
      )}
      {traits.length > 0 && (
        <div>
          <Heading className={headingClass}>Traits</Heading>
          <div className="mt-1 space-y-2">
            {traits.map(t => (
              <div key={t.id ?? t.name}>
                <span className="inline-flex items-center gap-1">
                  <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
                    {t.name}.
                  </span>
                  {t.id && <PrintToggle type="feature" id={t.id} name={t.name} />}
                </span>{' '}
                {t.description && <Markdown className="mt-0.5">{t.description}</Markdown>}
              </div>
            ))}
          </div>
        </div>
      )}
      <div>
        <Heading className={headingClass}>Languages</Heading>
        <p className={bodyTextClass}>{race.languages.join(', ')}</p>
      </div>
      {race.age && (
        <div>
          <Heading className={headingClass}>Age</Heading>
          <p className={bodyTextClass}>{race.age}</p>
        </div>
      )}
      {race.alignment && (
        <div>
          <Heading className={headingClass}>Alignment</Heading>
          <p className={bodyTextClass}>{race.alignment}</p>
        </div>
      )}
      {race.sizeDescription && (
        <div>
          <Heading className={headingClass}>Size</Heading>
          <p className={bodyTextClass}>{race.sizeDescription}</p>
        </div>
      )}
    </div>
  );
}
