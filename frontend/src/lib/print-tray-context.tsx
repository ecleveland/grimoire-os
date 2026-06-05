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

/** Parse a persisted print set, dropping anything corrupt or malformed. */
function readStoredItems(): PrintTrayItem[] {
  try {
    const raw = localStorage.getItem(PRINT_TRAY_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const items: PrintTrayItem[] = [];
    for (const entry of parsed) {
      if (!isPrintTrayItem(entry)) continue;
      const key = keyOf(entry.type, entry.id);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ type: entry.type, id: entry.id });
    }
    return items;
  } catch {
    // Corrupt JSON or storage unavailable — start with an empty set.
    return [];
  }
}

export function PrintTrayProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<PrintTrayItem[]>([]);
  // Skip persisting until the mount-time hydration has run, so the initial
  // empty render can't clobber a stored set.
  const hydratedRef = useRef(false);

  // Hydrate in an effect (not a useState initializer) so server and first
  // client render agree — localStorage only exists in the browser.
  useEffect(() => {
    setItems(readStoredItems());
    hydratedRef.current = true;
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    try {
      localStorage.setItem(PRINT_TRAY_STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Storage full or unavailable — the in-memory set still works.
    }
  }, [items]);

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
