'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { formatCoin, type Currency } from '@grimoire-os/shared';
import { apiFetch, ApiError } from '@/lib/api';
import { useApiMutation, useApiQuery, apiQueryKey } from '@/lib/query';
import { isInStock } from '@/lib/shop-display';
import FormField from '@/components/FormField';
import { canAffordLine, lineTotal } from './purchase-math';
import type { Character, PartyCharacter, Shop } from '@/lib/types';

/** Local shape of the backend PurchaseReceiptDto (not re-exported from shared). */
interface PurchaseReceipt {
  item: { name: string; itemId: string | null; quantity: number };
  totalPaid: Currency;
  newBalance: Currency;
  remainingStock: number | null;
  shopVersion: number;
  characterVersion: number;
}

interface ShopPurchasePanelProps {
  shop: Shop;
  campaignId: string;
  userId?: string;
}

/**
 * Purchase controls for the player storefront (VEG-445). Lets a member pick one
 * of their own characters in this campaign and buy in-stock line items; coin,
 * inventory, and stock move atomically server-side (VEG-357). Echoes the shop
 * and character versions so a concurrent edit is detected (409 → reload + retry).
 */
export default function ShopPurchasePanel({ shop, campaignId, userId }: ShopPurchasePanelProps) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<number, number>>({});

  // The roster carries no currency/version, so it only drives the picker; the
  // full character (with the purse + version) is fetched once one is selected.
  const partyQuery = useApiQuery<PartyCharacter[]>(`/campaigns/${campaignId}/characters`, {
    enabled: Boolean(userId),
    errorToast: { message: 'Failed to load your characters', id: 'load-party' },
  });
  const myChars = (partyQuery.data ?? []).filter(c => c.userId === userId);
  const effectiveId = selectedId ?? (myChars.length === 1 ? myChars[0].id : null);

  const charQuery = useApiQuery<Character>(`/characters/${effectiveId}`, {
    enabled: Boolean(effectiveId),
    errorToast: { message: 'Failed to load character', id: 'load-buyer' },
  });
  const buyer = charQuery.data ?? null;

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: apiQueryKey(`/shops/${shop.id}`) });
    if (effectiveId) {
      queryClient.invalidateQueries({ queryKey: apiQueryKey(`/characters/${effectiveId}`) });
    }
  };

  const purchase = useApiMutation<PurchaseReceipt, { itemIndex: number; quantity: number }>(
    ({ itemIndex, quantity }) =>
      apiFetch<PurchaseReceipt>(`/shops/${shop.id}/purchase`, {
        method: 'POST',
        body: JSON.stringify({
          characterId: effectiveId,
          itemIndex,
          quantity,
          expectedShopVersion: shop.version,
          expectedCharacterVersion: buyer?.version,
        }),
      }),
    {
      onSuccess: (receipt, { itemIndex }) => {
        toast.success(
          `Bought ${receipt.item.quantity}× ${receipt.item.name} for ${formatCoin(receipt.totalPaid)}`
        );
        setQuantities(prev => ({ ...prev, [itemIndex]: 1 }));
        refetch();
      },
      onError: err => {
        console.error('Purchase failed:', err);
        if (err instanceof ApiError && err.status === 409) {
          toast.error('The shop changed since you opened it — refreshed, please try again.');
          refetch();
          return;
        }
        toast.error(err instanceof Error ? err.message : 'Purchase failed');
      },
    }
  );

  if (!userId) return null;

  const inStock = shop.items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => isInStock(item.stock));

  return (
    <section className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Buy</h2>

      {myChars.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Add one of your characters to this campaign to buy from this shop.
        </p>
      ) : (
        <>
          {myChars.length === 1 ? (
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">
              Buying as {myChars[0].name}
            </p>
          ) : (
            <FormField
              as="select"
              label="Buying as"
              value={effectiveId ?? ''}
              onChange={e => setSelectedId(e.target.value || null)}
            >
              <option value="">Select a character…</option>
              {myChars.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </FormField>
          )}

          {buyer && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
              Balance: {formatCoin(buyer.currency)}
            </p>
          )}

          {inStock.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Nothing in stock to buy.</p>
          ) : (
            <ul className="space-y-3">
              {inStock.map(({ item, index }) => {
                const qty = quantities[index] ?? 1;
                const affordable = buyer ? canAffordLine(buyer.currency, item.price, qty) : false;
                const overStock = item.stock !== null && qty > item.stock;
                const disabled =
                  !effectiveId ||
                  !buyer ||
                  purchase.isPending ||
                  !affordable ||
                  qty < 1 ||
                  overStock;
                const pending = purchase.isPending && purchase.variables?.itemIndex === index;
                return (
                  <li key={item.itemId ?? `${item.name}-${index}`} className="flex items-end gap-3">
                    <div className="w-24">
                      <FormField
                        type="number"
                        label={`Quantity of ${item.name}`}
                        min={1}
                        max={item.stock ?? undefined}
                        value={qty}
                        onChange={e => {
                          const n = Number.parseInt(e.target.value, 10);
                          const clamped = Number.isFinite(n)
                            ? Math.max(1, Math.min(item.stock ?? n, n))
                            : 1;
                          setQuantities(prev => ({ ...prev, [index]: clamped }));
                        }}
                      />
                    </div>
                    <span className="text-sm font-mono text-gray-700 dark:text-gray-300 pb-2">
                      {formatCoin(lineTotal(item.price, qty))}
                    </span>
                    <button
                      type="button"
                      aria-label={`Buy ${item.name}`}
                      disabled={disabled}
                      onClick={() => purchase.mutate({ itemIndex: index, quantity: qty })}
                      className="ml-auto px-3 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                    >
                      {pending ? 'Buying…' : 'Buy'}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
