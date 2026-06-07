import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RaceListPage from '../page';
import { PrintTrayProvider, PRINT_TRAY_STORAGE_KEY } from '@/lib/print-tray-context';
import type { SrdRace } from '@/lib/types';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockApiFetch = vi.fn();

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const mockToastError = vi.fn();
vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args) },
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

function renderPage() {
  return render(
    <PrintTrayProvider>
      <RaceListPage />
    </PrintTrayProvider>
  );
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
    mockApiFetch.mockReset();
    mockToastError.mockReset();
    mockApiFetch.mockResolvedValue([makeRace()]);
  });

  describe('print set selection', () => {
    it('toggles a race into the tray from its list card', async () => {
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole('button', { name: 'Add Elf to print set' }));

      expect(storedTray()).toEqual([{ type: 'race', id: 'race-1' }]);
      expect(screen.getByRole('button', { name: 'Remove Elf from print set' })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
    });

    it('toggling the race affordance does not expand the card', async () => {
      mockApiFetch.mockResolvedValue([elfWithLineage]);
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole('button', { name: 'Add Elf to print set' }));

      expect(screen.queryByText('Elven Lineage.')).not.toBeInTheDocument();
    });

    it('toggles an individual trait into the tray as a feature once expanded', async () => {
      mockApiFetch.mockResolvedValue([elfWithLineage]);
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole('button', { name: /^Elf/ }));
      await user.click(screen.getByRole('button', { name: 'Add Fey Ancestry to print set' }));

      expect(storedTray()).toEqual([{ type: 'feature', id: 'trait-fey-ancestry' }]);
      expect(
        screen.getByRole('button', { name: 'Remove Fey Ancestry from print set' })
      ).toHaveAttribute('aria-pressed', 'true');
    });

    it('renders no trait toggle when the trait has no id', async () => {
      mockApiFetch.mockResolvedValue([
        makeRace({ traits: [{ name: 'Keen Senses', description: 'Proficiency in Perception.' }] }),
      ]);
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole('button', { name: /^Elf/ }));

      expect(screen.getByText('Keen Senses.')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Add Keen Senses to print set' })
      ).not.toBeInTheDocument();
    });
  });

  // An id-less trait can't be a print toggle. On real API data this never
  // happens (the endpoint includes trait row ids), so its appearance signals
  // a broken backend contract that would otherwise silently drop print toggles.
  describe('inert-chip invariant logging (VEG-274)', () => {
    it('logs a contract-violation error when a trait is rendered without an id', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockApiFetch.mockResolvedValue([
        makeRace({
          traits: [
            { id: 'trait-fey-ancestry', name: 'Fey Ancestry', description: 'Advantage vs charm.' },
            { name: 'Keen Senses', description: 'Proficiency in Perception.' },
          ],
        }),
      ]);
      renderPage();

      await screen.findByText('Elf');
      await waitFor(() =>
        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining('race traits rendered without an id'),
          ['Keen Senses']
        )
      );
      errorSpy.mockRestore();
    });

    it('does not log the invariant when every trait carries an id', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockApiFetch.mockResolvedValue([elfWithLineage]);
      renderPage();

      await screen.findByText('Elf');
      expect(errorSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('without an id'),
        expect.anything()
      );
      errorSpy.mockRestore();
    });
  });

  it('shows a loading state before the fetch resolves', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText('Loading races...')).toBeInTheDocument();
  });

  it('renders races from the API once loaded', async () => {
    renderPage();
    expect(await screen.findByText('Elf')).toBeInTheDocument();
    expect(screen.getByText(/Speed: 30 ft/)).toBeInTheDocument();
    expect(mockApiFetch).toHaveBeenCalledWith('/srd/races');
  });

  it('keeps trait descriptions collapsed until the race is expanded', async () => {
    mockApiFetch.mockResolvedValue([elfWithLineage]);
    renderPage();

    await screen.findByText('Elf');
    expect(screen.queryByText('Elven Lineage.')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders trait descriptions and the reconstructed lineage table when expanded', async () => {
    mockApiFetch.mockResolvedValue([elfWithLineage]);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /^Elf/ }));

    // Trait name + prose render.
    expect(screen.getByText('Elven Lineage.')).toBeInTheDocument();
    expect(
      screen.getByText(
        /You have Advantage on saving throws to avoid or end the Charmed condition\./
      )
    ).toBeInTheDocument();

    // The GFM table renders as a real <table>, not literal pipes.
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Level 3' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Faerie Fire' })).toBeInTheDocument();
  });

  it('renders ability-bonus chips when the race grants them', async () => {
    mockApiFetch.mockResolvedValue([makeRace({ abilityBonuses: { DEX: 2, CON: 1 } })]);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /^Elf/ }));
    expect(screen.getByText('Ability Bonuses')).toBeInTheDocument();
    expect(screen.getByText('DEX +2')).toBeInTheDocument();
    expect(screen.getByText('CON +1')).toBeInTheDocument();
  });

  it('renders without crashing and omits the Ability Bonuses section when bonuses are null', async () => {
    // Real seeded SRD races have a SQL NULL abilityBonuses — the page must not throw
    // on Object.entries(null) (regression guard for the races page crash).
    mockApiFetch.mockResolvedValue([
      makeRace({ abilityBonuses: null as unknown as SrdRace['abilityBonuses'] }),
    ]);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /^Elf/ }));
    expect(screen.queryByText('Ability Bonuses')).not.toBeInTheDocument();
  });

  it('shows an error toast when the fetch rejects', async () => {
    mockApiFetch.mockRejectedValue(new Error('boom'));
    renderPage();

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith('Failed to load races', { id: 'load-races' })
    );
  });
});
