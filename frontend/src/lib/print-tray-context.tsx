'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  ReactNode,
} from 'react';
import type { PrintableCardType } from '@grimoire-os/shared';
import {
  getServerSnapshot,
  getSnapshot,
  hydrate,
  setItems,
  subscribe,
  type PrintTrayItem,
} from './print-tray-store';

export { PRINT_TRAY_STORAGE_KEY, type PrintTrayItem } from './print-tray-store';

/** The grouped shape the `/srd/print` route sends to the batch hydrate endpoint. */
export interface PrintTrayGroup {
  type: PrintableCardType;
  ids: string[];
}

/**
 * Soft cap on the print set size. Adds beyond this are still allowed. The
 * tray UI surfaces a warning via `isOverSoftCap` instead of blocking.
 */
export const PRINT_TRAY_SOFT_CAP = 60;

interface PrintTrayContextType {
  /** The selection in insertion order, de-duped by (type, id). */
  items: PrintTrayItem[];
  /** The selection grouped by type (insertion order), for the print route. */
  grouped: PrintTrayGroup[];
  count: number;
  /** True when the set has grown past {@link PRINT_TRAY_SOFT_CAP}. */
  isOverSoftCap: boolean;
  /**
   * True once the stored set has been read from localStorage. Until then
   * `items` is transiently empty, so consumers that branch on emptiness (the
   * /srd/print route's empty state) must wait for this.
   */
  hydrated: boolean;
  add: (type: PrintableCardType, id: string) => void;
  remove: (type: PrintableCardType, id: string) => void;
  toggle: (type: PrintableCardType, id: string) => void;
  has: (type: PrintableCardType, id: string) => boolean;
  clear: () => void;
}

const PrintTrayContext = createContext<PrintTrayContextType | null>(null);

export function PrintTrayProvider({ children }: { children: ReactNode }) {
  // The set lives in a module store read through useSyncExternalStore. The
  // server snapshot is always empty and unhydrated, so the server and first
  // client render agree, and the store holds `hydrated` itself, so persisting
  // can never run ahead of the read and write [] over the stored set.
  const { items, hydrated } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Hydrate after mount, because localStorage only exists in the browser.
  // `hydrate` is idempotent, so StrictMode's double-invoked effect is harmless.
  useEffect(() => hydrate(), []);

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
    setItems(() => []);
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
      hydrated,
      add,
      remove,
      toggle,
      has,
      clear,
    }),
    [items, grouped, hydrated, add, remove, toggle, has, clear]
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
