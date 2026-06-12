'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import MonsterForm from '@/components/MonsterForm';
import type { MonsterPayload } from '@/lib/monster-form';
import type { SrdMonster } from '@/lib/types';

export default function NewMonsterPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(payload: MonsterPayload) {
    setSubmitting(true);
    try {
      await apiFetch<SrdMonster>('/srd/monsters', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      toast.success('Monster created');
      router.push('/srd/monsters');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create monster');
      setSubmitting(false);
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400 mb-4">
          Sign in to create homebrew monsters.
        </p>
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
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Create Monster</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Homebrew monsters are visible only to you and appear alongside the SRD everywhere monsters
        do — including the encounter tracker.
      </p>
      <MonsterForm
        submitting={submitting}
        submitLabel="Create monster"
        onSubmit={handleSubmit}
        onCancel={() => router.back()}
      />
    </div>
  );
}
