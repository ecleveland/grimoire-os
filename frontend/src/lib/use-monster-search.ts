'use client';

import { useState } from 'react';
import { keepPreviousData } from '@tanstack/react-query';
import { useApiQuery } from '@/lib/query';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import type { SrdMonster, PaginatedResponse } from '@/lib/types';

/**
 * Debounced monster search against `/srd/monsters`, shared by the tracker's
 * lookup panel and the link-monster picker so the two can't drift. An empty
 * input clears the results without hitting the API. The last results stay on
 * screen while the next query loads, including the provider's retry after a
 * network or server error. Once that retry also fails, the list empties and a
 * toast reports it, deduped by id.
 */
export function useMonsterSearch(limit: number) {
  const [searchInput, setSearchInput] = useState('');
  const query = useDebouncedValue(searchInput.trim());
  const params = new URLSearchParams({ q: query, page: '1', limit: String(limit) });
  const search = useApiQuery<PaginatedResponse<SrdMonster>>(`/srd/monsters?${params}`, {
    enabled: query !== '',
    placeholderData: keepPreviousData,
    errorToast: { message: 'Failed to search monsters', id: 'lookup-search' },
  });
  const results = query ? (search.data?.data ?? []) : [];
  const total = query ? (search.data?.total ?? 0) : 0;
  const loading = query !== '' && search.isFetching;

  return { searchInput, setSearchInput, query, results, total, loading };
}
