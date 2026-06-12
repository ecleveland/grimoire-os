'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import FeatForm from '@/components/FeatForm';
import type { FeatPayload } from '@/lib/feat-form';
import type { SrdFeat } from '@/lib/types';

export default function EditFeatPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isAdmin, user } = useAuth();
  const [feat, setFeat] = useState<SrdFeat | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setLoadError(false);
    apiFetch<SrdFeat | null>(`/srd/feats/${id}`)
      .then(data => {
        // The detail endpoint returns null for ids outside the caller's
        // visibility (missing, or someone else's homebrew) — treat both as a
        // failed load rather than rendering an empty editable form (VEG-317).
        if (!data) {
          setLoadError(true);
          return;
        }
        setFeat(data);
      })
      .catch(err => {
        console.error('Failed to load feat:', err);
        setLoadError(true);
        toast.error('Failed to load feat');
      });
  }, [id, reloadKey]);

  async function handleSubmit(payload: FeatPayload) {
    setSubmitting(true);
    try {
      await apiFetch<SrdFeat>(`/srd/feats/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      toast.success('Feat updated');
      router.push('/srd/feats');
    } catch (err) {
      console.error('Failed to update feat:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to update feat');
      setSubmitting(false);
    }
  }

  if (loadError)
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400 mb-4">Failed to load feat.</p>
        <button
          type="button"
          onClick={() => setReloadKey(k => k + 1)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  if (!feat) return <div className="text-gray-500 dark:text-gray-400">Loading...</div>;

  const canEdit =
    (feat.contentSource === 'homebrew' && feat.createdById === user?.userId) ||
    (feat.contentSource === 'shared' && isAdmin);

  if (!canEdit)
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400 mb-4">
          You can only edit your own homebrew feats.
        </p>
        <Link
          href="/srd/feats"
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Back to feats
        </Link>
      </div>
    );

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Edit Feat</h1>
      <FeatForm
        initial={feat}
        submitting={submitting}
        submitLabel="Save changes"
        onSubmit={handleSubmit}
        onCancel={() => router.back()}
      />
    </div>
  );
}
