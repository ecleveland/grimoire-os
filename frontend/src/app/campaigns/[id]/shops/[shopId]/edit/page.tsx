'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useApiQuery, useApiMutation, invalidateApiPath } from '@/lib/query';
import { useAuth } from '@/lib/auth-context';
import { toast } from 'sonner';
import ConfirmDialog from '@/components/ConfirmDialog';
import ShopForm, { toShopBody, type ShopFormValues } from '@/components/ShopForm';
import type { Campaign, Shop } from '@/lib/types';

function toFormValues(shop: Shop): ShopFormValues {
  return {
    name: shop.name,
    theme: shop.theme,
    description: shop.description ?? '',
    icon: shop.icon ?? '',
    accent: shop.accent ?? '',
    isOpen: shop.isOpen,
    items: shop.items,
  };
}

export default function EditShopPage() {
  const { id: campaignId, shopId } = useParams<{ id: string; shopId: string }>();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const campaignQuery = useApiQuery<Campaign>(`/campaigns/${campaignId}`, {
    errorToast: { message: 'Failed to load campaign', id: 'load-campaign' },
  });
  const isOwner = Boolean(campaignQuery.data && user && campaignQuery.data.ownerId === user.userId);

  const shopQuery = useApiQuery<Shop>(`/shops/${shopId}`, {
    errorToast: { message: 'Failed to load shop', id: 'load-shop' },
  });
  const shop = shopQuery.data ?? null;

  const save = useApiMutation(
    (values: ShopFormValues) =>
      apiFetch<Shop>(`/shops/${shopId}`, {
        method: 'PATCH',
        body: JSON.stringify(toShopBody(values)),
      }),
    {
      onSuccess: async () => {
        toast.success('Shop updated');
        await invalidateApiPath(queryClient, `/shops?campaignId=${campaignId}&`);
        queryClient.invalidateQueries({ queryKey: ['api', `/shops/${shopId}`] });
        router.push(`/campaigns/${campaignId}/shops/${shopId}`);
      },
      onError: err => toast.error(err instanceof Error ? err.message : 'Failed to update shop'),
    }
  );

  const remove = useApiMutation(() => apiFetch(`/shops/${shopId}`, { method: 'DELETE' }), {
    onSuccess: async () => {
      toast.success('Shop deleted');
      await invalidateApiPath(queryClient, `/shops?campaignId=${campaignId}&`);
      router.push(`/campaigns/${campaignId}/shops`);
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Failed to delete shop'),
  });

  const backLink = (
    <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
      <Link
        href={`/campaigns/${campaignId}/shops/${shopId}`}
        className="text-indigo-600 hover:text-indigo-700"
      >
        ← Back to shop
      </Link>
    </p>
  );

  if (campaignQuery.isLoading || shopQuery.isLoading || authLoading) {
    return <div className="text-gray-500 dark:text-gray-400">Loading...</div>;
  }
  if (!shop) {
    return (
      <div>
        {backLink}
        <p className="text-gray-500 dark:text-gray-400">Shop not found.</p>
      </div>
    );
  }
  if (!isOwner) {
    return (
      <div>
        {backLink}
        <p className="text-gray-500 dark:text-gray-400">Only the campaign owner can edit shops.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {backLink}
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Edit Shop</h1>
      <ShopForm
        initial={toFormValues(shop)}
        submitting={save.isPending}
        submitLabel="Save changes"
        onSubmit={values => save.mutate(values)}
        onCancel={() => router.push(`/campaigns/${campaignId}/shops/${shopId}`)}
      />

      <div className="mt-10 pt-6 border-t border-gray-200 dark:border-gray-700">
        <h2 className="text-sm font-medium text-red-600 dark:text-red-400 mb-2">Danger zone</h2>
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          disabled={remove.isPending}
          className="px-4 py-2 text-sm border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 disabled:opacity-50 transition-colors"
        >
          Delete shop
        </button>
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={open => {
          if (!open) setConfirmingDelete(false);
        }}
        title="Delete shop?"
        description={`Delete "${shop.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => remove.mutate(undefined)}
      />
    </div>
  );
}
