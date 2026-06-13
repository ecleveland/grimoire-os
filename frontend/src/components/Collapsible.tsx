'use client';

import { useState, type ReactNode } from 'react';

/**
 * Accordion card used by the SRD reference pages (classes/races/backgrounds).
 * The only interactive state is open/closed, so this stays a small client island
 * inside otherwise server-rendered pages (VEG-320): the `summary`, `headerAside`,
 * and detail `children` are all server-rendered markup passed in as props.
 *
 * The detail panel is kept in the DOM (toggled via the `hidden` attribute) rather
 * than conditionally mounted, so its content ships in the server HTML and stays
 * crawlable even while collapsed.
 */
export default function Collapsible({
  summary,
  headerAside,
  children,
}: {
  summary: ReactNode;
  /** Rendered as a sibling of the toggle button (e.g. a print toggle). */
  headerAside?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          className="flex-1 flex items-center justify-between p-4 text-left"
        >
          {summary}
          <span className="text-gray-400 text-lg" aria-hidden="true">
            {open ? '−' : '+'}
          </span>
        </button>
        {headerAside}
      </div>
      <div
        hidden={!open}
        className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 pt-3 space-y-3"
      >
        {children}
      </div>
    </div>
  );
}
