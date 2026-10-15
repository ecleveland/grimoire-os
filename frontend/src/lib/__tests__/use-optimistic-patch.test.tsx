import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ApiError } from '@/lib/api';
import { apiQueryKey } from '@/lib/query';
import { createTestQueryClient } from '@/test-utils/query';
import { useOptimisticPatch } from '../use-optimistic-patch';
import type { OptimisticPatchOptions } from '../use-optimistic-patch';

const mockApiFetch = vi.fn();
const mockToastError = vi.fn();

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  };
});
vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args) },
}));

const PATH = '/things/thing-1';
const CONFLICT = 'This thing was changed elsewhere.';

interface Thing {
  id: string;
  version: number;
}

interface ThingPatch {
  name: string;
}

function renderPatch(
  options: Partial<OptimisticPatchOptions<Thing, ThingPatch>> = {},
  client: QueryClient = createTestQueryClient()
) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const view = renderHook(
    () =>
      useOptimisticPatch<Thing, ThingPatch>(
        variables => mockApiFetch(PATH, { method: 'PATCH', body: JSON.stringify(variables) }),
        {
          path: PATH,
          conflictMessage: CONFLICT,
          errorMessage: 'Failed to update thing',
          ...options,
        }
      ),
    { wrapper }
  );
  return { ...view, client };
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockToastError.mockReset();
  // The hook logs failures through console.error; silence it so the error
  // cases don't spam the output.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('useOptimisticPatch', () => {
  it('calls onSuccess with the response and the variables and shows no toast', async () => {
    const updated = { id: 'thing-1', version: 8 };
    mockApiFetch.mockResolvedValue(updated);
    const onSuccess = vi.fn();
    const { result } = renderPatch({ onSuccess });

    act(() => result.current.mutate({ name: 'Orc' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(updated, { name: 'Orc' }));
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it('toasts the conflict message and invalidates the guarded query on a 409', async () => {
    mockApiFetch.mockRejectedValue(new ApiError(409, 'Conflict', { currentVersion: 9 }));
    const client = createTestQueryClient();
    client.setQueryData(apiQueryKey(PATH), { id: 'thing-1', version: 7 });
    const { result } = renderPatch({}, client);

    act(() => result.current.mutate({ name: 'Orc' }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith(CONFLICT));
    expect(mockToastError).toHaveBeenCalledTimes(1);
    expect(client.getQueryState(apiQueryKey(PATH))?.isInvalidated).toBe(true);
  });

  it('toasts the error message on a non-409 failure', async () => {
    mockApiFetch.mockRejectedValue(new Error('boom'));
    const { result } = renderPatch();

    act(() => result.current.mutate({ name: 'Orc' }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('boom'));
  });

  it('toasts the string fallback on a non-Error rejection', async () => {
    mockApiFetch.mockRejectedValue('boom');
    const { result } = renderPatch();

    act(() => result.current.mutate({ name: 'Orc' }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Failed to update thing'));
  });

  it('passes the variables to a function-form errorMessage', async () => {
    mockApiFetch.mockRejectedValue('boom');
    const errorMessage = vi.fn((variables: ThingPatch) => `Failed to rename to ${variables.name}`);
    const { result } = renderPatch({ errorMessage });

    act(() => result.current.mutate({ name: 'Orc' }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Failed to rename to Orc'));
    expect(errorMessage).toHaveBeenCalledWith({ name: 'Orc' });
  });
});
