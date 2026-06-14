import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useApiQuery, useApiMutation, apiQueryKey, invalidateApiPath } from '../query';

const mockApiFetch = vi.fn();
const mockToastError = vi.fn();

vi.mock('../api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));
vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args) },
}));

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockToastError.mockReset();
});

describe('apiQueryKey', () => {
  it('namespaces the full path under an "api" root', () => {
    expect(apiQueryKey('/srd/monsters?page=2')).toEqual(['api', '/srd/monsters?page=2']);
  });
});

describe('useApiQuery', () => {
  it('calls apiFetch with the path and exposes the resolved data', async () => {
    mockApiFetch.mockResolvedValue({ hello: 'world' });
    const { result } = renderHook(() => useApiQuery<{ hello: string }>('/thing'), {
      wrapper: wrapperFor(makeClient()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ hello: 'world' });
    expect(mockApiFetch).toHaveBeenCalledWith('/thing');
  });

  it('does not fetch while disabled via enabled:false', async () => {
    mockApiFetch.mockResolvedValue({});
    renderHook(() => useApiQuery('/gated', { enabled: false }), {
      wrapper: wrapperFor(makeClient()),
    });
    // Give react-query a tick; nothing should fire.
    await new Promise(r => setTimeout(r, 10));
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('fires the errorToast (string form) when the query errors', async () => {
    mockApiFetch.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(
      () => useApiQuery('/oops', { errorToast: 'Failed to load thing' }),
      { wrapper: wrapperFor(makeClient()) }
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Failed to load thing'));
  });

  it('passes the toast id through when errorToast is an object', async () => {
    mockApiFetch.mockRejectedValue(new Error('boom'));
    renderHook(() => useApiQuery('/oops', { errorToast: { message: 'Nope', id: 'load-thing' } }), {
      wrapper: wrapperFor(makeClient()),
    });
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Nope', { id: 'load-thing' }));
  });

  it('does not toast on success', async () => {
    mockApiFetch.mockResolvedValue({});
    const { result } = renderHook(() => useApiQuery('/ok', { errorToast: 'x' }), {
      wrapper: wrapperFor(makeClient()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockToastError).not.toHaveBeenCalled();
  });
});

describe('useApiMutation', () => {
  it('runs the mutationFn and resolves with its result', async () => {
    mockApiFetch.mockResolvedValue({ ok: true });
    const { result } = renderHook(
      () => useApiMutation((id: string) => mockApiFetch(`/del/${id}`, { method: 'DELETE' })),
      { wrapper: wrapperFor(makeClient()) }
    );
    const data = await result.current.mutateAsync('abc');
    expect(data).toEqual({ ok: true });
    expect(mockApiFetch).toHaveBeenCalledWith('/del/abc', { method: 'DELETE' });
  });
});

describe('invalidateApiPath', () => {
  it('invalidates only cached queries whose path starts with the prefix', async () => {
    const client = makeClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    // Seed two cached entries under different paths.
    client.setQueryData(apiQueryKey('/srd/monsters?page=1'), { data: [] });
    client.setQueryData(apiQueryKey('/notes?campaignId=1'), { data: [] });

    await invalidateApiPath(client, '/srd/monsters?');

    expect(spy).toHaveBeenCalledTimes(1);
    const predicate = spy.mock.calls[0][0]?.predicate;
    expect(predicate).toBeTypeOf('function');
    // The predicate matches the monsters entry but not the notes entry.
    expect(predicate!({ queryKey: apiQueryKey('/srd/monsters?page=1') } as never)).toBe(true);
    expect(predicate!({ queryKey: apiQueryKey('/notes?campaignId=1') } as never)).toBe(false);
  });
});
