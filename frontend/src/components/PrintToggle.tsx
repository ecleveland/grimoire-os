'use client';

import type { MouseEvent } from 'react';
import type { PrintableCardType } from '@grimoire-os/shared';
import { usePrintTray } from '@/lib/print-tray-context';

export interface PrintToggleProps {
  type: PrintableCardType;
  id: string;
  /** Display name used in the accessible label. */
  name: string;
  /**
   * `icon`: compact icon button for list cards (default).
   * `button`: labelled button for detail modals.
   * `chip`: the name itself as a toggleable chip — for feature chip lists.
   */
  variant?: 'icon' | 'button' | 'chip';
  className?: string;
}

/**
 * Shared print-set selection affordance (VEG-265). Toggles `{type, id}` in the
 * print tray and reflects current membership. Safe to place alongside a
 * clickable card — clicks never propagate to the card. Do not nest it inside a
 * `<button>` (invalid HTML); render it as a sibling instead, as the SRD list
 * pages do.
 */
export default function PrintToggle({
  type,
  id,
  name,
  variant = 'icon',
  className = '',
}: PrintToggleProps) {
  const tray = usePrintTray();
  const selected = tray.has(type, id);
  const label = selected ? `Remove ${name} from print set` : `Add ${name} to print set`;

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    tray.toggle(type, id);
  };

  if (variant === 'chip') {
    return (
      <button
        type="button"
        onClick={handleClick}
        aria-pressed={selected}
        aria-label={label}
        title={label}
        className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
          selected
            ? 'bg-indigo-600 text-white hover:bg-indigo-700'
            : 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50'
        } ${className}`}
      >
        {name}
        <PrinterIcon small />
      </button>
    );
  }

  if (variant === 'button') {
    return (
      <button
        type="button"
        onClick={handleClick}
        aria-pressed={selected}
        aria-label={label}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
          selected
            ? 'bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700'
            : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-indigo-400 dark:hover:border-indigo-500'
        } ${className}`}
      >
        <PrinterIcon />
        {selected ? 'Remove from print set' : 'Add to print set'}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={selected}
      aria-label={label}
      title={label}
      className={`inline-flex items-center justify-center rounded-md p-1 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
        selected
          ? 'bg-indigo-600 text-white hover:bg-indigo-700'
          : 'text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30'
      } ${className}`}
    >
      <PrinterIcon />
    </button>
  );
}

function PrinterIcon({ small = false }: { small?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={small ? 'h-3 w-3' : 'h-4 w-4'}
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M5 2.75A.75.75 0 0 1 5.75 2h8.5a.75.75 0 0 1 .75.75V6h.75A2.25 2.25 0 0 1 18 8.25v4.5A2.25 2.25 0 0 1 15.75 15H15v2.25a.75.75 0 0 1-.75.75h-8.5a.75.75 0 0 1-.75-.75V15h-.75A2.25 2.25 0 0 1 2 12.75v-4.5A2.25 2.25 0 0 1 4.25 6H5V2.75ZM6.5 6h7V3.5h-7V6Zm0 6.5v4h7v-4h-7Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
