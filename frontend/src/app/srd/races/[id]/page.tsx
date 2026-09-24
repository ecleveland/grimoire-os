'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import PrintToggle from '@/components/PrintToggle';
import RaceDetail from '@/components/RaceDetail';
import { useApiQuery } from '@/lib/query';
import type { SrdRace } from '@/lib/types';

const bodyTextClass = 'text-sm text-gray-600 dark:text-gray-400';

export default function RaceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const query = useApiQuery<SrdRace | null>(`/srd/races/${id}`, {
    errorToast: { message: 'Failed to load race', id: 'load-race' },
  });

  const race = query.data;

  const backLink = (
    <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
      <Link
        href="/srd/races"
        className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700"
      >
        ← Races
      </Link>
    </p>
  );

  // The API answers null for a race that isn't there. An error with nothing
  // loaded is a failed request, so the page offers a retry instead of calling
  // the race missing. A failed background refetch keeps the loaded race on screen.
  if (race === null) {
    return (
      <div>
        {backLink}
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400 mb-4">Race not found.</p>
          <Link
            href="/srd/races"
            className="px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Back to races
          </Link>
        </div>
      </div>
    );
  }

  if (query.isError && race === undefined) {
    return (
      <div>
        {backLink}
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400 mb-4">Failed to load race.</p>
          <button
            type="button"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (race === undefined) {
    return (
      <div>
        {backLink}
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading race…</p>
      </div>
    );
  }

  const subraces = race.subraces ?? [];

  return (
    <div>
      {backLink}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{race.name}</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Speed: {race.speed} ft &middot; Size: {race.size}
          </p>
        </div>
        <PrintToggle type="race" id={race.id} name={race.name} className="shrink-0" />
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        {/* Only the page h1 sits above the body, and Subraces below is an h2. */}
        <RaceDetail race={race} headingLevel={2} />
      </div>

      {subraces.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Subraces</h2>
          <ul className="mt-3 space-y-3">
            {subraces.map(sub => (
              <li
                key={sub.id}
                className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
              >
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{sub.name}</h3>
                {sub.description && <p className={`mt-1 ${bodyTextClass}`}>{sub.description}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
