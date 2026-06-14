import { describe, it, expect } from 'vitest';
import { render, screen, renderHook } from '@testing-library/react';
import { useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import QueryProvider, { makeQueryClient } from '../QueryProvider';

describe('makeQueryClient', () => {
  it('applies the app-wide query defaults', () => {
    const defaults = makeQueryClient().getDefaultOptions().queries;
    expect(defaults?.staleTime).toBe(60_000);
    expect(defaults?.retry).toBe(1);
    expect(defaults?.refetchOnWindowFocus).toBe(false);
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
