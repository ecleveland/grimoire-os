'use client';

import { useState } from 'react';
import { useApiQuery } from '@/lib/query';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import type { SrdMonster, PaginatedResponse } from '@/lib/types';

/**
 * Debounced monster search against `/srd/monsters`, shared by the tracker's
 * lookup panel and the link-monster picker so the two can't drift. An empty
 * input clears the results without hitting the API. A query only ever shows
 * its own cached rows, never an earlier search's, so a stale row can't be
 * picked while the next search loads. A network or server error gets the
 * provider's one retry, and once that also fails the list stays empty and a
 * toast reports it, deduped by id.
 */
export function useMonsterSearch(limit: number) {
  const [searchInput, setSearchInput] = useState('');
  const query = useDebouncedValue(searchInput.trim());
  const params = new URLSearchParams({ q: query, page: '1', limit: String(limit) });
  const search = useApiQuery<PaginatedResponse<SrdMonster>>(`/srd/monsters?${params}`, {
    enabled: query !== '',
    errorToast: { message: 'Failed to search monsters', id: 'lookup-search' },
  });
  const results = query ? (search.data?.data ?? []) : [];
  const total = query ? (search.data?.total ?? 0) : 0;
  const loading = query !== '' && search.isFetching;

  return { searchInput, setSearchInput, query, results, total, loading };
}
