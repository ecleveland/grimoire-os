'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api';
import { invalidateApiPath, useApiQuery } from '@/lib/query';
import { toast } from 'sonner';
import type { Character } from '@/lib/types';
import ConfirmDialog from '@/components/ConfirmDialog';
import CharacterEditorForm, {
  characterFormPayload,
  characterToFormValues,
  type CharacterFormValues,
} from '@/components/CharacterEditorForm';

export default function EditCharacterPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  // Bumped after a 409 reload to remount the form with the freshly-fetched
  // values (the form seeds its state from initialValues only on mount).
  const [formKey, setFormKey] = useState(0);

  const query = useApiQuery<Character>(`/characters/${id}`, {
    errorToast: 'Failed to load character',
  });
  const character = query.data;

  const handleSubmit = async (values: CharacterFormValues) => {
    if (!character) return;
    setSubmitting(true);
    try {
      await apiFetch(`/characters/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...characterFormPayload(values),
          // Optimistic-locking guard (VEG-137): reject if the row moved on since
          // we loaded it, rather than silently clobbering a concurrent edit.
          expectedVersion: character.version,
        }),
      });
      toast.success('Character updated!');
      // The sheet reads the same `/characters/:id` query cache; without this it
      // would render the pre-edit values after we navigate back to it.
      await invalidateApiPath(queryClient, `/characters/${id}`);
      router.push(`/characters/${id}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Reload the latest server state, then remount the form (it seeds from
        // initialValues only on mount) so the next save carries the new version.
        // refetch() resolves with a result rather than throwing, so inspect it:
        // if the reload itself failed, say so instead of falsely claiming the
        // form now holds the latest.
        const result = await query.refetch();
        if (result.isError || !result.data) {
          toast.error(
            'This character was changed elsewhere, and reloading the latest version failed — refresh the page and try again.'
          );
        } else {
          toast.error(
            'This character was changed elsewhere. Reloaded the latest version — re-apply your changes and save again.'
          );
          setFormKey(k => k + 1);
        }
      } else {
        toast.error(err instanceof Error ? err.message : 'Failed to update character');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    try {
      await apiFetch(`/characters/${id}`, { method: 'DELETE' });
      toast.success('Character deleted');
      router.push('/characters');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete character');
    }
  };

  if (query.isLoading) return <div className="text-gray-500 dark:text-gray-400">Loading...</div>;
  // Guard on `!character`, not `isError`: an initial-load failure leaves us with
  // no data (show Retry — without it the form would render defaults and one Save
  // would PATCH them over the real record, VEG-317). But react-query keeps the
  // last good `data` when a *refetch* fails (e.g. the post-409 reload), so keying
  // off `isError` here would discard the user's in-progress edits on a transient
  // blip. With data in hand we keep the form mounted.
  if (!character)
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400 mb-4">Failed to load character.</p>
        <button
          type="button"
          onClick={() => query.refetch()}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Edit Character</h1>
      <CharacterEditorForm
        key={formKey}
        initialValues={characterToFormValues(character)}
        submitLabel="Save Changes"
        submitting={submitting}
        onSubmit={handleSubmit}
        onCancel={() => router.back()}
        footerExtra={
          <button
            type="button"
            onClick={() => setConfirmDeleteOpen(true)}
            className="px-4 py-2 text-red-600 border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            Delete
          </button>
        }
      />
      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title="Delete character?"
        description="Are you sure you want to delete this character? This cannot be undone."
        variant="danger"
        onConfirm={handleDelete}
      />
    </div>
  );
}
