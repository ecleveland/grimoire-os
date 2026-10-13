'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import {
  apiQueryKey,
  invalidateApiPath,
  useApiMutation,
  useApiQuery,
  useDeleteMutation,
} from '@/lib/query';
import type { Campaign } from '@/lib/types';
import FormField from '@/components/FormField';
import ConfirmDialog from '@/components/ConfirmDialog';
import LoadError from '@/components/LoadError';
import LoadingState from '@/components/LoadingState';

type CampaignUpdate = Pick<Campaign, 'name' | 'description' | 'setting' | 'status'>;

export default function EditCampaignPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const detailPath = `/campaigns/${id}`;

  const query = useApiQuery<Campaign | null>(detailPath, {
    errorToast: 'Failed to load campaign',
  });

  const save = useApiMutation(
    (body: CampaignUpdate) =>
      apiFetch<Campaign>(detailPath, { method: 'PATCH', body: JSON.stringify(body) }),
    {
      onSuccess: updated => {
        queryClient.setQueryData(apiQueryKey(detailPath), updated);
        void invalidateApiPath(queryClient, '/campaigns?');
        toast.success('Campaign updated!');
        router.push(detailPath);
      },
      onError: err => {
        toast.error(err instanceof Error ? err.message : 'Failed to update campaign');
      },
    }
  );

  const remove = useDeleteMutation({
    path: '/campaigns',
    invalidate: '/campaigns?',
    onDeleted: () => {
      toast.success('Campaign deleted');
      router.push('/campaigns');
    },
  });

  const handleDelete = () =>
    remove.mutate(id, {
      onError: err => {
        toast.error(err instanceof Error ? err.message : 'Failed to delete campaign');
      },
    });

  const row = query.data;

  // The API answers a campaign the caller can't see, or one that is gone, with
  // an empty body, which reads as null. A cached null that is being refetched
  // falls through to the loading view instead of flashing this.
  if (row === null && !query.isFetching)
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400 mb-4">Campaign not found.</p>
        <Link
          href="/campaigns"
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Back to campaigns
        </Link>
      </div>
    );

  // The failure view is only for a campaign that never loaded, so the page
  // never renders a form of empty defaults that one Save would PATCH over the
  // real record. A reload that fails in the background keeps the form and its
  // unsaved changes, and the error toast still reports the failure. A retry in
  // flight falls through to the loading view.
  if (query.isError && row === undefined && !query.isFetching)
    return <LoadError message="Failed to load campaign." onRetry={() => query.refetch()} />;

  if (row == null) return <LoadingState />;

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Edit Campaign</h1>
      <CampaignEditForm
        initial={row}
        submitting={save.isPending || save.isSuccess}
        onSubmit={body => save.mutate(body)}
        onCancel={() => router.back()}
        onDelete={() => setConfirmDeleteOpen(true)}
      />
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

function CampaignEditForm({
  initial,
  submitting,
  onSubmit,
  onCancel,
  onDelete,
}: {
  initial: Campaign;
  submitting: boolean;
  onSubmit: (body: CampaignUpdate) => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description ?? '');
  const [setting, setSetting] = useState(initial.setting ?? '');
  const [status, setStatus] = useState<Campaign['status']>(initial.status);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ name, description, setting, status });
  };

  return (
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
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="px-4 py-2 text-red-600 border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        >
          Delete
        </button>
      </div>
    </form>
  );
}
