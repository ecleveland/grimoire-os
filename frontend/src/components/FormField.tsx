'use client';

import { useId, type ReactNode } from 'react';

const inputClasses =
  'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:text-gray-500 dark:disabled:text-gray-400';

const labelClasses = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

type SharedProps = {
  label: string;
  required?: boolean;
  helperText?: string;
  error?: string;
  className?: string;
  id?: string;
};

type InputFieldProps = SharedProps & {
  as?: 'input';
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'className' | 'id'>;

type TextareaFieldProps = SharedProps & {
  as: 'textarea';
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'className' | 'id'>;

type SelectFieldProps = SharedProps & {
  as: 'select';
  children?: ReactNode;
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'className' | 'id' | 'children'>;

export type FormFieldProps = InputFieldProps | TextareaFieldProps | SelectFieldProps;

const SHARED_KEYS = ['label', 'helperText', 'error', 'className', 'id', 'as'] as const;

function stripShared<T extends Record<string, unknown>>(
  props: T
): Omit<T, (typeof SHARED_KEYS)[number]> {
  const out: Record<string, unknown> = {};
  for (const key in props) {
    if (!SHARED_KEYS.includes(key as (typeof SHARED_KEYS)[number])) {
      out[key] = props[key];
    }
  }
  return out as Omit<T, (typeof SHARED_KEYS)[number]>;
}

export default function FormField(props: FormFieldProps) {
  const reactId = useId();
  const fieldId = props.id ?? reactId;
  const elementClass = props.className ? `${inputClasses} ${props.className}` : inputClasses;

  return (
    <div>
      <label htmlFor={fieldId} className={labelClasses}>
        {props.label}
        {props.required && <span className="text-red-500"> *</span>}
      </label>
      {renderControl(props, fieldId, elementClass)}
      {props.error ? (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">{props.error}</p>
      ) : props.helperText ? (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{props.helperText}</p>
      ) : null}
    </div>
  );
}

function renderControl(props: FormFieldProps, id: string, className: string): ReactNode {
  if (props.as === 'textarea') {
    return <textarea id={id} className={className} {...stripShared(props)} />;
  }
  if (props.as === 'select') {
    const { children } = props;
    return (
      <select id={id} className={className} {...stripShared(props)}>
        {children}
      </select>
    );
  }
  return <input id={id} className={className} {...stripShared(props)} />;
}
