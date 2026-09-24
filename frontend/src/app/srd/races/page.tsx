import Collapsible from '@/components/Collapsible';
import SrdCardFooter from '@/components/SrdCardFooter';
import RaceDetail from '@/components/RaceDetail';
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
            <RaceDetail race={race} />
            <SrdCardFooter href={`/srd/races/${race.id}`} kind="race" name={race.name} />
          </Collapsible>
        ))}
      </div>
    </div>
  );
}
