'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import Skeleton from './Skeleton';

/**
 * The "Create <entity>" affordance on SRD list pages — visible only to
 * authenticated users. While the session is still hydrating but a csrf cookie
 * suggests a logged-in browser (`isLoading && likelyAuthenticated`), it reserves
 * the button's footprint with a skeleton so the heading row doesn't reflow when
 * the real button appears. Settled-anonymous visitors see nothing, exactly as
 * before (VEG-339).
 */
export default function CreateEntityLink({ href, label }: { href: string; label: string }) {
  const { isAuthenticated, isLoading, likelyAuthenticated } = useAuth();

  if (isAuthenticated) {
    return (
      <Link
        href={href}
        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
      >
        {label}
      </Link>
    );
  }

  // h-9 matches the button's box (py-2 + text-sm line); w-36 approximates the
  // label width so the row reserves the same vertical space it will settle into.
  if (isLoading && likelyAuthenticated) {
    return <Skeleton className="h-9 w-36" />;
  }

  return null;
}
