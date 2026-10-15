'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { apiQueryKey, useApiMutation, useApiQuery } from '@/lib/query';
import AdminSubnav from '@/components/AdminSubnav';
import LoadError from '@/components/LoadError';
import LoadingState from '@/components/LoadingState';
import { LOOT_CR_BUCKETS } from '@grimoire-os/shared';

// The global loot knobs as the loot engine sees them. Chances are fractions
// in [0, 1]. Mirrors backend LootGameRules (loot/loot.types.ts).
interface LootGameRules {
  trinketChance: number;
  magicItemChanceByCr: Record<string, number>;
  itemCountDie: string;
  coinageMultiplier: number;
}

const inputClass =
  'w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent';
const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1';
const helperClass = 'mt-1 text-xs text-gray-500 dark:text-gray-400';

// Chances are stored as fractions but edited as percentages. Round-trip both
// directions through fixed precision so float noise (0.1 * 100 → 10.0000001)
// never reaches an input or the API body.
const round = (n: number, places = 6) => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};
const toPct = (fraction: number) => round(fraction * 100);
const toFraction = (pct: number) => round(pct / 100);

// Mirrors the backend @IsDieSpec validator (and rollDie): count defaults to 1
// when omitted, count and sides must be at least 1.
function isValidDie(spec: string): boolean {
  const m = /^(\d*)d(\d+)$/i.exec(spec.trim());
  if (!m) return false;
  const count = m[1] === '' ? 1 : parseInt(m[1], 10);
  return count >= 1 && parseInt(m[2], 10) >= 1;
}

type MagicForm = Record<string, string>;

export default function AdminLootOddsPage() {
  const { isAdmin, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [savedAt, setSavedAt] = useState(0);

  // The redirect waits for session hydration, because the pre-hydration
  // `isAdmin: false` would bounce a real admin.
  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) router.replace('/');
  }, [authLoading, isAdmin, router]);

  const rules = useApiQuery<LootGameRules>('/admin/loot-odds', {
    enabled: !authLoading && isAdmin,
    errorToast: 'Failed to load loot odds',
  });

  const save = useApiMutation(
    (body: LootGameRules) =>
      apiFetch<LootGameRules>('/admin/loot-odds', { method: 'PATCH', body: JSON.stringify(body) }),
    {
      onSuccess: updated => {
        queryClient.setQueryData(apiQueryKey('/admin/loot-odds'), updated);
        setSavedAt(n => n + 1);
        toast.success('Loot odds saved');
      },
      onError: err => {
        toast.error(err instanceof Error ? err.message : 'Failed to save loot odds');
      },
    }
  );

  if (!isAdmin) return null;

  return (
    <div>
      <AdminSubnav />
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Loot Odds</h1>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
        Global defaults the loot engine uses when an NPC has no per-NPC override. Chances are
        entered as percentages.
      </p>

      {/* The failure view is only for rules that never loaded. A background
          refetch that fails keeps the form, and the error toast reports it. */}
      {rules.isError && rules.data === undefined && !rules.isFetching ? (
        <LoadError message="Failed to load loot odds." onRetry={() => rules.refetch()} />
      ) : rules.data == null ? (
        <LoadingState />
      ) : (
        // A save bumps the key, which remounts the form on the saved values. A
        // background refetch keeps the key, so it leaves typed values alone.
        <LootOddsForm
          key={savedAt}
          initial={rules.data}
          saving={save.isPending}
          onSubmit={body => save.mutate(body)}
        />
      )}
    </div>
  );
}

