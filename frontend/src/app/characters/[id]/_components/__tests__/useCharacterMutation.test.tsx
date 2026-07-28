import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useCharacterMutation, resolvePlayControls } from '../useCharacterMutation';
import type { Character } from '@/lib/types';

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

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function makeCharacter(over: Partial<Character> = {}): Character {
  return { id: 'char-1', version: 7, ...over } as Character;
}

function renderMutation(character: Character, client: QueryClient = makeClient()) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const view = renderHook(() => useCharacterMutation(character), { wrapper });
  return { ...view, client };
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockToastError.mockReset();
  // The hook logs failures via console.error (project convention); silence it
  // so the error-path tests don't spam output.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('useCharacterMutation onSuccess callback (VEG-487)', () => {
  it('runs the per-call onSuccess only after the write resolves', async () => {
    let resolveWrite: (value: Character) => void = () => {};
    mockApiFetch.mockReturnValue(
      new Promise<Character>(resolve => {
        resolveWrite = resolve;
      })
    );
    const onSuccess = vi.fn();
    const { result } = renderMutation(makeCharacter());

    act(() => result.current.patch({ heroicInspiration: true }, { onSuccess }));

    // In flight — a summary toast fired here would claim a write that may 409.
    expect(onSuccess).not.toHaveBeenCalled();

    act(() => resolveWrite(makeCharacter({ version: 8 })));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
  });

  it('does not run onSuccess when the write fails', async () => {
    mockApiFetch.mockRejectedValue(new Error('boom'));
    const onSuccess = vi.fn();
    const { result } = renderMutation(makeCharacter());

    act(() => result.current.patch({ heroicInspiration: true }, { onSuccess }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('still writes when no callback is supplied', async () => {
    mockApiFetch.mockResolvedValue(makeCharacter({ version: 8 }));
    const { result } = renderMutation(makeCharacter());

    act(() => result.current.patch({ heroicInspiration: true }));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
  });
});

describe('useCharacterMutation', () => {
  it('PATCHes the character with the fields and expectedVersion', async () => {
    mockApiFetch.mockResolvedValue(makeCharacter({ version: 8 }));
    const { result } = renderMutation(makeCharacter({ version: 7 }));

    act(() => result.current.patch({ heroicInspiration: true }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/characters/char-1', {
        method: 'PATCH',
        body: JSON.stringify({ heroicInspiration: true, expectedVersion: 7 }),
      })
    );
  });

  it('accepts status-tracker fields in the patch allow-list (VEG-408)', async () => {
    mockApiFetch.mockResolvedValue(makeCharacter({ version: 8 }));
    const { result } = renderMutation(makeCharacter({ version: 7 }));

    act(() =>
      result.current.patch({
        conditions: ['Poisoned'],
        concentration: { spell: 'Bless' },
        exhaustion: 2,
      })
    );

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/characters/char-1', {
        method: 'PATCH',
        body: JSON.stringify({
          conditions: ['Poisoned'],
          concentration: { spell: 'Bless' },
          exhaustion: 2,
          expectedVersion: 7,
        }),
      })
    );
  });

  it('invalidates the character query on success', async () => {
    mockApiFetch.mockResolvedValue(makeCharacter());
    const { result, client } = renderMutation(makeCharacter());
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    act(() => result.current.patch({ hitPoints: { max: 10, current: 5, temporary: 0 } }));

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalled());
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it('surfaces a concurrent-edit toast and refetches on 409', async () => {
    const { ApiError } = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    mockApiFetch.mockRejectedValue(new ApiError(409, 'Conflict', { currentVersion: 9 }));
    const { result, client } = renderMutation(makeCharacter());
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    act(() => result.current.patch({ hitPoints: { max: 10, current: 5, temporary: 0 } }));

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(expect.stringContaining('changed elsewhere'))
    );
    expect(invalidateSpy).toHaveBeenCalled();
  });

  it('surfaces the backend error message on a non-409 failure', async () => {
    mockApiFetch.mockRejectedValue(new Error('Validation failed'));
    const { result } = renderMutation(makeCharacter());

    act(() => result.current.patch({ heroicInspiration: false }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Validation failed'));
  });

  it('falls back to a generic message on a non-Error rejection', async () => {
    mockApiFetch.mockRejectedValue('boom');
    const { result } = renderMutation(makeCharacter());

    act(() => result.current.patch({ heroicInspiration: false }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Failed to update character'));
  });

  describe('resolvePlayControls', () => {
    it('exposes the write path when editable', () => {
      const onPatch = vi.fn();
      const resolved = resolvePlayControls({ editable: true, onPatch, isSaving: true });
      expect(resolved.editable).toBe(true);
      expect(resolved.isSaving).toBe(true);
      resolved.patch({ heroicInspiration: true });
      expect(onPatch).toHaveBeenCalledWith({ heroicInspiration: true });
    });

    it('returns a safe no-op patch when read-only', () => {
      const resolved = resolvePlayControls({});
      expect(resolved.editable).toBe(false);
      expect(resolved.isSaving).toBe(false);
      // Must not throw — consumers call patch() without guarding.
      expect(() => resolved.patch({ heroicInspiration: true })).not.toThrow();
    });
  });

  it('reports isSaving while a write is in flight', async () => {
    let resolve: (c: Character) => void = () => {};
    mockApiFetch.mockReturnValue(new Promise<Character>(r => (resolve = r)));
    const { result } = renderMutation(makeCharacter());

    expect(result.current.isSaving).toBe(false);
    act(() => result.current.patch({ heroicInspiration: true }));
    await waitFor(() => expect(result.current.isSaving).toBe(true));
    act(() => resolve(makeCharacter()));
    await waitFor(() => expect(result.current.isSaving).toBe(false));
  });
});
