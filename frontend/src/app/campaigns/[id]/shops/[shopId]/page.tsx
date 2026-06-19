'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { formatCoin } from '@grimoire-os/shared';
import { useApiQuery } from '@/lib/query';
import { useAuth } from '@/lib/auth-context';
import Badge from '@/components/Badge';
import { shopVisuals, stockLabel, isInStock } from '@/lib/shop-display';
import type { Campaign, Shop } from '@/lib/types';

export default function ShopDetailPage() {
  const { id: campaignId, shopId } = useParams<{ id: string; shopId: string }>();
  const { user } = useAuth();

  const campaignQuery = useApiQuery<Campaign>(`/campaigns/${campaignId}`, {
    errorToast: { message: 'Failed to load campaign', id: 'load-campaign' },
  });
  const isOwner = Boolean(campaignQuery.data && user && campaignQuery.data.ownerId === user.userId);

  const shopQuery = useApiQuery<Shop>(`/shops/${shopId}`, {
    errorToast: { message: 'Failed to load shop', id: 'load-shop' },
  });
  const shop = shopQuery.data ?? null;

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

  if (shopQuery.isLoading) {
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
  // A closed shop is hidden from players; only the owner can preview it. Wait for
  // ownership (a second query) to resolve before deciding, so the owner of a
  // closed shop doesn't transiently see "closed" — and a player never sees the
  // contents either way, since isOwner stays false until proven otherwise.
  if (!shop.isOpen && !isOwner) {
    if (campaignQuery.isLoading) {
      return <div className="text-gray-500 dark:text-gray-400">Loading...</div>;
    }
    return (
      <div>
        {backLink}
        <p className="text-gray-500 dark:text-gray-400">This shop is closed.</p>
      </div>
    );
  }

  const { icon, accent } = shopVisuals(shop);

  return (
    <div>
      {backLink}

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Immersive themed banner */}
        <div
          style={{
            backgroundColor: accent,
            backgroundImage: 'linear-gradient(135deg, rgba(255,255,255,0.18), rgba(0,0,0,0.15))',
          }}
          className="px-6 py-8 text-white"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-5xl mb-2" aria-hidden>
                {icon}
              </div>
              <h1 className="text-2xl font-bold tracking-wide">{shop.name}</h1>
              <p className="text-sm uppercase tracking-widest opacity-90 mt-1 capitalize">
                {shop.theme}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isOwner && !shop.isOpen && <Badge variant="neutral">Closed</Badge>}
              {isOwner && (
                <Link
                  href={`/campaigns/${campaignId}/shops/${shopId}/edit`}
                  className="px-3 py-1.5 text-sm bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
                >
                  Manage
                </Link>
              )}
            </div>
          </div>
        </div>

        <div className="p-6">
          {shop.description && (
            <p className="text-gray-600 dark:text-gray-400 italic mb-6">“{shop.description}”</p>
          )}

          {shop.items.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">This shop has nothing in stock.</p>
          ) : (
            <ul className="divide-y divide-gray-200 dark:divide-gray-700">
              {shop.items.map((item, i) => {
                const inStock = isInStock(item.stock);
                return (
                  <li
                    key={item.itemId ?? `${item.name}-${i}`}
                    className={`flex items-baseline justify-between gap-4 py-3 ${
                      inStock ? '' : 'opacity-50'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 dark:text-white">
                          {item.name}
                        </span>
                        {item.category && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 capitalize">
                            {item.category}
                          </span>
                        )}
                      </div>
                      {item.notes && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                          {item.notes}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono text-sm text-gray-900 dark:text-white">
                        {formatCoin(item.price)}
                      </div>
                      <div
                        className={`text-xs ${
                          inStock
                            ? 'text-gray-500 dark:text-gray-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {stockLabel(item.stock)}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
