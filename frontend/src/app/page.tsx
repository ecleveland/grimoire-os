'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import Skeleton from '@/components/Skeleton';

export default function HomePage() {
  const { user, isLoading, likelyAuthenticated } = useAuth();

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">
        {/* Reserve the name while a probable session hydrates so the heading
            doesn't reflow when it fills in (VEG-339). */}
        Welcome,{' '}
        {user ? (
          user.displayName || user.username
        ) : isLoading && likelyAuthenticated ? (
          <Skeleton className="h-7 w-40 align-middle" />
        ) : null}
      </h1>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/campaigns"
          className="block p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-indigo-500 transition-colors"
        >
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Campaigns</h2>
          <p className="text-gray-600 dark:text-gray-400">
            Manage your campaigns, invite players, and track sessions.
          </p>
        </Link>
        <Link
          href="/characters"
          className="block p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-indigo-500 transition-colors"
        >
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Characters</h2>
          <p className="text-gray-600 dark:text-gray-400">
            Create and manage your character sheets.
          </p>
        </Link>
        <Link
          href="/srd"
          className="block p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-indigo-500 transition-colors"
        >
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            SRD Reference
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Browse spells, monsters, items, classes, and races.
          </p>
        </Link>
      </div>
    </div>
  );
}
