'use client';

import { useState } from 'react';
import Markdown from '@/components/Markdown';
import { splitFeatureOptions } from '@/lib/feature-options';

interface FeatureTextProps {
  description: string;
  /** Goes on the body's Markdown wrapper. */
  className?: string;
}

/**
 * A feature description as markdown, with any option list after an
 * `**Options**` line moved into a group behind a Show N options toggle. A
 * description with no option list renders as plain markdown.
 *
 * The option panel mounts only while open, because Eldritch Invocations alone
 * carries 28 options.
 */
export default function FeatureText({ description, className }: FeatureTextProps) {
  const [open, setOpen] = useState(false);
  const { body, options } = splitFeatureOptions(description);
  const count = options.length;

  // Bare markdown when there is nothing to group, so such a feature renders as
  // it always has. One wrapper otherwise, so a parent's space-y spacing treats
  // the body, toggle and list as one block.
  if (count === 0) return <Markdown className={className}>{body}</Markdown>;

  return (
    <div>
      {/* Left out when the description opens with the list, so no empty
          wrapper carries the caller's margin above the toggle. */}
      {body && <Markdown className={className}>{body}</Markdown>}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="mt-1 text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700"
      >
        {open ? 'Hide options' : `Show ${count} ${count === 1 ? 'option' : 'options'}`}
      </button>
      {open && (
        <ul className="mt-2 border-l-2 border-indigo-200 dark:border-indigo-800 pl-3 space-y-3 min-w-0">
          {/* Keyed by position, because the list never reorders and a
              homebrew author can repeat an option name. */}
          {options.map((option, i) => (
            <li key={i}>
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {option.name}
              </span>
              {option.meta && (
                <p className="text-xs text-gray-500 dark:text-gray-400">{option.meta}</p>
              )}
              {option.description && <Markdown>{option.description}</Markdown>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
