'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { usePrintTray } from '@/lib/print-tray-context';
import type {
  HydratePrintableCardsResponse,
  PrintableCard,
  PrintableCardGroup,
  PrintableCardType,
} from '@grimoire-os/shared';
import PrintMonsterCard from '@/components/PrintMonsterCard';
import PrintSpellCard from '@/components/PrintSpellCard';
import PrintItemCard from '@/components/PrintItemCard';
import PrintFeatureCard from '@/components/PrintFeatureCard';
import PrintTraitsCard from '@/components/PrintTraitsCard';

type PaperSize = 'letter' | 'a4';

const GROUP_LABELS: Record<PrintableCardType, string> = {
  monster: 'Monsters',
  spell: 'Spells',
  item: 'Items',
  race: 'Races',
  species: 'Species',
  background: 'Backgrounds',
  feature: 'Features',
};

/**
 * Route-scoped print stylesheet (VEG-268). Cards are a fixed 5" wide × 3"
 * tall footprint (a 3×5 index card), so 4-up means landscape: a 2×2 grid
 * needs 10.2×6.2" plus borders and fits both Letter (11×8.5") and A4
 * (11.69×8.27") in landscape, while portrait cannot fit two 5" columns.
 * Letter has only ~0.3" of horizontal slack at these margins — widening the
 * card, the 0.2" gap, or the 0.25" margin breaks the 2-column fit there
 * first. The @media block strips the app chrome — only the cards print.
 */
function printPageCss(paper: PaperSize): string {
  const size = paper === 'a4' ? 'A4' : 'letter';
  // The @page rule lives inside @media print (valid per CSS Paged Media).
  // With it at the top level, jsdom 28's getComputedStyle throws
  // ("Cannot destructure property 'value' of 'Specificity.max(...)'") while
  // applying the sheet — Testing Library role queries trigger that and the
  // whole spec fails. Inside a non-matching media block jsdom skips the rule
  // entirely; browsers honor it in either position.
  return `
@media print {
  @page { size: ${size} landscape; margin: 0.25in; }
  html, body { background: white !important; }
  /* body > header is the app nav only — each PrintCard has its own <header>. */
  body > header, [data-sonner-toaster] { display: none !important; }
  main { max-width: none !important; margin: 0 !important; padding: 0 !important; }
}
`;
}

/** Dispatch one hydrated card view-model to its card component. */
function CardForType({ card }: { card: PrintableCard }) {
  switch (card.type) {
    case 'monster':
      return <PrintMonsterCard card={card} />;
    case 'spell':
      return <PrintSpellCard card={card} />;
    case 'item':
      return <PrintItemCard card={card} />;
    case 'feature':
      return <PrintFeatureCard card={card} />;
    case 'race':
    case 'species':
    case 'background':
      return <PrintTraitsCard card={card} />;
    default: {
      // Exhaustiveness guard: a new PrintableCardType fails the `never`
      // assignment at compile time; at runtime a mis-typed payload logs
      // instead of silently dropping a card from the printed deck.
      const unhandled: never = card;
      console.error('No print card component for type:', unhandled);
      return null;
    }
  }
}

