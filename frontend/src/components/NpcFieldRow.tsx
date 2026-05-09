'use client';

import type { ReactNode } from 'react';
import type { NpcRerollField } from '@/lib/types';

type RowField = Exclude<NpcRerollField, 'all'>;

interface NpcFieldRowProps {
  field: RowField;
  label: string;
  value: ReactNode | null | undefined;
  locked: boolean;
  rerollable?: boolean;
  onReroll: (field: RowField) => void;
  onToggleLock: (field: RowField) => void;
}

export default function NpcFieldRow({
  field,
  label,
  value,
  locked,
  rerollable = true,
  onReroll,
  onToggleLock,
}: NpcFieldRowProps) {
  const hasValue = value !== null && value !== undefined && value !== '';
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
      <div className="flex-1 min-w-0">
        <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
        <div className="text-sm text-gray-900 dark:text-white whitespace-pre-line">
          {hasValue ? value : <span className="text-gray-400">—</span>}
        </div>
      </div>
      {rerollable && (
        <div className="flex items-center gap-1 pt-3 shrink-0">
          <button
            type="button"
            onClick={() => onReroll(field)}
            disabled={locked}
            aria-label={`Reroll ${label.toLowerCase()}`}
            title={locked ? `${label} is locked` : `Reroll ${label.toLowerCase()}`}
            className="px-2 py-1 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            🎲
          </button>
          <button
            type="button"
            onClick={() => onToggleLock(field)}
            aria-label={`${locked ? 'Unlock' : 'Lock'} ${label.toLowerCase()}`}
            title={locked ? `Unlock ${label.toLowerCase()}` : `Lock ${label.toLowerCase()}`}
            className="px-2 py-1 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            {locked ? '🔒' : '🔓'}
          </button>
        </div>
      )}
    </div>
  );
}
