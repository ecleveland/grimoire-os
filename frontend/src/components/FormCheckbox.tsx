'use client';

import { useId } from 'react';

interface FormCheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  id?: string;
  className?: string;
}

/** A labelled checkbox in the style the entity forms share. */
export default function FormCheckbox({
  label,
  checked,
  onChange,
  id,
  className,
}: FormCheckboxProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const labelClass = ['flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300', className]
    .filter(Boolean)
    .join(' ');

  return (
    <label htmlFor={inputId} className={labelClass}>
      <input
        id={inputId}
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
      />
      {label}
    </label>
  );
}
