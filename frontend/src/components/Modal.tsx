'use client';

import { useCallback, useEffect, useRef, type ReactNode } from 'react';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Accessible label for the dialog (e.g. the entity name shown inside). */
  label: string;
  children: ReactNode;
  testId?: string;
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
    el => !el.hasAttribute('inert') && !el.hasAttribute('data-modal-sentinel')
  );
}

/**
 * Generic accessible overlay modal. Mirrors the a11y behaviour of ConfirmDialog
 * (Esc + overlay-click to close, focus trap via sentinels, focus restore) but
 * takes arbitrary children — reused by the SRD monster stat block and (later)
 * the encounter lookup panel.
 */
export default function Modal({ open, onClose, label, children, testId }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Capture the trigger when opening so focus can be restored on close.
  useEffect(() => {
    if (open) {
      previouslyFocusedRef.current = (document.activeElement as HTMLElement | null) ?? null;
      closeRef.current?.focus();
      return undefined;
    }
    const previous = previouslyFocusedRef.current;
    previouslyFocusedRef.current = null;
    if (previous && document.contains(previous)) {
      previous.focus();
    }
    return undefined;
  }, [open]);

  // Esc to close.
  useEffect(() => {
    if (!open) return undefined;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const focusFirst = useCallback(() => {
    if (!dialogRef.current) return;
    getFocusable(dialogRef.current)[0]?.focus();
  }, []);

  const focusLast = useCallback(() => {
    if (!dialogRef.current) return;
    const focusables = getFocusable(dialogRef.current);
    focusables[focusables.length - 1]?.focus();
  }, []);

  if (!open) return null;

  return (
    <div
      data-testid={testId ?? 'modal-overlay'}
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-6"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="my-8 w-full max-w-2xl rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xl"
      >
        <div tabIndex={0} aria-hidden="true" data-modal-sentinel="start" onFocus={focusLast} />
        <div className="flex justify-end p-2">
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <span aria-hidden="true" className="block text-xl leading-none">
              &times;
            </span>
          </button>
        </div>
        <div className="px-4 pb-4 sm:px-6 sm:pb-6">{children}</div>
        <div tabIndex={0} aria-hidden="true" data-modal-sentinel="end" onFocus={focusFirst} />
      </div>
    </div>
  );
}
