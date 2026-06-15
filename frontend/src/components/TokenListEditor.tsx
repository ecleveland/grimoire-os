'use client';

import { useId, useState } from 'react';

const inputClasses =
  'flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent';
const labelClasses = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

interface TokenListEditorProps {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  /** Optional datalist suggestions (free text is still allowed). */
  suggestions?: readonly string[];
  placeholder?: string;
  helperText?: string;
}

/**
 * Edits a free-form `string[]` as removable chips plus an add input. Used for
 * open-ended lists (languages, weapon/tool proficiencies) where there's no fixed
 * canonical set; `suggestions` wires a datalist but typing a custom value works.
 * Duplicates and blanks are ignored.
 */
export default function TokenListEditor({
  label,
  value,
  onChange,
  suggestions,
  placeholder,
  helperText,
}: TokenListEditorProps) {
  const inputId = useId();
  const listId = useId();
  const [draft, setDraft] = useState('');

  const add = () => {
    const token = draft.trim();
    if (!token) return;
    // Case-insensitive dedupe so "Common" + "common" don't both land.
    if (!value.some(t => t.toLowerCase() === token.toLowerCase())) onChange([...value, token]);
    setDraft('');
  };

  const remove = (token: string) => onChange(value.filter(t => t !== token));

  return (
    <div>
      <label htmlFor={inputId} className={labelClasses}>
        {label}
      </label>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {value.map(token => (
            <span
              key={token}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200"
            >
              {token}
              <button
                type="button"
                aria-label={`Remove ${token}`}
                onClick={() => remove(token)}
                className="text-gray-400 hover:text-red-600 dark:hover:text-red-400"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          id={inputId}
          type="text"
          list={suggestions ? listId : undefined}
          value={draft}
          placeholder={placeholder}
          className={inputClasses}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        {suggestions && (
          <datalist id={listId}>
            {suggestions.map(s => (
              <option key={s} value={s} />
            ))}
          </datalist>
        )}
        <button
          type="button"
          onClick={add}
          className="px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          Add
        </button>
      </div>
      {helperText && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{helperText}</p>}
    </div>
  );
}
