'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useListQuery } from '@/lib/query';
import Pagination from '@/components/Pagination';
import LoadingState from '@/components/LoadingState';
import LoadError from '@/components/LoadError';
import type { CharacterListItem } from '@/lib/types';

const LIMIT = 20;

export default function CharactersPage() {
  const [page, setPage] = useState(1);

  const list = useListQuery<CharacterListItem>(
    '/characters',
    { page, limit: LIMIT },
    { errorToast: { message: 'Failed to load characters', id: 'load-characters' } }
  );
  const characters = list.data?.data ?? [];
  const total = list.data?.total ?? 0;
  const lastPage = list.data?.lastPage ?? 1;

  // A Retry after a failed load keeps status 'error' while it runs, so the
  // loading view checks isFetching as well as isPending.
  if (list.isPending || (list.isError && list.isFetching && !list.data)) {
    return <LoadingState label="Loading characters..." />;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Characters</h1>
        <Link
          href="/characters/new"
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          New Character
        </Link>
      </div>

      {/* A background refetch that fails keeps the loaded rows, and the error
          toast reports it. */}
      {list.isError && !list.data ? (
        <LoadError message="Failed to load characters" onRetry={list.refetch} />
      ) : characters.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">
          No characters yet. Create one to get started!
        </p>
      ) : (
        <>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {characters.map(c => (
              <Link
                key={c.id}
                href={`/characters/${c.id}`}
                className="block p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-indigo-500 transition-colors"
              >
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">
                  {c.name}
                </h2>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  {c.race} {c.class}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Level {c.level}</p>
              </Link>
            ))}
          </div>
          <Pagination
            page={page}
            lastPage={lastPage}
            total={total}
            limit={LIMIT}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
