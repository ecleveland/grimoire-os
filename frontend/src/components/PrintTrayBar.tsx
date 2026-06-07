'use client';

import Link from 'next/link';
import { usePrintTray, PRINT_TRAY_SOFT_CAP } from '@/lib/print-tray-context';

/**
 * Floating print-tray indicator (VEG-265). Hidden while the set is empty;
 * otherwise shows the live count with a "Print (N)" action that routes to
 * /srd/print, a clear-all, and the soft-cap warning from the tray store.
 */
export default function PrintTrayBar() {
  const tray = usePrintTray();

  if (tray.count === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-1.5 print:hidden">
      {tray.isOverSoftCap && (
        <p className="max-w-xs rounded-lg bg-amber-50 dark:bg-amber-900/80 border border-amber-200 dark:border-amber-700 px-3 py-1.5 text-xs text-amber-800 dark:text-amber-200 shadow">
          Large print sets may be slow — consider keeping it under {PRINT_TRAY_SOFT_CAP} cards.
        </p>
      )}
      <div className="flex items-center gap-2 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg pl-4 pr-2 py-2">
        <Link
          href="/srd/print"
          className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          Print ({tray.count})
        </Link>
        <button
          type="button"
          onClick={tray.clear}
          className="rounded-full px-2 py-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
