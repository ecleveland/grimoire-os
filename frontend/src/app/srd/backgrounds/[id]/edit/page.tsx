'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateApiPath } from '@/lib/query';
import BackgroundForm from '@/components/BackgroundForm';
import type { BackgroundPayload } from '@/lib/background-form';
import type { SrdBackground } from '@/lib/types';

export default function EditBackgroundPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAdmin, user, isLoading: authLoading } = useAuth();
  const [background, setBackground] = useState<SrdBackground | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setLoadError(false);
    apiFetch<SrdBackground | null>(`/srd/backgrounds/${id}`)
      .then(data => {
        // The detail endpoint returns null for ids outside the caller's
        // visibility (missing, or someone else's homebrew) — treat both as a
        // failed load rather than rendering an empty editable form (VEG-317).
        if (!data) {
          setLoadError(true);
          return;
        }
        setBackground(data);
      })
      .catch(err => {
        console.error('Failed to load background:', err);
        setLoadError(true);
        toast.error('Failed to load background');
      });
  }, [id, reloadKey]);

  async function handleSubmit(payload: BackgroundPayload) {
    setSubmitting(true);
    try {
      await apiFetch<SrdBackground>(`/srd/backgrounds/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      toast.success('Background updated');
      await invalidateApiPath(queryClient, '/srd/backgrounds');
      router.push('/srd/backgrounds');
    } catch (err) {
      console.error('Failed to update background:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to update background');
      setSubmitting(false);
    }
  }

  if (loadError)
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400 mb-4">Failed to load background.</p>
        <button
          type="button"
          onClick={() => setReloadKey(k => k + 1)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  // Wait for both the background load and session hydration before judging edit
  // rights: the GET can resolve before `user`/`isAdmin` hydrate, and evaluating
  // canEdit then would falsely deny a legitimate owner/admin (VEG-320).
  if (authLoading || !background)
    return <div className="text-gray-500 dark:text-gray-400">Loading...</div>;

  const canEdit =
    (background.contentSource === 'homebrew' && background.createdById === user?.userId) ||
    (background.contentSource === 'shared' && isAdmin);

  if (!canEdit)
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400 mb-4">
          You can only edit your own homebrew backgrounds.
        </p>
        <Link
          href="/srd/backgrounds"
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Back to backgrounds
        </Link>
      </div>
    );

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Edit Background</h1>
      <BackgroundForm
        initial={background}
        submitting={submitting}
        submitLabel="Save changes"
        onSubmit={handleSubmit}
        onCancel={() => router.back()}
      />
    </div>
  );
}
