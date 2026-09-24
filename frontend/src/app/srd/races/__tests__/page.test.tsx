import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RaceListPage from '../page';
import { PrintTrayProvider, PRINT_TRAY_STORAGE_KEY } from '@/lib/print-tray-context';
import type { SrdRace } from '@/lib/types';

// ── Mocks ────────────────────────────────────────────────────────────────────

// The page is now a server component that fetches via the server-only helper;
// tests drive it by mocking that helper and rendering the resolved element tree.
const mockFetchSrdList = vi.fn();
vi.mock('@/lib/srd-server', () => ({
  fetchSrdList: (...args: unknown[]) => mockFetchSrdList(...args),
  SRD_REVALIDATE_SECONDS: 3600,
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeRace(over: Partial<SrdRace> = {}): SrdRace {
  return {
    id: 'race-1',
    name: 'Elf',
    speed: 30,
    size: 'Medium',
    // SRD 5.2.1 species grant no fixed ability bonuses; the seeded rows persist
    // this as a SQL NULL, so the page must tolerate a null/empty value.
    abilityBonuses: {},
    languages: ['Common', 'Elvish'],
    traits: [],
    source: 'SRD 5.2.1',
    ...over,
  };
}

async function renderPage() {
  return render(<PrintTrayProvider>{await RaceListPage()}</PrintTrayProvider>);
}

/** The persisted tray contents, for asserting tray state after a toggle. */
function storedTray(): unknown {
  return JSON.parse(localStorage.getItem(PRINT_TRAY_STORAGE_KEY) ?? '[]');
}

// An Elf whose Elven Lineage trait carries the reconstructed option table as GFM
// markdown (VEG-273) — the races page must render it as a real <table>.
const elfWithLineage = makeRace({
  traits: [
    {
      id: 'trait-lineage',
      name: 'Elven Lineage',
      description: [
        'Choose a lineage from the Elven Lineages table.',
        '',
        '**Elven Lineages**',
        '',
        '| Lineage | Level 1 | Level 3 |',
        '| --- | --- | --- |',
        '| Drow | Your Darkvision increases to 120 feet. | Faerie Fire |',
      ].join('\n'),
    },
    {
      id: 'trait-fey-ancestry',
      name: 'Fey Ancestry',
      description: 'You have Advantage on saving throws to avoid or end the Charmed condition.',
    },
  ],
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('RaceListPage', () => {
  beforeEach(() => {
    localStorage.clear();
    mockFetchSrdList.mockReset();
    mockFetchSrdList.mockResolvedValue([makeRace()]);
  });

  describe('rendering', () => {
    it('server-fetches /srd/races and renders the list', async () => {
      await renderPage();
      expect(screen.getByText('Elf')).toBeInTheDocument();
      expect(screen.getByText(/Speed: 30 ft/)).toBeInTheDocument();
      expect(mockFetchSrdList).toHaveBeenCalledWith('/srd/races');
    });

    it('renders an error state when the fetch rejects', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockFetchSrdList.mockRejectedValue(new Error('boom'));

      await renderPage();

      expect(screen.getByText(/Failed to load races/)).toBeInTheDocument();
      errorSpy.mockRestore();
    });

    it('links each card to its own race page', async () => {
      mockFetchSrdList.mockResolvedValue([makeRace(), makeRace({ id: 'race-2', name: 'Dwarf' })]);
      const user = userEvent.setup();
      await renderPage();

      // The card body is hidden while collapsed, so its link sits outside the
      // accessibility tree the role query walks.
      await user.click(screen.getByRole('button', { name: /^Elf/ }));
      await user.click(screen.getByRole('button', { name: /^Dwarf/ }));

      // Each link names its own race, so the pairing needs no render order.
      expect(screen.getByRole('link', { name: 'Open race page (Elf)' })).toHaveAttribute(
        'href',
        '/srd/races/race-1'
      );
      expect(screen.getByRole('link', { name: 'Open race page (Dwarf)' })).toHaveAttribute(
        'href',
        '/srd/races/race-2'
      );
    });
  });

  describe('print set selection', () => {
    it('toggles a race into the tray from its list card', async () => {
      const user = userEvent.setup();
      await renderPage();

      await user.click(screen.getByRole('button', { name: 'Add Elf to print set' }));

      expect(storedTray()).toEqual([{ type: 'race', id: 'race-1' }]);
      expect(screen.getByRole('button', { name: 'Remove Elf from print set' })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
    });

    it('toggling the race affordance does not expand the card', async () => {
      mockFetchSrdList.mockResolvedValue([elfWithLineage]);
      const user = userEvent.setup();
      await renderPage();

      await user.click(screen.getByRole('button', { name: 'Add Elf to print set' }));

      // The detail ships in the SSR HTML but stays hidden until the card is expanded.
      expect(screen.getByText('Elven Lineage.')).not.toBeVisible();
    });

    it('toggles an individual trait into the tray as a feature once expanded', async () => {
      mockFetchSrdList.mockResolvedValue([elfWithLineage]);
      const user = userEvent.setup();
      await renderPage();

      await user.click(screen.getByRole('button', { name: /^Elf/ }));
      await user.click(screen.getByRole('button', { name: 'Add Fey Ancestry to print set' }));

      expect(storedTray()).toEqual([{ type: 'feature', id: 'trait-fey-ancestry' }]);
      expect(
        screen.getByRole('button', { name: 'Remove Fey Ancestry from print set' })
      ).toHaveAttribute('aria-pressed', 'true');
    });

    it('renders no trait toggle when the trait has no id', async () => {
      // RaceDetail logs the broken contract; the card path is what's under test.
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockFetchSrdList.mockResolvedValue([
        makeRace({ traits: [{ name: 'Keen Senses', description: 'Proficiency in Perception.' }] }),
      ]);
      const user = userEvent.setup();
      await renderPage();

      await user.click(screen.getByRole('button', { name: /^Elf/ }));

      expect(screen.getByText('Keen Senses.')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Add Keen Senses to print set' })
      ).not.toBeInTheDocument();
      errorSpy.mockRestore();
    });
  });

  it('keeps trait descriptions hidden until the race is expanded', async () => {
    mockFetchSrdList.mockResolvedValue([elfWithLineage]);
    await renderPage();

    // Present in the SSR HTML (crawlable) but not visible while collapsed; the
    // table lives in the hidden subtree, so the accessibility-aware role query skips it.
    expect(screen.getByText('Elven Lineage.')).not.toBeVisible();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
