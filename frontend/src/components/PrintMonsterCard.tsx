'use client';

import { useEffect, useRef, useState } from 'react';
import { PRINTABLE_MONSTER_ACTION_CAP, PRINTABLE_MONSTER_TRAIT_CAP } from '@grimoire-os/shared';
import type { PrintableMonsterCard as PrintableMonsterCardModel } from '@grimoire-os/shared';
import PrintCard from './PrintCard';
import { paginateSections } from '@/lib/print-card-pagination';
import type { CardPageLayout } from '@/lib/print-card-pagination';
import { abilityModifier, formatCr } from '@/lib/srd-format';

const ABILITY_LABELS = [
  { key: 'str', label: 'STR' },
  { key: 'dex', label: 'DEX' },
  { key: 'con', label: 'CON' },
  { key: 'int', label: 'INT' },
  { key: 'wis', label: 'WIS' },
  { key: 'cha', label: 'CHA' },
] as const;

// Pixel constants the pagination arithmetic needs that aren't measurable from
// the DOM in one query — each mirrors a Tailwind class on the markup below
// (or in PrintCard) and must move with it.
const SECTION_GAP_PX = 4; // body wrapper `gap-1`
const ENTRY_GAP_PX = 2; // entry list `space-y-0.5`
const BODY_TOP_PADDING_PX = 4; // PrintCard body `pt-1` (inside clientHeight)

interface EntrySection {
  title: string;
  entries: { name: string; description: string }[];
}

/**
 * Condensed 3×5" monster card (VEG-266) rendering the curated
 * PrintableMonsterCard view-model. The producer (batch hydrate endpoint)
 * already trims to the shared caps; the slices here are a defensive bound so
 * an uncapped payload still cannot overflow the card.
 *
 * Overflow pagination (VEG-275): a verbose monster's entries can exceed the
 * card body, and PrintCard clips invisibly — the Aboleth lost its 4th action
 * below the fold. The first (unpaginated) render doubles as the measuring
 * instrument: an effect reads the rendered entry heights, partitions them
 * with paginateSections, and re-renders as "Name (n of m)" cards — the
 * continuation cards holding the entries that didn't fit, adjacent in the
 * print grid. Where heights aren't measurable (jsdom), the single-card
 * render stands.
 */
export default function PrintMonsterCard({ card }: { card: PrintableMonsterCardModel }) {
  const tag = `CR ${formatCr(card.challengeRating)}${
    card.experiencePoints ? ` · ${card.experiencePoints} XP` : ''
  }`;
  const traits = (card.traits ?? []).slice(0, PRINTABLE_MONSTER_TRAIT_CAP);
  const actions = card.actions.slice(0, PRINTABLE_MONSTER_ACTION_CAP);
  const sections: EntrySection[] = [
    ...(traits.length > 0 ? [{ title: 'Traits', entries: traits }] : []),
    ...(actions.length > 0 ? [{ title: 'Actions', entries: actions }] : []),
  ];

  const measureRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<CardPageLayout | null>(null);

  // A different monster invalidates the measurements (no-op on mount: null → null).
  useEffect(() => setPages(null), [card]);

  // Measurement pass — runs against the unpaginated render (pages === null).
  useEffect(() => {
    if (pages !== null) return;
    const wrapper = measureRef.current;
    const body = wrapper?.parentElement; // PrintCard's data-print-card-body div
    if (!wrapper || !body) return;

    const measured = Array.from(
      wrapper.querySelectorAll<HTMLElement>('[data-measure="section"]')
    ).map(sectionEl => ({
      title: sectionEl.dataset.title ?? '',
      headingHeight:
        sectionEl.querySelector<HTMLElement>('[data-measure="heading"]')?.offsetHeight ?? 0,
      entryHeights: Array.from(
        sectionEl.querySelectorAll<HTMLElement>('[data-measure="entry"]')
      ).map(entry => entry.offsetHeight),
    }));

    const capacity = body.clientHeight - BODY_TOP_PADDING_PX;
    setPages(
      paginateSections({
        sections: measured,
        firstCapacity:
          capacity -
          (wrapper.querySelector<HTMLElement>('[data-measure="chrome"]')?.offsetHeight ?? 0),
        contCapacity: capacity,
        sectionGap: SECTION_GAP_PX,
        entryGap: ENTRY_GAP_PX,
      })
    );
  }, [pages]);

  // A webfont swap changes text metrics after first paint — re-measure once
  // fonts settle. (document.fonts is absent in jsdom.)
  useEffect(() => {
    let cancelled = false;
    document.fonts?.ready?.then(() => {
      if (!cancelled) setPages(null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Unmeasured: one card carrying every section, which is what gets measured.
  const layout: CardPageLayout = pages ?? [
    sections.map(s => ({ title: s.title, start: 0, end: s.entries.length, continued: false })),
  ];
  const entriesByTitle = new Map(sections.map(s => [s.title, s.entries]));

  return (
    <>
      {layout.map((slices, pageIndex) => (
        <PrintCard
          key={pageIndex}
          name={
            layout.length > 1 ? `${card.name} (${pageIndex + 1} of ${layout.length})` : card.name
          }
          tag={tag}
        >
          <div
            ref={pageIndex === 0 ? measureRef : undefined}
            className="flex flex-col gap-1 text-[9px] leading-snug"
          >
            {pageIndex === 0 && (
              <div data-measure="chrome" className="flex flex-col gap-1">
                <p className="italic text-gray-600">
                  {card.size} {card.creatureType} &middot; {card.alignment}
                </p>

                <div className="flex gap-3 text-[10px]">
                  <span>
                    <span className="font-semibold">AC</span> <span>{card.armorClass}</span>
                  </span>
                  <span>
                    <span className="font-semibold">HP</span> <span>{card.hitPoints}</span>
                  </span>
                  <span className="min-w-0">
                    <span className="font-semibold">Speed</span> <span>{card.speed}</span>
                  </span>
                </div>

                <div className="grid grid-cols-6 gap-1 text-center">
                  {ABILITY_LABELS.map(a => (
                    <div key={a.label} className="rounded border border-gray-300 py-0.5">
                      <div className="text-[7px] font-semibold uppercase text-gray-500">
                        {a.label}
                      </div>
                      <div className="font-mono text-[8px]">
                        {card.abilities[a.key]} ({abilityModifier(card.abilities[a.key])})
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {slices.map(slice => (
              <EntryList
                key={`${slice.title}-${slice.start}`}
                title={slice.continued ? `${slice.title} (cont.)` : slice.title}
                measureTitle={slice.title}
                entries={(entriesByTitle.get(slice.title) ?? []).slice(slice.start, slice.end)}
              />
            ))}
          </div>
        </PrintCard>
      ))}
    </>
  );
}

function EntryList({
  title,
  measureTitle,
  entries,
}: {
  title: string;
  /** The unlabelled section title pagination measures and slices by. */
  measureTitle: string;
  entries: { name: string; description: string }[];
}) {
  return (
    <div data-measure="section" data-title={measureTitle}>
      <h4
        data-measure="heading"
        className="text-[7px] font-semibold uppercase tracking-wide text-gray-500"
      >
        {title}
      </h4>
      <ul className="space-y-0.5">
        {entries.map((entry, i) => (
          <li key={`${entry.name}-${i}`} data-measure="entry">
            <span className="font-semibold italic">{entry.name}.</span> {entry.description}
          </li>
        ))}
      </ul>
    </div>
  );
}
