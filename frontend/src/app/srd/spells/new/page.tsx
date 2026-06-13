'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import SpellForm from '@/components/SpellForm';
import type { SpellPayload } from '@/lib/spell-form';
import type { SrdSpell } from '@/lib/types';

export default function NewSpellPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(payload: SpellPayload) {
    setSubmitting(true);
    try {
      await apiFetch<SrdSpell>('/srd/spells', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      toast.success('Spell created');
      router.push('/srd/spells');
    } catch (err) {
      console.error('Failed to create spell:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to create spell');
      setSubmitting(false);
    }
  }

  // Hold the sign-in prompt until hydration settles so an already-authed user
  // doesn't flash "Sign in to…" before the form appears. (VEG-320)
  if (authLoading) {
    return null;
  }

  if (!isAuthenticated) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400 mb-4">Sign in to create homebrew spells.</p>
        <Link
          href="/login"
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Create Spell</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Homebrew spells are visible only to you and appear alongside the SRD everywhere spells do.
      </p>
      <SpellForm
        submitting={submitting}
        submitLabel="Create spell"
        onSubmit={handleSubmit}
        onCancel={() => router.back()}
      />
    </div>
  );
}
