'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import type { SrdMonster, PaginatedResponse } from '@/lib/types';

/**
 * Debounced monster search against `/srd/monsters` (VEG-259), shared by the
 * tracker's lookup panel and the link-monster picker (VEG-328) so the two
 * can't drift. An empty input clears the results without hitting the API;
 * a failed search toasts (deduped by id) and leaves the previous results.
 */
export function useMonsterSearch(limit: number) {
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SrdMonster[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce the raw input into the query that drives the fetch.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setQuery(searchInput.trim()), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  // Only hit the API once there's something to search for.
  useEffect(() => {
    if (!query) {
      setResults([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    const params = new URLSearchParams({ q: query, page: '1', limit: String(limit) });
    apiFetch<PaginatedResponse<SrdMonster>>(`/srd/monsters?${params.toString()}`)
      .then(res => {
        setResults(res.data);
        setTotal(res.total);
      })
      .catch(err => {
        console.error('Failed to search monsters:', err);
        toast.error('Failed to search monsters', { id: 'lookup-search' });
      })
      .finally(() => setLoading(false));
  }, [query, limit]);

  return { searchInput, setSearchInput, query, results, total, loading };
}
