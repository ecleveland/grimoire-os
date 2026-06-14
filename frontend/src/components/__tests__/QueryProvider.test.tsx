import { describe, it, expect } from 'vitest';
import { render, screen, renderHook } from '@testing-library/react';
import { useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import QueryProvider, { makeQueryClient } from '../QueryProvider';
import { ApiError } from '@/lib/api';

describe('makeQueryClient', () => {
  it('applies the app-wide query defaults', () => {
    const defaults = makeQueryClient().getDefaultOptions().queries;
    expect(defaults?.staleTime).toBe(60_000);
    expect(defaults?.refetchOnWindowFocus).toBe(false);
    expect(defaults?.retry).toBeTypeOf('function');
  });

  it('retries network errors once but never deterministic 4xx', () => {
    const retry = makeQueryClient().getDefaultOptions().queries?.retry as (
      n: number,
      e: Error
    ) => boolean;
    // Network blip / generic error: one retry.
    expect(retry(0, new Error('network'))).toBe(true);
    expect(retry(1, new Error('network'))).toBe(false);
    // 5xx is transient — retry it.
    expect(retry(0, new ApiError(500, 'boom'))).toBe(true);
    // 4xx is deterministic — surface immediately, no retry.
    expect(retry(0, new ApiError(404, 'not found'))).toBe(false);
    expect(retry(0, new ApiError(409, 'conflict'))).toBe(false);
  });
});

describe('QueryProvider', () => {
  it('renders its children', () => {
    render(
      <QueryProvider>
        <span>child content</span>
      </QueryProvider>
    );
    expect(screen.getByText('child content')).toBeInTheDocument();
  });

  it('exposes a QueryClient to descendants', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryProvider>{children}</QueryProvider>
    );
    const { result } = renderHook(() => useQueryClient(), { wrapper });
    expect(result.current).toBeDefined();
    expect(result.current.getDefaultOptions().queries?.staleTime).toBe(60_000);
  });
});
