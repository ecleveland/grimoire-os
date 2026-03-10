'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import type { Campaign } from '@/lib/types';

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  paused: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  completed: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<Campaign[]>('/campaigns')
      .then(setCampaigns)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-gray-500 dark:text-gray-400">Loading campaigns...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Campaigns</h1>
        <Link
          href="/campaigns/new"
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          New Campaign
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">No campaigns yet. Create one to get started!</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((c) => (
            <Link
              key={c.id}
              href={`/campaigns/${c.id}`}
              className="block p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-indigo-500 transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{c.name}</h2>
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusColors[c.status] || ''}`}>
                  {c.status}
                </span>
              </div>
              {c.description && (
                <p className="text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">{c.description}</p>
              )}
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {c.playerIds.length} player{c.playerIds.length !== 1 ? 's' : ''}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
