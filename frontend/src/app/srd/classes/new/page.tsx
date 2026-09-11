'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import ClassForm from '@/components/ClassForm';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { ClassPayload } from '@/lib/class-form';
import { invalidateApiPath, useApiMutation } from '@/lib/query';
import type { SrdClass } from '@/lib/types';

export default function NewClassPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const mutation = useApiMutation(
    (payload: ClassPayload) =>
      apiFetch<SrdClass>('/srd/classes', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    {
      onSuccess: async () => {
        toast.success('Class created');
        await invalidateApiPath(queryClient, '/srd/classes');
        router.push('/srd/classes');
      },
      onError: err => {
        console.error('Failed to create class:', err);
        toast.error(err instanceof Error ? err.message : 'Failed to create class');
      },
    }
  );

  // Hold the sign-in prompt until auth hydrates, so a signed-in user never sees
  // it flash before the form.
  if (authLoading) {
    return null;
  }

  if (!isAuthenticated) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400 mb-4">Sign in to create homebrew classes.</p>
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
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Create Class</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Homebrew classes are visible only to you and appear alongside the SRD classes everywhere
        classes do, including the character builder.
      </p>
      <ClassForm
        submitting={mutation.isPending}
        submitLabel="Create class"
        onSubmit={payload => mutation.mutate(payload)}
        onCancel={() => router.back()}
      />
    </div>
  );
}
