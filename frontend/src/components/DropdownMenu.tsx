'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export interface DropdownMenuItem {
  /** Short label; also the menu item's accessible name. */
  label: string;
  /** Optional secondary line shown under the label. */
  description?: string;
  onSelect: () => void;
  disabled?: boolean;
}

interface Props {
  /** Trigger button content. A decorative chevron is appended automatically. */
  label: ReactNode;
  items: DropdownMenuItem[];
  disabled?: boolean;
  /** Tailwind classes for the trigger button. */
  buttonClassName?: string;
  /** Which edge the menu aligns to. */
  align?: 'left' | 'right';
  testId?: string;
}

/**
 * Minimal accessible menu button (WAI-ARIA menu-button pattern): a trigger that
 * toggles a popup list of actions. Opening focuses the first item; Esc / outside
 * click / selecting an item close and restore focus to the trigger; Up/Down/
 * Home/End move between items. Built because the app had no dropdown primitive —
 * reusable beyond the encounter tracker.
 */
export default function DropdownMenu({
  label,
  items,
  disabled = false,
  buttonClassName,
  align = 'left',
  testId,
}: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();

  // Close when a click lands outside the trigger+menu.
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  // Move focus into the menu when it opens (menu-button convention).
  useEffect(() => {
    if (open) itemRefs.current[0]?.focus();
  }, [open]);

  const close = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) buttonRef.current?.focus();
  };

  const focusItem = (index: number) => {
    const count = items.length;
    if (count === 0) return;
    const wrapped = ((index % count) + count) % count;
    itemRefs.current[wrapped]?.focus();
  };

  const onItemKeyDown = (e: React.KeyboardEvent, index: number) => {
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        close();
        break;
      case 'ArrowDown':
        e.preventDefault();
        focusItem(index + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusItem(index - 1);
        break;
      case 'Home':
        e.preventDefault();
        focusItem(0);
        break;
      case 'End':
        e.preventDefault();
        focusItem(items.length - 1);
        break;
      case 'Tab':
        // Leaving the menu by keyboard closes it (without stealing focus back).
        close(false);
        break;
    }
  };

  const select = (item: DropdownMenuItem) => {
    if (item.disabled) return;
    item.onSelect();
    close();
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        data-testid={testId}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            setOpen(true);
          } else if (open && e.key === 'Escape') {
            e.preventDefault();
            close();
          }
        }}
        className={buttonClassName}
      >
        {label}
        <span aria-hidden="true" className="ml-1">
          ▾
        </span>
      </button>
      {open && (
        <div
          role="menu"
          id={menuId}
          className={`absolute z-20 mt-1 min-w-[14rem] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 py-1 shadow-lg ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {items.map((item, i) => (
            <button
              key={i}
              ref={el => {
                itemRefs.current[i] = el;
              }}
              type="button"
              role="menuitem"
              aria-label={item.label}
              disabled={item.disabled}
              onClick={() => select(item)}
              onKeyDown={e => onItemKeyDown(e, i)}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50 focus:bg-gray-50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-gray-700 dark:focus:bg-gray-700"
            >
              <span className="block font-medium text-gray-800 dark:text-gray-200">
                {item.label}
              </span>
              {item.description && (
                <span className="block text-xs text-gray-500 dark:text-gray-400">
                  {item.description}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
