import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Footer row of an SRD list card: the link to the entity's own page, plus any
 * manage controls the caller is allowed to see. The link names the entity in its
 * accessible label, so a screen reader's link list tells one card's link from
 * the next.
 */
export default function SrdCardFooter({
  href,
  kind,
  name,
  actions,
}: {
  href: string;
  /** Singular kind shown in the visible text, e.g. "class". */
  kind: string;
  /** The entity's name, for the accessible label. */
  name: string;
  /** Manage controls, rendered right-aligned when present. */
  actions?: ReactNode;
}) {
  return (
    // The summary is a button, so the page link lives in the card body.
    <div className="flex items-center gap-2 pt-2">
      <Link
        href={href}
        aria-label={`Open ${name} ${kind} page`}
        className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
      >
        Open {kind} page
      </Link>
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </div>
  );
}
