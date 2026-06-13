import Collapsible from '@/components/Collapsible';
import Markdown from '@/components/Markdown';
import PrintToggle from '@/components/PrintToggle';
import { fetchSrdList } from '@/lib/srd-server';
import type { SrdRace } from '@/lib/types';

// Public reference content, server-rendered for SEO and a content-first first
// paint (VEG-320). See src/lib/srd-server.ts for the caching/URL rationale.
export const dynamic = 'force-dynamic';

export default async function RaceListPage() {
  let races: SrdRace[];
  try {
    races = await fetchSrdList<SrdRace[]>('/srd/races');
  } catch (err) {
    console.error('Failed to load races:', err);
    return (
      <div className="text-red-600 dark:text-red-400">
        Failed to load races. Please try again later.
      </div>
    );
  }

  // Invariant: every trait from the API carries a row id (the races endpoint
  // includes trait rows), so each renders as a print toggle below. An id-less
  // trait silently degrades to an inert chip — surface it loudly, since a
  // backend contract regression here would otherwise drop toggles unnoticed.
  const idless = races.flatMap(race => race.traits).filter(t => !t.id);
  if (idless.length > 0) {
    console.error(
      'srd/races: race traits rendered without an id — print toggle unavailable (backend contract regression):',
      idless.map(t => t.name)
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Races</h1>
      <div className="space-y-4">
        {races.map(race => (
          <Collapsible
            key={race.id}
            summary={
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{race.name}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Speed: {race.speed} ft &middot; Size: {race.size}
                </p>
              </div>
            }
            headerAside={
              <PrintToggle type="race" id={race.id} name={race.name} className="mr-4 shrink-0" />
            }
          >
            {race.description && (
              <p className="text-gray-600 dark:text-gray-400 text-sm">{race.description}</p>
            )}
            {race.abilityBonuses && Object.keys(race.abilityBonuses).length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Ability Bonuses
                </h3>
                <div className="flex gap-2 mt-1">
                  {Object.entries(race.abilityBonuses).map(([ability, bonus]) => (
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
            {race.traits.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Traits</h3>
                <div className="mt-1 space-y-2">
                  {race.traits.map(t => (
                    <div key={t.name}>
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
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Languages</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {race.languages.join(', ')}
              </p>
            </div>
          </Collapsible>
        ))}
      </div>
    </div>
  );
}
