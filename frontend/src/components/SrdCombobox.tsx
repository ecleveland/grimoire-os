'use client';

import { useEffect, useId, useRef, useState } from 'react';

export interface SrdComboboxOption {
  id: string;
  name: string;
  /**
   * Optional display text for the dropdown row, shown instead of `name` when set
   * (e.g. "Acolyte (Homebrew)" to disambiguate duplicate names — VEG-473).
   * Filtering, exact-match, and the committed value all stay keyed on `name`, so
   * the label is purely cosmetic and never persisted.
   */
  label?: string;
}

interface SrdComboboxProps {
  label: string;
  value: string;
  /** Fires on any value change — typing a custom value (manual override) or picking. */
  onChange: (value: string) => void;
  /** Fires only when an SRD option is chosen from the list (drives autofill). */
  onSelect?: (option: SrdComboboxOption) => void;
  options: SrdComboboxOption[];
  loading?: boolean;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  helperText?: string;
}

const inputClasses =
  'w-full px-3 py-2 pr-8 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-100 dark:disabled:bg-gray-700';
const labelClasses = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

/**
 * Searchable combobox over a small SRD list. Typing filters the options
 * (case-insensitive substring); picking an option fires `onSelect` (used to
 * autofill granted traits). A value the list doesn't contain is kept verbatim —
 * the manual-override path for homebrew (VEG-348). Options are expected to be a
 * small in-memory set (the SRD endpoints return full arrays), so filtering is
 * client-side.
 */
export default function SrdCombobox({
  label,
  value,
  onChange,
  onSelect,
  options,
  loading = false,
  disabled = false,
  required = false,
  placeholder,
  helperText,
}: SrdComboboxProps) {
  const inputId = useId();
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  const query = value.trim().toLowerCase();
  // After a committed pick the value equals an option's name; show the full list
  // then so the user can browse to a *different* option instead of being stuck
  // with the one match. Only narrow while they're typing a partial.
  const isExactMatch = options.some(o => o.name.toLowerCase() === query);
  const filtered =
    query && !isExactMatch ? options.filter(o => o.name.toLowerCase().includes(query)) : options;
  // Clamp: the controlled value can shrink `filtered` out from under a stale
  // highlight, so derive the effective active index rather than trusting it raw.
  const activeIndex = highlight >= 0 && highlight < filtered.length ? highlight : -1;
  const activeId = activeIndex >= 0 ? `${listId}-opt-${activeIndex}` : undefined;

  // Close the dropdown on an outside click.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const pick = (option: SrdComboboxOption) => {
    onChange(option.name);
    onSelect?.(option);
    setOpen(false);
    setHighlight(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlight(h => Math.min(h + 1, filtered.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setHighlight(h => (h <= 0 ? 0 : h - 1));
      return;
    }
    if (e.key === 'Enter' && open) {
      // Never let Enter inside an open combobox bubble up and submit the form:
      // pick the highlighted option, or just accept the typed (custom) value.
      e.preventDefault();
      if (activeIndex >= 0) pick(filtered[activeIndex]);
      else setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <label htmlFor={inputId} className={labelClasses}>
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <div className="relative">
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={activeId}
          aria-autocomplete="list"
          autoComplete="off"
          disabled={disabled}
          required={required}
          placeholder={placeholder}
          value={value}
          className={inputClasses}
          onChange={e => {
            onChange(e.target.value);
            setOpen(true);
            setHighlight(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"
        >
          ▾
        </span>
      </div>
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-600 dark:bg-gray-800"
        >
          {loading ? (
            <li className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">Loading…</li>
          ) : filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
              No matches — your entry is kept as a custom value.
            </li>
          ) : (
            filtered.map((option, i) => (
              <li
                key={option.id}
                id={`${listId}-opt-${i}`}
                role="option"
                aria-selected={i === activeIndex}
                // onMouseDown (not onClick) so it fires before the input's blur
                // closes the list.
                onMouseDown={e => {
                  e.preventDefault();
                  pick(option);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={`cursor-pointer px-3 py-2 text-sm ${
                  i === activeIndex
                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200'
                    : 'text-gray-900 dark:text-gray-100'
                }`}
              >
                {option.label ?? option.name}
              </li>
            ))
          )}
        </ul>
      )}
      {helperText && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{helperText}</p>}
    </div>
  );
}
