'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import MonsterForm from '@/components/MonsterForm';
import type { MonsterPayload } from '@/lib/monster-form';
import type { SrdMonster } from '@/lib/types';

export default function EditMonsterPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isAdmin, user } = useAuth();
  const [monster, setMonster] = useState<SrdMonster | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setLoadError(false);
    apiFetch<SrdMonster | null>(`/srd/monsters/${id}`)
      .then(data => {
        // The detail endpoint returns null for ids outside the caller's
        // visibility (missing, or someone else's homebrew) — treat both as a
        // failed load rather than rendering an empty editable form (VEG-317).
        if (!data) {
          setLoadError(true);
          return;
        }
        setMonster(data);
      })
      .catch(err => {
        console.error('Failed to load monster:', err);
        setLoadError(true);
        toast.error('Failed to load monster');
      });
  }, [id, reloadKey]);

  async function handleSubmit(payload: MonsterPayload) {
    setSubmitting(true);
    try {
      await apiFetch<SrdMonster>(`/srd/monsters/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      toast.success('Monster updated');
      router.push('/srd/monsters');
    } catch (err) {
      console.error('Failed to update monster:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to update monster');
      setSubmitting(false);
    }
  }

  if (loadError)
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400 mb-4">Failed to load monster.</p>
        <button
          type="button"
          onClick={() => setReloadKey(k => k + 1)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  if (!monster) return <div className="text-gray-500 dark:text-gray-400">Loading...</div>;

  const canEdit =
    (monster.contentSource === 'homebrew' && monster.createdById === user?.userId) ||
    (monster.contentSource === 'shared' && isAdmin);

  if (!canEdit)
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400 mb-4">
          You can only edit your own homebrew monsters.
        </p>
        <Link
          href="/srd/monsters"
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Back to monsters
        </Link>
      </div>
    );

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Edit Monster</h1>
      <MonsterForm
        initial={monster}
        submitting={submitting}
        submitLabel="Save changes"
        onSubmit={handleSubmit}
        onCancel={() => router.back()}
      />
    </div>
  );
}
