'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateApiPath } from '@/lib/query';
import BackgroundForm from '@/components/BackgroundForm';
import type { BackgroundPayload } from '@/lib/background-form';
import type { SrdBackground } from '@/lib/types';

export default function NewBackgroundPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(payload: BackgroundPayload) {
    setSubmitting(true);
    try {
      await apiFetch<SrdBackground>('/srd/backgrounds', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      toast.success('Background created');
      await invalidateApiPath(queryClient, '/srd/backgrounds');
      router.push('/srd/backgrounds');
    } catch (err) {
      console.error('Failed to create background:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to create background');
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
        <p className="text-gray-500 dark:text-gray-400 mb-4">
          Sign in to create homebrew backgrounds.
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
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Create Background</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Homebrew backgrounds are visible only to you and appear alongside the SRD everywhere
        backgrounds do — including the character builder. The origin feat may be an SRD feat or one
        of your own homebrew feats.
      </p>
      <BackgroundForm
        submitting={submitting}
        submitLabel="Create background"
        onSubmit={handleSubmit}
        onCancel={() => router.back()}
      />
    </div>
  );
}
