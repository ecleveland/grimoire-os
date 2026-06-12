'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import SpellForm from '@/components/SpellForm';
import type { SpellPayload } from '@/lib/spell-form';
import type { SrdSpell } from '@/lib/types';

export default function EditSpellPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isAdmin, user } = useAuth();
  const [spell, setSpell] = useState<SrdSpell | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setLoadError(false);
    apiFetch<SrdSpell | null>(`/srd/spells/${id}`)
      .then(data => {
        // The detail endpoint returns null for ids outside the caller's
        // visibility (missing, or someone else's homebrew) — treat both as a
        // failed load rather than rendering an empty editable form (VEG-317).
        if (!data) {
          setLoadError(true);
          return;
        }
        setSpell(data);
      })
      .catch(err => {
        console.error('Failed to load spell:', err);
        setLoadError(true);
        toast.error('Failed to load spell');
      });
  }, [id, reloadKey]);

  async function handleSubmit(payload: SpellPayload) {
    setSubmitting(true);
    try {
      await apiFetch<SrdSpell>(`/srd/spells/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      toast.success('Spell updated');
      router.push('/srd/spells');
    } catch (err) {
      console.error('Failed to update spell:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to update spell');
      setSubmitting(false);
    }
  }

  if (loadError)
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400 mb-4">Failed to load spell.</p>
        <button
          type="button"
          onClick={() => setReloadKey(k => k + 1)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  if (!spell) return <div className="text-gray-500 dark:text-gray-400">Loading...</div>;

  const canEdit =
    (spell.contentSource === 'homebrew' && spell.createdById === user?.userId) ||
    (spell.contentSource === 'shared' && isAdmin);

  if (!canEdit)
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400 mb-4">
          You can only edit your own homebrew spells.
        </p>
        <Link
          href="/srd/spells"
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Back to spells
        </Link>
      </div>
    );

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Edit Spell</h1>
      <SpellForm
        initial={spell}
        submitting={submitting}
        submitLabel="Save changes"
        onSubmit={handleSubmit}
        onCancel={() => router.back()}
      />
    </div>
  );
}
