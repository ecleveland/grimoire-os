import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider, onlineManager, type QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ApiError } from '@/lib/api';
import { apiQueryKey } from '@/lib/query';
import type { Encounter } from '@/lib/types';
import { createTestQueryClient } from '@/test-utils/query';
import { makeQueryClient } from '@/components/QueryProvider';
import { makeCombatant, makeEncounter } from '@/test-utils/encounter';
import { IDLE_POLL_MS, LIVE_POLL_MS, useEncounter, type EncounterViewer } from '../useEncounter';

const mockApiFetch = vi.fn();
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();

vi.mock('@/lib/api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));

const PATH = '/encounters/enc-1';

type Init = { method?: string; body?: string } | undefined;

const callsTo = (method: string | undefined, path = PATH) =>
  mockApiFetch.mock.calls.filter(([p, init]) => p === path && (init as Init)?.method === method);

// The fixture's creator, viewing as a DM, so the default render controls the tracker.
const CONTROLLER: EncounterViewer = { userId: 'user-1', isDm: true };
const MEMBER: EncounterViewer = { userId: 'member-9', isDm: false };

function renderEncounter(
  client: QueryClient = createTestQueryClient(),
  viewer: EncounterViewer = CONTROLLER
) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useEncounter('enc-1', viewer), { wrapper });
  return { client, ...hook };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockToastError.mockReset();
  mockToastSuccess.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('useEncounter', () => {
  it('loads the encounter from the GET', async () => {
    const encounter = makeEncounter();
    mockApiFetch.mockResolvedValue(encounter);

    const { result } = renderEncounter();

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.encounter).toEqual(encounter));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
    expect(mockApiFetch).toHaveBeenCalledWith(PATH);
  });

  it('refetches on every mount, even inside the app-wide stale window', async () => {
    mockApiFetch.mockResolvedValue(makeEncounter());
    // The app's own client, whose 60s staleTime would otherwise serve the
    // cached encounter to the second mount.
    const client = makeQueryClient();

    const first = renderEncounter(client);
    await waitFor(() => expect(first.result.current.encounter).not.toBeNull());
    first.unmount();

    const second = renderEncounter(client);
    await waitFor(() => expect(callsTo(undefined)).toHaveLength(2));
    expect(second.result.current.encounter).not.toBeNull();
  });

  it('cancels a pending background refetch so it cannot overwrite a write', async () => {
    const client = makeQueryClient();
    const background = deferred<Encounter>();
    let gets = 0;
    mockApiFetch.mockImplementation((_path: string, init?: Init) => {
      if (init?.method === 'PATCH') return Promise.resolve(makeEncounter({ version: 3, round: 2 }));
      gets += 1;
      return gets === 1 ? Promise.resolve(makeEncounter({ version: 1 })) : background.promise;
    });

    const first = renderEncounter(client);
    await waitFor(() => expect(first.result.current.encounter).not.toBeNull());
    first.unmount();

    // The remount paints the cached encounter and refetches in the background.
    const { result } = renderEncounter(client);
    await waitFor(() => expect(callsTo(undefined)).toHaveLength(2));

    await act(async () => {
      await result.current.patch({ round: 2 });
    });
    await act(async () => {
      background.resolve(makeEncounter({ version: 2 }));
    });

    expect(client.getQueryData<Encounter>(apiQueryKey(PATH))?.version).toBe(3);
    expect(result.current.encounter?.version).toBe(3);
  });

  it('patches with expectedVersion, clears revived death saves and caches the response without a refetch', async () => {
    const encounter = makeEncounter({ version: 4 });
    const updated = makeEncounter({ version: 5, round: 2 });
    mockApiFetch.mockImplementation((_path: string, init?: Init) =>
      Promise.resolve(init?.method === 'PATCH' ? updated : encounter)
    );
    const { result, client } = renderEncounter();
    await waitFor(() => expect(result.current.encounter).not.toBeNull());

    const revived = makeCombatant({
      name: 'Hero',
      hp: 3,
      isNpc: false,
      deathSaves: { successes: 1, failures: 2 },
    });
    let returned: Encounter | null = null;
    await act(async () => {
      returned = await result.current.patch({ combatants: [revived] });
    });

    expect(returned).toEqual(updated);
    const [[, init]] = callsTo('PATCH');
    const body = JSON.parse((init as { body: string }).body);
    expect(body.expectedVersion).toBe(4);
    expect(body.combatants[0]).not.toHaveProperty('deathSaves');
    expect(client.getQueryData(apiQueryKey(PATH))).toEqual(updated);
    expect(callsTo(undefined)).toHaveLength(1);
  });

  it('refetches and toasts the conflict message on a 409', async () => {
    const encounter = makeEncounter();
    mockApiFetch.mockImplementation((_path: string, init?: Init) =>
      init?.method === 'PATCH'
        ? Promise.reject(new ApiError(409, 'Version conflict'))
        : Promise.resolve(encounter)
    );
    const { result } = renderEncounter();
    await waitFor(() => expect(result.current.encounter).not.toBeNull());

    let returned: Encounter | null = encounter;
    await act(async () => {
      returned = await result.current.patch({ round: 2 });
    });

    expect(returned).toBeNull();
    expect(mockToastError).toHaveBeenCalledWith(
      'This encounter changed since you opened it — refreshed, please try again.'
    );
    await waitFor(() => expect(callsTo(undefined)).toHaveLength(2));
  });

  it('sends the PATCH in the same tick as the call, before the mutation runs', async () => {
    const encounter = makeEncounter({ version: 2 });
    const pending = deferred<Encounter>();
    mockApiFetch.mockImplementation((_path: string, init?: Init) =>
      init?.method === 'PATCH' ? pending.promise : Promise.resolve(encounter)
    );
    const { result } = renderEncounter();
    await waitFor(() => expect(result.current.encounter).not.toBeNull());

    act(() => {
      void result.current.patch({ round: 2 });
    });

    expect(callsTo('PATCH')).toHaveLength(1);
    expect(result.current.writePending).toBe(true);

    await act(async () => {
      pending.resolve({ ...encounter, version: 3 });
    });
    await waitFor(() => expect(result.current.writePending).toBe(false));
  });

  it('settles a write made while the browser reports offline', async () => {
    const encounter = makeEncounter();
    mockApiFetch.mockImplementation((_path: string, init?: Init) =>
      init?.method === 'PATCH' ? Promise.reject(new Error('offline')) : Promise.resolve(encounter)
    );
    const { result } = renderEncounter();
    await waitFor(() => expect(result.current.encounter).not.toBeNull());

    onlineManager.setOnline(false);
    try {
      act(() => {
        void result.current.patch({ round: 2 });
      });
      expect(result.current.writePending).toBe(true);

      await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('offline'));
      await waitFor(() => expect(result.current.writePending).toBe(false));
    } finally {
      onlineManager.setOnline(true);
    }
  });

  it('keeps writePending true while a short PATCH resolves inside a pending loot roll', async () => {
    const encounter = makeEncounter({
      combatants: [makeCombatant({ name: 'Goblin A', monsterId: 'monster-1' })],
    });
    const roll = deferred<{ encounter: Encounter; lootTotal: null }>();
    mockApiFetch.mockImplementation((path: string, init?: Init) => {
      if (path === `${PATH}/loot`) return roll.promise;
      if (init?.method === 'PATCH') return Promise.resolve({ ...encounter, version: 2 });
      return Promise.resolve(encounter);
    });
    const { result } = renderEncounter();
    await waitFor(() => expect(result.current.encounter).not.toBeNull());

    let rolling!: Promise<void>;
    act(() => {
      rolling = result.current.rollLoot(encounter, 0, 'Rolled loot for Goblin A');
    });
    expect(result.current.writePending).toBe(true);

    await act(async () => {
      await result.current.patch({ round: 2 });
    });
    expect(result.current.writePending).toBe(true);

    await act(async () => {
      roll.resolve({ encounter: { ...encounter, version: 3 }, lootTotal: null });
      await rolling;
    });
    expect(result.current.writePending).toBe(false);
    expect(mockToastSuccess).toHaveBeenCalledWith('Rolled loot for Goblin A');
  });

  describe('live polling (VEG-683)', () => {
    // Fake timers go in before the render, because TanStack schedules the
    // poll on whatever setInterval is global when the first GET lands.
    // shouldAdvanceTime keeps waitFor's own timers moving.
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    const poll = (ms = LIVE_POLL_MS) =>
      act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });

    async function renderLoaded(viewer: EncounterViewer) {
      const rendered = renderEncounter(createTestQueryClient(), viewer);
      await waitFor(() => expect(rendered.result.current.encounter).not.toBeNull());
      return rendered;
    }

    it('a campaign member polls every 3 seconds while combat is active', async () => {
      mockApiFetch.mockResolvedValue(makeEncounter({ isActive: true }));
      const { result } = await renderLoaded(MEMBER);

      expect(result.current.isLive).toBe(true);
      expect(result.current.lastUpdatedAt).toBeGreaterThan(0);
      expect(callsTo(undefined)).toHaveLength(1);

      await poll();
      expect(callsTo(undefined)).toHaveLength(2);
      await poll();
      expect(callsTo(undefined)).toHaveLength(3);
    });

    it('polling slows to every 10 seconds when combat ends', async () => {
      mockApiFetch
        .mockResolvedValueOnce(makeEncounter({ isActive: true }))
        .mockResolvedValue(makeEncounter({ isActive: false }));
      const { result } = await renderLoaded(MEMBER);

      await poll();
      await waitFor(() => expect(result.current.encounter?.isActive).toBe(false));
      expect(result.current.isLive).toBe(true);
      expect(callsTo(undefined)).toHaveLength(2);

      await poll(LIVE_POLL_MS);
      expect(callsTo(undefined)).toHaveLength(2);
      await poll(IDLE_POLL_MS - LIVE_POLL_MS);
      expect(callsTo(undefined)).toHaveLength(3);
    });

    it('the DM view does not poll', async () => {
      mockApiFetch.mockResolvedValue(makeEncounter({ isActive: true }));
      const { result } = await renderLoaded({ userId: 'someone', isDm: true });

      await poll();
      await poll();
      await poll();
      expect(callsTo(undefined)).toHaveLength(1);
      expect(result.current.isLive).toBe(false);
    });

    it('the creator does not poll', async () => {
      mockApiFetch.mockResolvedValue(makeEncounter({ isActive: true }));
      const { result } = await renderLoaded({ userId: 'user-1', isDm: false });

      await poll();
      await poll();
      await poll();
      expect(callsTo(undefined)).toHaveLength(1);
      expect(result.current.isLive).toBe(false);
    });

    it('a member polls an inactive encounter every 10 seconds and speeds up when combat starts', async () => {
      mockApiFetch
        .mockResolvedValueOnce(makeEncounter({ isActive: false }))
        .mockResolvedValue(makeEncounter({ isActive: true }));
      const { result } = await renderLoaded(MEMBER);
      expect(result.current.isLive).toBe(true);

      await poll(LIVE_POLL_MS);
      expect(callsTo(undefined)).toHaveLength(1);
      await poll(IDLE_POLL_MS - LIVE_POLL_MS);
      expect(callsTo(undefined)).toHaveLength(2);
      await waitFor(() => expect(result.current.encounter?.isActive).toBe(true));

      await poll(LIVE_POLL_MS);
      expect(callsTo(undefined)).toHaveLength(3);
    });

    it('a failed refetch keeps the last state, dims the indicator and does not toast', async () => {
      const first = makeEncounter({ isActive: true });
      mockApiFetch
        .mockResolvedValueOnce(first)
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce(makeEncounter({ isActive: true, round: 2 }));
      const { result } = await renderLoaded(MEMBER);
      expect(result.current.refreshFailed).toBe(false);

      await poll();
      await waitFor(() => expect(result.current.refreshFailed).toBe(true));
      expect(result.current.encounter).toEqual(first);
      expect(mockToastError).not.toHaveBeenCalled();

      await poll();
      await waitFor(() => expect(result.current.encounter?.round).toBe(2));
      expect(result.current.refreshFailed).toBe(false);
    });

    it('a controller whose refetch fails still toasts', async () => {
      mockApiFetch
        .mockResolvedValueOnce(makeEncounter({ isActive: true }))
        .mockRejectedValueOnce(new Error('boom'));
      const { result, client } = await renderLoaded(CONTROLLER);

      await act(() => client.invalidateQueries());

      await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Failed to load encounter'));
      expect(mockToastError).toHaveBeenCalledTimes(1);
      expect(result.current.encounter).not.toBeNull();
    });

    it('the initial load failure still toasts', async () => {
      mockApiFetch.mockRejectedValue(new Error('404'));
      const { result } = renderEncounter(createTestQueryClient(), MEMBER);

      await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Failed to load encounter'));
      expect(result.current.encounter).toBeNull();
      expect(result.current.refreshFailed).toBe(false);
    });
  });
});
