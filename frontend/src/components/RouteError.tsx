'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export type RouteErrorProps = {
  /** The error Next caught. Server errors arrive with a redacted message and a `digest`. */
  error: Error & { digest?: string };
  /** Re-renders the failed segment. */
  reset: () => void;
  /** Names what failed, such as "campaign". Omit for the app-wide boundary. */
  scope?: string;
};

/**
 * Shared body for every `error.tsx` boundary. It replaces only the segment that
 * threw, so the header and the rest of the layout stay usable.
 */
export default function RouteError({ error, reset, scope }: RouteErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const heading = scope ? `This ${scope} hit an error` : 'Something went wrong';

  return (
    <div
      role="alert"
      className="max-w-2xl mx-auto rounded-lg border border-red-200 dark:border-red-900 bg-white dark:bg-gray-800 p-6"
    >
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{heading}</h2>
      <p className="mt-2 text-sm text-gray-700 dark:text-gray-300 break-words">
        {error.message || 'An unexpected error occurred.'}
      </p>
      {error.digest && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Error reference {error.digest}
        </p>
      )}
      <div className="mt-4 flex items-center gap-4">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Try again
        </button>
        <Link href="/" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
          Go home
        </Link>
      </div>
    </div>
  );
}