export default function SrdPrintPage() {
  const { grouped, count, hydrated } = usePrintTray();
  const [groups, setGroups] = useState<PrintableCardGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paper, setPaper] = useState<PaperSize>('letter');
  // Bumped by "Try again" to re-run the hydrate effect after a failure.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // Wait for the tray's localStorage hydration: until then an empty
    // selection means "don't know yet", not "nothing to print".
    if (!hydrated || grouped.length === 0) return;
    let cancelled = false;
    apiFetch<HydratePrintableCardsResponse>('/srd/cards', {
      method: 'POST',
      body: JSON.stringify({ selections: grouped }),
    })
      .then(response => {
        if (cancelled) return;
        if (response.groups.length === 0) {
          // A 200 with everything dropped is indistinguishable from stale
          // ids — log it so a backend regression here isn't silent.
          console.error('Print card hydrate returned no cards for selections:', grouped);
        }
        setGroups(response.groups);
        setError(null);
      })
      .catch(err => {
        if (cancelled) return;
        console.error('Failed to hydrate print cards:', err);
        const message = err instanceof Error ? err.message : 'Failed to load print cards';
        setError(message);
        toast.error(message);
      });
    return () => {
      cancelled = true;
    };
  }, [grouped, hydrated, attempt]);

  if (hydrated && count === 0) {
    return (
      <div className="text-center py-16">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Your print set is empty
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Add monsters, spells, items, or traits to the print set from any SRD page, then come back
          here to print them as index cards.
        </p>
        <Link
          href="/srd"
          className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          Browse the SRD
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
        <button
          type="button"
          onClick={() => {
            // Reset to the loading state, then re-arm the hydrate effect.
            setError(null);
            setGroups(null);
            setAttempt(a => a + 1);
          }}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!hydrated || !groups) {
    return <p className="text-center py-16 text-gray-600 dark:text-gray-400">Loading print set…</p>;
  }

  if (groups.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          The selected entries could not be loaded — they may have been removed or aren&apos;t
          available to your account. Clear the print set and pick them again.
        </p>
        <Link
          href="/srd"
          className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          Browse the SRD
        </Link>
      </div>
    );
  }

  // The batch endpoint silently drops unknown ids (see shared/printable.ts),
  // so reconcile what came back against the tray: a DM about to cut out cards
  // for a session must know when entries are missing before they print.
  const returnedCount = groups.reduce((n, group) => n + group.cards.length, 0);
  const missingCount = Math.max(0, count - returnedCount);

  const paperToggle = (label: string, value: PaperSize) => (
    <button
      type="button"
      aria-pressed={paper === value}
      onClick={() => setPaper(value)}
      className={`px-3 py-1.5 text-sm rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
        paper === value
          ? 'bg-indigo-600 text-white'
          : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div>
      <style data-testid="print-page-style">{printPageCss(paper)}</style>

      <div
        data-testid="print-controls"
        className="mb-6 flex flex-wrap items-end justify-between gap-4 print:hidden"
      >
        <div>
          <Link
            href="/srd"
            className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            ← Back to SRD
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mt-1">Print cards</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {returnedCount} card{returnedCount === 1 ? '' : 's'} · 4-up 3×5″ index cards, grouped by
            type. Cut along the dashed guides.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600 dark:text-gray-400 mr-1">Paper</span>
          {paperToggle('Letter', 'letter')}
          {paperToggle('A4', 'a4')}
          <button
            type="button"
            onClick={() => window.print()}
            className="ml-2 px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            Print
          </button>
        </div>
      </div>

      {missingCount > 0 && (
        <p
          data-testid="missing-cards-warning"
          className="mb-4 rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/40 px-4 py-2 text-sm text-amber-800 dark:text-amber-200 print:hidden"
        >
          {missingCount} of {count} selected card{count === 1 ? '' : 's'} could not be loaded — the
          entr{missingCount === 1 ? 'y' : 'ies'} may have been removed or{' '}
          {missingCount === 1 ? "isn't" : "aren't"} available to your account. Only the{' '}
          {returnedCount} card{returnedCount === 1 ? '' : 's'} below will print.
        </p>
      )}

      {groups.map((group, index) => (
        <section
          key={group.type}
          data-testid="print-group"
          data-card-type={group.type}
          className={index < groups.length - 1 ? 'break-after-page' : ''}
        >
          <h2 className="print:hidden text-lg font-semibold text-gray-900 dark:text-white mt-6 mb-3 first:mt-0">
            {GROUP_LABELS[group.type]}
          </h2>
          {/* 2×2-up grid: the gap is the cut gutter; each PrintCard brings its
              own dashed cut guide. The `contents` wrapper exists only to key
              the mapping — a card component may emit several physical cards
              (overflow continuation cards, VEG-275) and each must be its own
              grid item, not stack inside one cell. */}
          <div className="grid grid-cols-2 gap-[0.2in] justify-start">
            {group.cards.map(card => (
              <div key={`${card.type}:${card.id}`} className="contents">
                <CardForType card={card} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
