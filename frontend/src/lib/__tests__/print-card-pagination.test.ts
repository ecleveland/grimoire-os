import { describe, it, expect } from 'vitest';
import { paginateSections } from '../print-card-pagination';
import type { MeasuredSection } from '../print-card-pagination';

const GAPS = { sectionGap: 4, entryGap: 2 };

function section(over: Partial<MeasuredSection> = {}): MeasuredSection {
  return { title: 'Actions', headingHeight: 10, entryHeights: [40, 40], ...over };
}

describe('paginateSections', () => {
  it('returns a single page when everything fits the first card', () => {
    const pages = paginateSections({
      sections: [section()],
      firstCapacity: 200,
      contCapacity: 250,
      ...GAPS,
    });

    expect(pages).toEqual([[{ title: 'Actions', start: 0, end: 2, continued: false }]]);
  });

  it('returns a single page for zero-height measurements (unmeasured environments)', () => {
    // jsdom reports 0 for every offsetHeight/clientHeight — pagination must
    // degrade to the pre-VEG-275 single-card render, never divide by zero or
    // emit empty pages.
    const pages = paginateSections({
      sections: [
        { title: 'Traits', headingHeight: 0, entryHeights: [0] },
        { title: 'Actions', headingHeight: 0, entryHeights: [0, 0, 0, 0] },
      ],
      firstCapacity: 0,
      contCapacity: 0,
      ...GAPS,
    });

    expect(pages).toEqual([
      [
        { title: 'Traits', start: 0, end: 1, continued: false },
        { title: 'Actions', start: 0, end: 4, continued: false },
      ],
    ]);
  });

  it('splits a section across pages when entries exceed the first capacity (the Aboleth case)', () => {
    // First card fits the heading (4 gap + 10) and two 40px entries
    // (40 + 2 + 40 = 82; 14 + 82 = 96 ≤ 100); the 3rd and 4th overflow.
    const pages = paginateSections({
      sections: [section({ entryHeights: [40, 40, 40, 40] })],
      firstCapacity: 100,
      contCapacity: 150,
      ...GAPS,
    });

    expect(pages).toEqual([
      [{ title: 'Actions', start: 0, end: 2, continued: false }],
      [{ title: 'Actions', start: 2, end: 4, continued: true }],
    ]);
  });

  it('keeps whole sections together when a later section does not fit', () => {
    const pages = paginateSections({
      sections: [
        { title: 'Traits', headingHeight: 10, entryHeights: [40] },
        { title: 'Actions', headingHeight: 10, entryHeights: [40, 40] },
      ],
      // Traits costs 4 + 10 + 40 = 54; Actions heading would fit but its
      // first entry would not — the whole Actions section moves on.
      firstCapacity: 80,
      contCapacity: 150,
      ...GAPS,
    });

    expect(pages).toEqual([
      [{ title: 'Traits', start: 0, end: 1, continued: false }],
      [{ title: 'Actions', start: 0, end: 2, continued: false }],
    ]);
  });

  it('never strands a section heading at the bottom of a page', () => {
    // Heading (4 + 10 = 14) fits in the 20px first-card remainder but no
    // entry does: the heading must not print without at least one entry under
    // it. The whole section moves to a continuation card; the first page
    // keeps only the chrome (stat block).
    const pages = paginateSections({
      sections: [section({ entryHeights: [40] })],
      firstCapacity: 20,
      contCapacity: 150,
      ...GAPS,
    });

    expect(pages).toEqual([[], [{ title: 'Actions', start: 0, end: 1, continued: false }]]);
  });

  it('places an entry taller than a whole continuation card rather than looping', () => {
    const pages = paginateSections({
      sections: [section({ entryHeights: [500] })],
      firstCapacity: 100,
      contCapacity: 150,
      ...GAPS,
    });

    expect(pages).toEqual([[], [{ title: 'Actions', start: 0, end: 1, continued: false }]]);
  });

  it('spreads three pages when two continuation cards are needed', () => {
    const pages = paginateSections({
      sections: [section({ entryHeights: [90, 90, 90] })],
      firstCapacity: 110,
      contCapacity: 100,
      ...GAPS,
    });

    expect(pages).toEqual([
      [{ title: 'Actions', start: 0, end: 1, continued: false }],
      [{ title: 'Actions', start: 1, end: 2, continued: true }],
      [{ title: 'Actions', start: 2, end: 3, continued: true }],
    ]);
  });

  it('returns one empty page for no sections', () => {
    const pages = paginateSections({
      sections: [],
      firstCapacity: 100,
      contCapacity: 150,
      ...GAPS,
    });

    expect(pages).toEqual([[]]);
  });
});
