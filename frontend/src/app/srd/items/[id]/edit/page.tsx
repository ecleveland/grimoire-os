'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import ItemForm from '@/components/ItemForm';
import type { ItemPayload } from '@/lib/item-form';
import type { SrdItem } from '@/lib/types';

export default function EditItemPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isAdmin, user } = useAuth();
  const [item, setItem] = useState<SrdItem | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setLoadError(false);
    apiFetch<SrdItem | null>(`/srd/items/${id}`)
      .then(data => {
        // The detail endpoint returns null for ids outside the caller's
        // visibility (missing, or someone else's homebrew) — treat both as a
        // failed load rather than rendering an empty editable form (VEG-317).
        if (!data) {
          setLoadError(true);
          return;
        }
        setItem(data);
      })
      .catch(err => {
        console.error('Failed to load item:', err);
        setLoadError(true);
        toast.error('Failed to load item');
      });
  }, [id, reloadKey]);

  async function handleSubmit(payload: ItemPayload) {
    setSubmitting(true);
    try {
      await apiFetch<SrdItem>(`/srd/items/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      toast.success('Item updated');
      router.push('/srd/items');
    } catch (err) {
      console.error('Failed to update item:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to update item');
      setSubmitting(false);
    }
  }

  if (loadError)
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400 mb-4">Failed to load item.</p>
        <button
          type="button"
          onClick={() => setReloadKey(k => k + 1)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  if (!item) return <div className="text-gray-500 dark:text-gray-400">Loading...</div>;

  const canEdit =
    (item.contentSource === 'homebrew' && item.createdById === user?.userId) ||
    (item.contentSource === 'shared' && isAdmin);

  if (!canEdit)
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400 mb-4">
          You can only edit your own homebrew items.
        </p>
        <Link
          href="/srd/items"
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Back to items
        </Link>
      </div>
    );

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Edit Item</h1>
      <ItemForm
        initial={item}
        submitting={submitting}
        submitLabel="Save changes"
        onSubmit={handleSubmit}
        onCancel={() => router.back()}
      />
    </div>
  );
}
