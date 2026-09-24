import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Footer row of an SRD list card: the link to the entity's own page, plus any
 * manage controls the caller is allowed to see. The label appends the entity's
 * name so a screen reader's link list tells one card's link from the next, and
 * it opens with the visible phrase so speech input can still act on what a
 * sighted user reads (WCAG 2.5.3 Label in Name).
 *
 * The name is one string rather than a visible run plus a hidden span, because
 * engines disagree about the space at an element boundary: Chrome inserts one
 * there and jsdom trims it, so the same markup yields two different names.
 */
export default function SrdCardFooter({
  href,
  kind,
  name,
  homebrew,
  actions,
}: {
  href: string;
  /** Singular kind shown in the visible text, e.g. "class". */
  kind: string;
  /** The entity's name, for the accessible label. */
  name: string;
  /** Marks a homebrew row so it does not share a name with the SRD row it copies. */
  homebrew?: boolean;
  /** Manage controls, rendered right-aligned when present. */
  actions?: ReactNode;
}) {
  return (
    // The summary is a button, so the page link lives in the card body.
    <div className="flex items-center gap-2 pt-2">
      <Link
        href={href}
        aria-label={`Open ${kind} page (${name}${homebrew ? ', homebrew' : ''})`}
        className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
      >
        Open {kind} page
      </Link>
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </div>
  );
}
