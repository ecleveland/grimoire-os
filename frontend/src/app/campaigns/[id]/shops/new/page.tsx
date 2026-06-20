'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useApiQuery, useApiMutation, invalidateApiPath } from '@/lib/query';
import { useAuth } from '@/lib/auth-context';
import { toast } from 'sonner';
import ShopForm, { EMPTY_SHOP_FORM, toShopBody, type ShopFormValues } from '@/components/ShopForm';
import type { Campaign, Shop, ShopLineItem } from '@/lib/types';

export default function NewShopPage() {
  const { id: campaignId } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  const campaignQuery = useApiQuery<Campaign>(`/campaigns/${campaignId}`, {
    errorToast: { message: 'Failed to load campaign', id: 'load-campaign' },
  });
  const isOwner = Boolean(campaignQuery.data && user && campaignQuery.data.ownerId === user.userId);

  const create = useApiMutation(
    (values: ShopFormValues) =>
      apiFetch<Shop>('/shops', {
        method: 'POST',
        body: JSON.stringify({ campaignId, ...toShopBody(values) }),
      }),
    {
      onSuccess: async shop => {
        toast.success('Shop created');
        await invalidateApiPath(queryClient, `/shops?campaignId=${campaignId}&`);
        router.push(`/campaigns/${campaignId}/shops/${shop.id}`);
      },
      onError: err => toast.error(err instanceof Error ? err.message : 'Failed to create shop'),
    }
  );

  // Theme→stock suggester for the builder (VEG-355). Returns the suggested
  // line items; ShopForm appends them (deduped) so the DM can edit before save.
  const suggestStock = (theme: string) =>
    apiFetch<{ items: ShopLineItem[] }>(
      `/shops/theme-suggestions?theme=${encodeURIComponent(theme)}`
    ).then(res => res.items);

  const backLink = (
    <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
      <Link
        href={`/campaigns/${campaignId}/shops`}
        className="text-indigo-600 hover:text-indigo-700"
      >
        ← Back to shops
      </Link>
    </p>
  );

  if (campaignQuery.isLoading || authLoading) {
    return <div className="text-gray-500 dark:text-gray-400">Loading...</div>;
  }
  if (!isOwner) {
    return (
      <div>
        {backLink}
        <p className="text-gray-500 dark:text-gray-400">
          Only the campaign owner can create shops.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {backLink}
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">New Shop</h1>
      <ShopForm
        initial={EMPTY_SHOP_FORM}
        submitting={create.isPending}
        submitLabel="Create shop"
        onSubmit={values => create.mutate(values)}
        onCancel={() => router.push(`/campaigns/${campaignId}/shops`)}
        onSuggestStock={suggestStock}
      />
    </div>
  );
}
