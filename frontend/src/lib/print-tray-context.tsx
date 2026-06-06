'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { toast } from 'sonner';
import { PRINTABLE_CARD_TYPES } from '@grimoire-os/shared';
import type { PrintableCardType } from '@grimoire-os/shared';

/** One entry in the print set: a printable SRD record, identified by type + id. */
export interface PrintTrayItem {
  type: PrintableCardType;
  id: string;
}

/** The grouped shape the `/srd/print` route sends to the batch hydrate endpoint. */
export interface PrintTrayGroup {
  type: PrintableCardType;
  ids: string[];
}

/**
 * Soft cap on the print set size. Adds beyond this are still allowed — the
 * tray UI surfaces a warning via `isOverSoftCap` instead of blocking.
 */
export const PRINT_TRAY_SOFT_CAP = 60;

export const PRINT_TRAY_STORAGE_KEY = 'print-tray';

interface PrintTrayContextType {
  /** The selection in insertion order, de-duped by (type, id). */
  items: PrintTrayItem[];
  /** The selection grouped by type (insertion order), for the print route. */
  grouped: PrintTrayGroup[];
  count: number;
  /** True when the set has grown past {@link PRINT_TRAY_SOFT_CAP}. */
  isOverSoftCap: boolean;
  add: (type: PrintableCardType, id: string) => void;
  remove: (type: PrintableCardType, id: string) => void;
  toggle: (type: PrintableCardType, id: string) => void;
  has: (type: PrintableCardType, id: string) => boolean;
  clear: () => void;
}

const PrintTrayContext = createContext<PrintTrayContextType | null>(null);

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
      console.error('Print tray: stored value is not an array — starting empty.');
      return [];
    }
    const seen = new Set<string>();
    const items: PrintTrayItem[] = [];
    let dropped = 0;
    for (const entry of parsed) {
      if (!isPrintTrayItem(entry)) {
        dropped++;
        continue;
      }
      const key = keyOf(entry.type, entry.id);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ type: entry.type, id: entry.id });
    }
    if (dropped > 0) {
      console.error(`Print tray: dropped ${dropped} malformed stored entries.`);
    }
    return items;
  } catch (err) {
    // Corrupt JSON or storage unavailable — start with an empty set.
    console.error('Failed to read print tray from storage:', err);
    return [];
  }
}

export function PrintTrayProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<PrintTrayItem[]>([]);
  // Skip persisting until the mount-time hydration has run, so the initial
  // empty render can't clobber a stored set. This must be render state, not a
  // ref: a ref flipped inside the hydrate effect is already true when the
  // persist effect runs in the same mount commit (items still []), which wrote
  // [] over the stored set — and under React StrictMode's double-invoked
  // effects (Next.js dev) the second hydrate pass then read the clobbered
  // store, wiping the selection on every page load. Latent since the VEG-264
  // store; caught by the VEG-265 e2e.
  const [hydrated, setHydrated] = useState(false);
  // Warn the user at most once per mount when persistence fails — without a
  // signal, the selection silently becoming session-only is indistinguishable
  // from "my clicks aren't registering" after the next reload.
  const persistFailedRef = useRef(false);

  // Hydrate in an effect (not a useState initializer) so server and first
  // client render agree — localStorage only exists in the browser.
  useEffect(() => {
    setItems(readStoredItems());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(PRINT_TRAY_STORAGE_KEY, JSON.stringify(items));
    } catch (err) {
      // Storage full or unavailable — the in-memory set still works.
      console.error('Failed to persist print tray:', err);
      if (!persistFailedRef.current) {
        persistFailedRef.current = true;
        toast.error(
          'Your print selection cannot be saved and will be lost when you leave or reload.',
          { id: 'print-tray-persist' }
        );
      }
    }
  }, [items, hydrated]);

  const add = useCallback((type: PrintableCardType, id: string) => {
    setItems(prev =>
      prev.some(item => item.type === type && item.id === id) ? prev : [...prev, { type, id }]
    );
  }, []);

  const remove = useCallback((type: PrintableCardType, id: string) => {
    setItems(prev => prev.filter(item => !(item.type === type && item.id === id)));
  }, []);

  const toggle = useCallback((type: PrintableCardType, id: string) => {
    setItems(prev =>
      prev.some(item => item.type === type && item.id === id)
        ? prev.filter(item => !(item.type === type && item.id === id))
        : [...prev, { type, id }]
    );
  }, []);

  const has = useCallback(
    (type: PrintableCardType, id: string) =>
      items.some(item => item.type === type && item.id === id),
    [items]
  );

  const clear = useCallback(() => {
    setItems([]);
  }, []);

  const grouped = useMemo(() => {
    const groups = new Map<PrintableCardType, string[]>();
    for (const item of items) {
      const ids = groups.get(item.type);
      if (ids) {
        ids.push(item.id);
      } else {
        groups.set(item.type, [item.id]);
      }
    }
    return Array.from(groups, ([type, ids]) => ({ type, ids }));
  }, [items]);

  const contextValue = useMemo(
    () => ({
      items,
      grouped,
      count: items.length,
      isOverSoftCap: items.length > PRINT_TRAY_SOFT_CAP,
      add,
      remove,
      toggle,
      has,
      clear,
    }),
    [items, grouped, add, remove, toggle, has, clear]
  );

  return <PrintTrayContext.Provider value={contextValue}>{children}</PrintTrayContext.Provider>;
}

export function usePrintTray() {
  const context = useContext(PrintTrayContext);
  if (!context) {
    throw new Error('usePrintTray must be used within a PrintTrayProvider');
  }
  return context;
}
