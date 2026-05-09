'use client';

import { useCallback, useEffect, useId, useRef } from 'react';

export type ConfirmDialogVariant = 'default' | 'danger';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmDialogVariant;
  onConfirm: () => void;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    el => !el.hasAttribute('inert') && !el.hasAttribute('data-confirm-dialog-sentinel')
  );
}

export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  const close = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  // Capture the trigger element when opening so we can restore focus on close.
  useEffect(() => {
    if (open) {
      previouslyFocusedRef.current = (document.activeElement as HTMLElement | null) ?? null;
      cancelRef.current?.focus();
      return undefined;
    }

    // Closing: return focus to the previously focused element if still in the DOM.
    const previous = previouslyFocusedRef.current;
    previouslyFocusedRef.current = null;
    if (previous && document.contains(previous)) {
      previous.focus();
    }
    return undefined;
  }, [open]);

  // Esc to cancel
  useEffect(() => {
    if (!open) return undefined;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, close]);

  // Focus trap via sentinel elements (handles both Tab and Shift+Tab,
  // even in test runners that bypass our keydown handler's preventDefault).
  const focusFirst = useCallback(() => {
    if (!dialogRef.current) return;
    const focusables = getFocusable(dialogRef.current);
    focusables[0]?.focus();
  }, []);

  const focusLast = useCallback(() => {
    if (!dialogRef.current) return;
    const focusables = getFocusable(dialogRef.current);
    focusables[focusables.length - 1]?.focus();
  }, []);

  if (!open) return null;

  const handleConfirm = () => {
    onConfirm();
    close();
  };

  const confirmButtonClass =
    variant === 'danger'
      ? 'px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 transition-colors'
      : 'px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 transition-colors';

  return (
    <div
      data-testid="confirm-dialog-overlay"
      onMouseDown={e => {
        // Only close if the mousedown started on the overlay itself, not on a child.
        if (e.target === e.currentTarget) {
          close();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-full max-w-md rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xl p-6"
      >
        {/* Sentinel: tabbing onto this wraps focus to the last focusable inside the dialog */}
        <div
          tabIndex={0}
          aria-hidden="true"
          data-confirm-dialog-sentinel="start"
          onFocus={focusLast}
        />
        <h2 id={titleId} className="text-lg font-semibold text-gray-900 dark:text-white">
          {title}
        </h2>
        <p id={descriptionId} className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          {description}
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={close}
            className="px-4 py-2 rounded-lg text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 transition-colors"
          >
            {cancelLabel}
          </button>
          <button type="button" onClick={handleConfirm} className={confirmButtonClass}>
            {confirmLabel}
          </button>
        </div>
        {/* Sentinel: tabbing onto this wraps focus to the first focusable inside the dialog */}
        <div
          tabIndex={0}
          aria-hidden="true"
          data-confirm-dialog-sentinel="end"
          onFocus={focusFirst}
        />
      </div>
    </div>
  );
}
