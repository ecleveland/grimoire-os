'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import type { Campaign } from '@/lib/types';
import FormField from '@/components/FormField';
import ConfirmDialog from '@/components/ConfirmDialog';

export default function EditCampaignPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [setting, setSetting] = useState('');
  const [status, setStatus] = useState<Campaign['status']>('active');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    setLoadError(false);
    apiFetch<Campaign>(`/campaigns/${id}`)
      .then(c => {
        setName(c.name);
        setDescription(c.description || '');
        setSetting(c.setting || '');
        setStatus(c.status);
      })
      .catch(() => {
        // Without this flag the form would render empty defaults and one Save
        // would PATCH them over the real record (VEG-317).
        setLoadError(true);
        toast.error('Failed to load campaign');
      })
      .finally(() => setLoading(false));
  }, [id, reloadKey]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch(`/campaigns/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name, description, setting, status }),
      });
      toast.success('Campaign updated!');
      router.push(`/campaigns/${id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update campaign');
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    try {
      await apiFetch(`/campaigns/${id}`, { method: 'DELETE' });
      toast.success('Campaign deleted');
      router.push('/campaigns');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete campaign');
    }
  };

  if (loading) return <div className="text-gray-500 dark:text-gray-400">Loading...</div>;
  if (loadError)
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400 mb-4">Failed to load campaign.</p>
        <button
          type="button"
          onClick={() => setReloadKey(k => k + 1)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Edit Campaign</h1>
      <form
        onSubmit={handleSubmit}
        className="space-y-5 bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700"
      >
        <FormField
          label="Name"
          type="text"
          required
          value={name}
          onChange={e => setName(e.target.value)}
        />
        <FormField
          as="textarea"
          label="Description"
          rows={3}
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
        <FormField
          label="Setting"
          type="text"
          value={setting}
          onChange={e => setSetting(e.target.value)}
        />
        <FormField
          as="select"
          label="Status"
          value={status}
          onChange={e => setStatus(e.target.value as Campaign['status'])}
        >
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="completed">Completed</option>
        </FormField>
        <div className="flex items-center justify-between pt-2">
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
          </div>
          <button
            type="button"
            onClick={() => setConfirmDeleteOpen(true)}
            className="px-4 py-2 text-red-600 border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            Delete
          </button>
        </div>
      </form>
      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title="Delete campaign?"
        description="Deleting this campaign permanently deletes all of its notes, encounters, and NPCs. Characters survive but are unlinked from the campaign. This cannot be undone."
        variant="danger"
        onConfirm={handleDelete}
      />
    </div>
  );
}
