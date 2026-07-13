import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useApiQuery,
  useApiQueryAll,
  useApiMutation,
  apiQueryKey,
  invalidateApiPath,
} from '../query';

function page<T>(data: T[], pageNum: number, lastPage: number) {
  return { data, total: 0, page: pageNum, lastPage };
}

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

  it('omits the toast options when an object errorToast has no id', async () => {
    mockApiFetch.mockRejectedValue(new Error('boom'));
    renderHook(() => useApiQuery('/oops', { errorToast: { message: 'Nope' } }), {
      wrapper: wrapperFor(makeClient()),
    });
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Nope', undefined));
  });

  it('toasts once per failure, not on every re-render while the error persists', async () => {
    mockApiFetch.mockRejectedValue(new Error('boom'));
    const { result, rerender } = renderHook(
      () => useApiQuery('/oops', { errorToast: { message: 'Nope', id: 'x' } }),
      { wrapper: wrapperFor(makeClient()) }
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockToastError).toHaveBeenCalledTimes(1);
    // A re-render recreates the inline object errorToast; the ref guard must
    // keep this from re-firing the toast/log for the same failure.
    rerender();
    rerender();
    expect(mockToastError).toHaveBeenCalledTimes(1);
  });

  it('re-fires the toast when a later refetch fails again', async () => {
    mockApiFetch.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(
      () => useApiQuery('/oops', { errorToast: { message: 'Nope', id: 'x' } }),
      { wrapper: wrapperFor(makeClient()) }
    );
    await waitFor(() => expect(mockToastError).toHaveBeenCalledTimes(1));
    await result.current.refetch();
    await waitFor(() => expect(mockToastError).toHaveBeenCalledTimes(2));
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

describe('useApiQueryAll', () => {
  it('fetches every page and returns the flattened rows in order', async () => {
    mockApiFetch
      .mockResolvedValueOnce(page([{ id: 'a' }, { id: 'b' }], 1, 3))
      .mockResolvedValueOnce(page([{ id: 'c' }], 2, 3))
      .mockResolvedValueOnce(page([{ id: 'd' }], 3, 3));

    const { result } = renderHook(() => useApiQueryAll<{ id: string }>('/srd/feats?limit=100'), {
      wrapper: wrapperFor(makeClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]);
    expect(mockApiFetch).toHaveBeenCalledWith('/srd/feats?limit=100&page=1');
    expect(mockApiFetch).toHaveBeenCalledWith('/srd/feats?limit=100&page=2');
    expect(mockApiFetch).toHaveBeenCalledWith('/srd/feats?limit=100&page=3');
  });

  it('makes no further requests when the first page is the last', async () => {
    mockApiFetch.mockResolvedValueOnce(page([{ id: 'a' }], 1, 1));

    const { result } = renderHook(() => useApiQueryAll<{ id: string }>('/srd/feats?limit=100'), {
      wrapper: wrapperFor(makeClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 'a' }]);
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });

  it('surfaces a fetch failure and toasts once', async () => {
    mockApiFetch.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(
      () =>
        useApiQueryAll('/srd/feats?limit=100', {
          errorToast: { message: 'Failed to load feats', id: 'load-origin-feats' },
        }),
      { wrapper: wrapperFor(makeClient()) }
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockToastError).toHaveBeenCalledWith('Failed to load feats', {
      id: 'load-origin-feats',
    });
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
