'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import type { Campaign } from '@/lib/types';

export default function NewCampaignPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [setting, setSetting] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const campaign = await apiFetch<Campaign>('/campaigns', {
        method: 'POST',
        body: JSON.stringify({ name, description, setting }),
      });
      toast.success('Campaign created!');
      router.push(`/campaigns/${campaign.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create campaign');
      setSubmitting(false);
    }
  };

  const inputClass =
    'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent';

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Create Campaign</h1>
      <form onSubmit={handleSubmit} className="space-y-5 bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Name <span className="text-red-500">*</span>
          </label>
          <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Setting</label>
          <input type="text" value={setting} onChange={(e) => setSetting(e.target.value)} className={inputClass} />
        </div>
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Creating...' : 'Create Campaign'}
          </button>
          <button type="button" onClick={() => router.back()} className="px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
