'use client';

import { toast } from 'sonner';
import { PRINTABLE_CARD_TYPES } from '@grimoire-os/shared';
import type { PrintableCardType } from '@grimoire-os/shared';

/** One entry in the print set: a printable SRD record, identified by type + id. */
export interface PrintTrayItem {
  type: PrintableCardType;
  id: string;
}

export const PRINT_TRAY_STORAGE_KEY = 'print-tray';

/** What the provider reads through useSyncExternalStore. */
export interface PrintTraySnapshot {
  items: PrintTrayItem[];
  /**
   * True once the stored set has been read from localStorage. Until then
   * `items` is transiently empty.
   */
  hydrated: boolean;
}

// The server render and the first client render both see this, so they agree.
// localStorage only exists in the browser, and the provider hydrates the store
// in an effect after mount.
const SERVER_SNAPSHOT: PrintTraySnapshot = { items: [], hydrated: false };

let items: PrintTrayItem[] = [];
let hydrated = false;
// useSyncExternalStore compares snapshots by reference, so this object is
// replaced only when `items` or `hydrated` changes.
let snapshot: PrintTraySnapshot = SERVER_SNAPSHOT;
// Warn the user at most once per page load when persistence fails. Without a
// signal, the selection silently becoming session-only is indistinguishable
// from "my clicks aren't registering" after the next reload.
let persistFailed = false;
const listeners = new Set<() => void>();

const keyOf = (type: PrintableCardType, id: string) => `${type}:${id}`;

function isPrintTrayItem(value: unknown): value is PrintTrayItem {
  if (typeof value !== 'object' || value === null) return false;
  const { type, id } = value as { type?: unknown; id?: unknown };
  return (
    typeof id === 'string' &&
    typeof type === 'string' &&
    (PRINTABLE_CARD_TYPES as readonly string[]).includes(type)
  );
}

/**
 * Parse a persisted print set, dropping anything corrupt or malformed.
 * Genuine error branches log to the console: a failed hydration is otherwise
 * pixel-identical to an empty tray (the tray bar hides at count 0), so silent
 * data loss would be undiagnosable.
 */
function readStoredItems(): PrintTrayItem[] {
  try {
    const raw = localStorage.getItem(PRINT_TRAY_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.error('Print tray: stored value is not an array, starting empty.');
      return [];
    }
    const seen = new Set<string>();
    const result: PrintTrayItem[] = [];
    let dropped = 0;
    for (const entry of parsed) {
      if (!isPrintTrayItem(entry)) {
        dropped++;
        continue;
      }
      const key = keyOf(entry.type, entry.id);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ type: entry.type, id: entry.id });
    }
    if (dropped > 0) {
      console.error(`Print tray: dropped ${dropped} malformed stored entries.`);
    }
    return result;
  } catch (err) {
    // Corrupt JSON or storage unavailable, so start with an empty set.
    console.error('Failed to read print tray from storage:', err);
    return [];
  }
}

function persist(next: PrintTrayItem[]) {
  try {
    localStorage.setItem(PRINT_TRAY_STORAGE_KEY, JSON.stringify(next));
  } catch (err) {
    // Storage full or unavailable. The in-memory set still works.
    console.error('Failed to persist print tray:', err);
    if (!persistFailed) {
      persistFailed = true;
      toast.error(
        'Your print selection cannot be saved and will be lost when you leave or reload.',
        { id: 'print-tray-persist' }
      );
    }
  }
}

function publish() {
  snapshot = { items, hydrated };
  for (const listener of listeners) listener();
}

/**
 * The store lives as long as a provider is subscribed. When the last listener
 * leaves, it resets, so the next provider mount hydrates from storage again as
 * a fresh provider would. The app's provider sits in the root layout and never
 * unmounts, so this only matters to remounts in tests and StrictMode.
 */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) resetState();
  };
}

export function getSnapshot(): PrintTraySnapshot {
  return snapshot;
}

export function getServerSnapshot(): PrintTraySnapshot {
  return SERVER_SNAPSHOT;
}

/**
 * Read the stored set into the store and write it back, so the key exists
 * after mount even for an empty set and malformed entries are dropped from
 * storage too. Later calls do nothing while the store stays hydrated. A
 * remount after the last listener left reads storage again, and that is safe
 * because the write-back only ever stores what was just read.
 */
export function hydrate(): void {
  if (hydrated) return;
  items = readStoredItems();
  hydrated = true;
  persist(items);
  publish();
}

/**
 * Apply `update` and persist the result. Writing on change replaces a persist
 * effect. A write can land before the provider's hydrate effect runs, for
 * example from a child's mount effect, so it hydrates first and the update
 * applies on top of the stored set instead of overwriting it. An update that
 * returns the same array is a no-op, like a React state bail-out.
 */
export function setItems(update: (prev: PrintTrayItem[]) => PrintTrayItem[]): void {
  if (!hydrated) hydrate();
  const next = update(items);
  if (next === items) return;
  items = next;
  persist(items);
  publish();
}

function resetState() {
  items = [];
  hydrated = false;
  snapshot = SERVER_SNAPSHOT;
  persistFailed = false;
}

/** Return the store to its initial state. For tests only. */
export function resetPrintTrayStore(): void {
  resetState();
  listeners.clear();
}
