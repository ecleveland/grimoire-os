// ── Print card overflow pagination (VEG-275) ────────────────────────────────
//
// A printable card is a fixed 3×5″ footprint that clips overflow invisibly —
// a verbose monster (the Aboleth) lost its 4th action below the fold with no
// hint anything was missing. Rather than trimming harder, overflowing entries
// flow onto continuation cards rendered adjacent in the print grid and
// labelled "(n of m)".
//
// This module is the pure partitioning half: given measured pixel heights it
// packs section entries onto pages greedily. The DOM-measurement half lives
// with the card component; keeping the arithmetic pure makes it testable in
// jsdom, which has no layout.

/** One measured card section: its heading plus the rendered height of each entry. */
export interface MeasuredSection {
  title: string;
  headingHeight: number;
  entryHeights: number[];
}

/**
 * One section's slice of a page: entries [start, end) of the section with
 * `title`. `continued` marks a slice that resumes a section split by a page
 * break, so the card can label the repeated heading "(cont.)".
 */
export interface SectionSlice {
  title: string;
  start: number;
  end: number;
  continued: boolean;
}

/** Pages of section slices. Index 0 is the main card (it also carries the chrome). */
export type CardPageLayout = SectionSlice[][];

export interface PaginateSectionsInput {
  sections: MeasuredSection[];
  /** Vertical px available for sections on the first card (body minus chrome). */
  firstCapacity: number;
  /** Vertical px available on a continuation card (full body). */
  contCapacity: number;
  /** Gap between sibling blocks (chrome/sections) — the wrapper's flex gap. */
  sectionGap: number;
  /** Gap between entries within a section's list. */
  entryGap: number;
}

/**
 * Greedily pack section entries onto card pages. Guarantees:
 * - every entry lands on exactly one page, in order;
 * - a heading never prints without at least one entry under it;
 * - an entry taller than a fresh continuation card is placed anyway (it will
 *   clip, but stalling or dropping it would be worse);
 * - zero-height measurements (jsdom, unmeasured first paint) degrade to a
 *   single page — the pre-pagination render.
 */
export function paginateSections({
  sections,
  firstCapacity,
  contCapacity,
  sectionGap,
  entryGap,
}: PaginateSectionsInput): CardPageLayout {
  // A non-positive continuation capacity means the environment never measured
  // (jsdom, first paint) — breaking pages can't help, so degrade to the
  // single-card render rather than paginating on gap costs alone.
  if (contCapacity <= 0) {
    return [
      sections.map(s => ({
        title: s.title,
        start: 0,
        end: s.entryHeights.length,
        continued: false,
      })),
    ];
  }

  const pages: CardPageLayout = [[]];
  let remaining = firstCapacity;
  // The first card's chrome (stat block) precedes any section, so its first
  // section pays the sibling gap; a fresh continuation card's doesn't.
  let pageOccupied = true;

  const breakPage = () => {
    pages.push([]);
    remaining = contCapacity;
    pageOccupied = false;
  };

  for (const section of sections) {
    let slice: SectionSlice | null = null;

    for (let i = 0; i < section.entryHeights.length; i++) {
      // Opening (or re-opening) the section on this page costs its heading;
      // subsequent entries only the entry gap.
      const openingCost = (pageOccupied ? sectionGap : 0) + section.headingHeight;
      const cost = (slice ? entryGap : openingCost) + section.entryHeights[i];

      if (cost > remaining && pageOccupied) {
        // No room — close the current slice and resume on a fresh card. An
        // oversized entry on an already-empty page falls through and is
        // placed regardless (pageOccupied is false there), so this never
        // loops without progress.
        breakPage();
        slice = null;
        i--;
        continue;
      }

      if (!slice) {
        slice = { title: section.title, start: i, end: i, continued: i > 0 };
        pages[pages.length - 1].push(slice);
        pageOccupied = true;
      }
      slice.end = i + 1;
      remaining -= cost;
    }
  }

  return pages;
}
