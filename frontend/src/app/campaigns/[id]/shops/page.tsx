'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useApiQuery } from '@/lib/query';
import { useAuth } from '@/lib/auth-context';
import Badge from '@/components/Badge';
import { shopVisuals, visibleShops } from '@/lib/shop-display';
import type { Campaign, ShopListItem, PaginatedResponse } from '@/lib/types';

// Shops per campaign are few, so the storefront fetches them all and filters
// client-side rather than paginating (closed shops are hidden from players).
const LIMIT = 100;

export default function ShopsListPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const campaignQuery = useApiQuery<Campaign>(`/campaigns/${id}`, {
    errorToast: { message: 'Failed to load campaign', id: 'load-campaign' },
  });
  const isOwner = Boolean(campaignQuery.data && user && campaignQuery.data.ownerId === user.userId);

  const shopsQuery = useApiQuery<PaginatedResponse<ShopListItem>>(
    `/shops?campaignId=${id}&page=1&limit=${LIMIT}`,
    { errorToast: { message: 'Failed to load shops', id: 'load-shops' } }
  );
  const shops = visibleShops(shopsQuery.data?.data ?? [], isOwner);

  return (
    <div>
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Shops</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            <Link href={`/campaigns/${id}`} className="text-indigo-600 hover:text-indigo-700">
              ← Back to campaign
            </Link>
          </p>
        </div>
        {isOwner && (
          <Link
            href={`/campaigns/${id}/shops/new`}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            New Shop
          </Link>
        )}
      </div>

      {shopsQuery.isLoading ? (
        <p className="text-gray-500 dark:text-gray-400">Loading shops…</p>
      ) : shops.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">No shops yet.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shops.map(shop => {
            const { icon, accent } = shopVisuals(shop);
            return (
              <Link
                key={shop.id}
                href={`/campaigns/${id}/shops/${shop.id}`}
                style={{ borderLeftColor: accent }}
                className="block p-5 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 border-l-4 hover:border-indigo-500 transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span aria-hidden className="text-2xl">
                      {icon}
                    </span>
                    <h3 className="font-medium text-gray-900 dark:text-white truncate">
                      {shop.name}
                    </h3>
                  </div>
                  {isOwner && !shop.isOpen && <Badge variant="neutral">Closed</Badge>}
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 capitalize">
                  {shop.theme}
                </p>
                {shop.description && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                    {shop.description}
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