function LootOddsForm({
  initial,
  saving,
  onSubmit,
}: {
  initial: LootGameRules;
  saving: boolean;
  onSubmit: (body: LootGameRules) => void;
}) {
  const [trinketPct, setTrinketPct] = useState(String(toPct(initial.trinketChance)));
  const [magicPct, setMagicPct] = useState<MagicForm>(() =>
    Object.fromEntries(
      LOOT_CR_BUCKETS.map(cr => [cr, String(toPct(initial.magicItemChanceByCr[cr] ?? 0))])
    )
  );
  const [itemCountDie, setItemCountDie] = useState(initial.itemCountDie);
  const [coinageMultiplier, setCoinageMultiplier] = useState(String(initial.coinageMultiplier));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // All bounds are validated here in JS rather than via native min/max on the
    // inputs: native constraint validation blocks form submission with a terse
    // browser tooltip, whereas these toasts match the rest of the admin UI and
    // are testable. The numeric inputs deliberately omit min/max for this reason.
    const trinket = Number(trinketPct);
    if (trinketPct.trim() === '' || !Number.isFinite(trinket) || trinket < 0 || trinket > 100) {
      toast.error('Trinket chance must be between 0 and 100%');
      return;
    }

    const multiplier = Number(coinageMultiplier);
    if (
      coinageMultiplier.trim() === '' ||
      !Number.isFinite(multiplier) ||
      multiplier < 0 ||
      multiplier > 100
    ) {
      toast.error('Coinage multiplier must be between 0 and 100');
      return;
    }

    if (!isValidDie(itemCountDie)) {
      toast.error('Item count die must be a die spec like "1d3"');
      return;
    }

    const magicItemChanceByCr: Record<string, number> = {};
    for (const cr of LOOT_CR_BUCKETS) {
      const raw = magicPct[cr] ?? '';
      const pct = Number(raw);
      if (raw.trim() === '' || !Number.isFinite(pct) || pct < 0 || pct > 100) {
        toast.error(`Magic item chance for CR ${cr} must be between 0 and 100%`);
        return;
      }
      magicItemChanceByCr[cr] = toFraction(pct);
    }

    onSubmit({
      trinketChance: toFraction(trinket),
      magicItemChanceByCr,
      itemCountDie: itemCountDie.trim(),
      coinageMultiplier: round(multiplier),
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Loot odds"
      className="max-w-lg space-y-5 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5"
    >
      <div>
        <label htmlFor="trinket-chance" className={labelClass}>
          Trinket Chance (%)
        </label>
        <input
          id="trinket-chance"
          type="number"
          step={0.1}
          value={trinketPct}
          onChange={e => setTrinketPct(e.target.value)}
          className={inputClass}
        />
        <p className={helperClass}>Chance a generated NPC carries a trinket.</p>
      </div>

      <fieldset>
        <legend className={labelClass}>Magic Item Chance by CR (%)</legend>
        <div className="space-y-2">
          {LOOT_CR_BUCKETS.map(cr => {
            const id = `magic-chance-${cr}`;
            return (
              <div key={cr} className="flex items-center gap-3">
                <label
                  htmlFor={id}
                  className="w-16 text-sm text-gray-700 dark:text-gray-300 shrink-0"
                >
                  CR {cr}
                </label>
                <input
                  id={id}
                  type="number"
                  step={0.1}
                  value={magicPct[cr] ?? ''}
                  onChange={e => setMagicPct(prev => ({ ...prev, [cr]: e.target.value }))}
                  className={inputClass}
                />
              </div>
            );
          })}
        </div>
      </fieldset>

      <div>
        <label htmlFor="item-count-die" className={labelClass}>
          Item Count Die
        </label>
        <input
          id="item-count-die"
          type="text"
          value={itemCountDie}
          placeholder="e.g. 1d3"
          onChange={e => setItemCountDie(e.target.value)}
          className={inputClass}
        />
        <p className={helperClass}>How many item rolls per loot drop (e.g. 1d3).</p>
      </div>

      <div>
        <label htmlFor="coinage-multiplier" className={labelClass}>
          Coinage Multiplier
        </label>
        <input
          id="coinage-multiplier"
          type="number"
          step={0.1}
          value={coinageMultiplier}
          onChange={e => setCoinageMultiplier(e.target.value)}
          className={inputClass}
        />
        <p className={helperClass}>Scales all rolled coinage (1 = unchanged, max 100).</p>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
    </form>
  );
}
