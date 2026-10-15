import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toast } from 'sonner';
import {
  getServerSnapshot,
  getSnapshot,
  hydrate,
  resetPrintTrayStore,
  setItems,
  subscribe,
} from '../print-tray-store';
import { PRINT_TRAY_STORAGE_KEY } from '../print-tray-context';

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}));

beforeEach(() => {
  localStorage.clear();
  resetPrintTrayStore();
  vi.mocked(toast.error).mockClear();
});

describe('print tray store', () => {
  it('returns the same empty, unhydrated server snapshot on every call', () => {
    const first = getServerSnapshot();
    expect(first).toEqual({ items: [], hydrated: false });
    expect(getServerSnapshot()).toBe(first);
  });

  it('keeps the client snapshot reference stable until the store changes', () => {
    const before = getSnapshot();
    expect(getSnapshot()).toBe(before);
    hydrate();
    expect(getSnapshot()).not.toBe(before);
  });

  it('hydrates from storage once and ignores later calls', () => {
    localStorage.setItem(
      PRINT_TRAY_STORAGE_KEY,
      JSON.stringify([{ type: 'monster', id: 'goblin' }])
    );
    const listener = vi.fn();
    subscribe(listener);

    hydrate();
    const afterFirst = getSnapshot();
    expect(afterFirst).toEqual({ items: [{ type: 'monster', id: 'goblin' }], hydrated: true });
    expect(listener).toHaveBeenCalledTimes(1);

    localStorage.setItem(PRINT_TRAY_STORAGE_KEY, JSON.stringify([]));
    hydrate();
    expect(getSnapshot()).toBe(afterFirst);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('persists and notifies on setItems', () => {
    hydrate();
    const listener = vi.fn();
    subscribe(listener);

    setItems(prev => [...prev, { type: 'spell', id: 'fireball' }]);

    expect(getSnapshot().items).toEqual([{ type: 'spell', id: 'fireball' }]);
    expect(JSON.parse(localStorage.getItem(PRINT_TRAY_STORAGE_KEY)!)).toEqual([
      { type: 'spell', id: 'fireball' },
    ]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('hydrates before a write that lands ahead of hydration, keeping the stored set', () => {
    localStorage.setItem(
      PRINT_TRAY_STORAGE_KEY,
      JSON.stringify([{ type: 'monster', id: 'goblin' }])
    );

    setItems(prev => [...prev, { type: 'spell', id: 'fireball' }]);

    const expected = [
      { type: 'monster', id: 'goblin' },
      { type: 'spell', id: 'fireball' },
    ];
    expect(getSnapshot()).toEqual({ items: expected, hydrated: true });
    expect(JSON.parse(localStorage.getItem(PRINT_TRAY_STORAGE_KEY)!)).toEqual(expected);
    // A later hydrate from the provider's effect changes nothing.
    const after = getSnapshot();
    hydrate();
    expect(getSnapshot()).toBe(after);
  });

  it('does not notify or persist when the updater returns the same array', () => {
    hydrate();
    const listener = vi.fn();
    subscribe(listener);
    const before = getSnapshot();

    setItems(prev => prev);

    expect(getSnapshot()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
    expect(localStorage.getItem(PRINT_TRAY_STORAGE_KEY)).toBeNull();
  });

  it('stops notifying a listener once it unsubscribes', () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    unsubscribe();
    hydrate();
    expect(listener).not.toHaveBeenCalled();
  });

  it('resets when the last listener unsubscribes, so the next mount reads storage again', () => {
    localStorage.setItem(
      PRINT_TRAY_STORAGE_KEY,
      JSON.stringify([{ type: 'monster', id: 'goblin' }])
    );
    const first = subscribe(vi.fn());
    const second = subscribe(vi.fn());
    hydrate();

    first();
    expect(getSnapshot().hydrated).toBe(true);
    second();
    expect(getSnapshot()).toEqual({ items: [], hydrated: false });

    localStorage.setItem(
      PRINT_TRAY_STORAGE_KEY,
      JSON.stringify([{ type: 'spell', id: 'fireball' }])
    );
    subscribe(vi.fn());
    hydrate();
    expect(getSnapshot().items).toEqual([{ type: 'spell', id: 'fireball' }]);
  });

  it('resets items, hydration and listeners for the next test', () => {
    const listener = vi.fn();
    subscribe(listener);
    hydrate();
    setItems(() => [{ type: 'monster', id: 'goblin' }]);
    listener.mockClear();

    resetPrintTrayStore();
    expect(getSnapshot()).toEqual({ items: [], hydrated: false });
    hydrate();
    expect(listener).not.toHaveBeenCalled();
  });
});
