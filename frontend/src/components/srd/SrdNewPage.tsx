'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { invalidateApiPath, useApiMutation } from '@/lib/query';
import { SRD_REGISTRY, type SrdKind } from '@/lib/srd-registry';

export default function SrdNewPage({ kind }: { kind: SrdKind }) {
  const entry = SRD_REGISTRY[kind];
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const mutation = useApiMutation(
    (payload: unknown) =>
      apiFetch(entry.apiPath, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    {
      onSuccess: async () => {
        toast.success(`${entry.label} created`);
        // The list holds a staleTime, so wait for the invalidation before
        // landing on it, or it shows the cached rows without the new one.
        await invalidateApiPath(queryClient, entry.apiPath);
        router.push(entry.listPath);
      },
      onError: err => {
        console.error(`Failed to create ${kind}:`, err);
        toast.error(err instanceof Error ? err.message : `Failed to create ${kind}`);
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
        <p className="text-gray-500 dark:text-gray-400 mb-4">
          Sign in to create homebrew {entry.plural}.
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
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
        Create {entry.label}
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{entry.createBlurb}</p>
      {entry.renderForm({
        submitting: mutation.isPending || mutation.isSuccess,
        submitLabel: `Create ${entry.label.toLowerCase()}`,
        onSubmit: payload => mutation.mutate(payload),
        onCancel: () => router.back(),
      })}
    </div>
  );
}
