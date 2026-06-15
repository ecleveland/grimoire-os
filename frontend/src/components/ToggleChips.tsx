'use client';

const legendClasses = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

interface ToggleChipsProps {
  label: string;
  options: readonly string[];
  value: string[];
  onChange: (next: string[]) => void;
  /** Options to visually mark (e.g. the class's skill pool). */
  highlight?: readonly string[];
  helperText?: string;
}

/**
 * A toggle group over a fixed option set — click a chip to add/remove it from
 * `value`. Used for the canonical 5e sets (saving throws, skills, armor
 * training). Each chip is an `aria-pressed` toggle button.
 */
export default function ToggleChips({
  label,
  options,
  value,
  onChange,
  highlight,
  helperText,
}: ToggleChipsProps) {
  const selected = new Set(value);
  const pool = new Set(highlight ?? []);

  // Always render any selected value, even one outside the canonical option set
  // (legacy/homebrew data, or an SRD grant that didn't normalize). Otherwise it
  // would be invisible here yet still persist — and un-removable.
  const extras = value.filter(v => !options.includes(v));
  const allOptions = extras.length ? [...options, ...extras] : options;

  const toggle = (opt: string) =>
    onChange(selected.has(opt) ? value.filter(v => v !== opt) : [...value, opt]);

  return (
    <fieldset>
      <legend className={legendClasses}>{label}</legend>
      <div className="flex flex-wrap gap-2">
        {allOptions.map(opt => {
          const on = selected.has(opt);
          return (
            <button
              key={opt}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(opt)}
              className={`px-2.5 py-1 text-sm rounded-full border transition-colors ${
                on
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600'
              }`}
            >
              {opt}
              {pool.has(opt) && (
                <span aria-hidden="true" title="from your class" className="ml-1 opacity-80">
                  ★
                </span>
              )}
            </button>
          );
        })}
      </div>
      {helperText && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{helperText}</p>}
    </fieldset>
  );
}
