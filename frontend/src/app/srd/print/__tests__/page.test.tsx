import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import SrdPrintPage from '../page';
import { PrintTrayProvider, PRINT_TRAY_STORAGE_KEY } from '@/lib/print-tray-context';
import type { PrintTrayItem } from '@/lib/print-tray-context';
import type {
  HydratePrintableCardsResponse,
  PrintableBackgroundCard,
  PrintableFeatureCard,
  PrintableItemCard,
  PrintableMonsterCard,
  PrintableRaceCard,
  PrintableSpeciesCard,
  PrintableSpellCard,
} from '@grimoire-os/shared';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockApiFetch = vi.fn();

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}));

// Per-test override of the tray context, for pinning states the real provider
// races through (it hydrates from localStorage in a mount effect, so the
// pre-hydration window can't be held open from outside). Only read at render
// time — the factory itself never touches it.
let trayOverride: { hydrated?: boolean } | null = null;

vi.mock('@/lib/print-tray-context', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/print-tray-context')>();
  return {
    ...actual,
    usePrintTray: () => ({ ...actual.usePrintTray(), ...trayOverride }),
  };
});

// ── Fixtures ─────────────────────────────────────────────────────────────────

const goblinCard: PrintableMonsterCard = {
  type: 'monster',
  id: 'm1',
  name: 'Goblin',
  size: 'Small',
  creatureType: 'humanoid',
  alignment: 'Neutral Evil',
  challengeRating: 0.25,
  armorClass: 15,
  hitPoints: 7,
  speed: '30 ft.',
  abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
  actions: [{ name: 'Scimitar', description: 'Melee attack: +4 to hit, 5 (1d6+2) slashing.' }],
};

const fireballCard: PrintableSpellCard = {
  type: 'spell',
  id: 's1',
  name: 'Fireball',
  level: 3,
  school: 'Evocation',
  castingTime: '1 action',
  range: '150 feet',
  components: 'V, S, M',
  duration: 'Instantaneous',
  concentration: false,
  ritual: false,
  description: 'A bright streak flashes to a point you choose, then blossoms into flame.',
};

const bagCard: PrintableItemCard = {
  type: 'item',
  id: 'i1',
  name: 'Bag of Holding',
  category: 'Wondrous Item',
  rarity: 'Uncommon',
  properties: [],
  description: 'This bag has an interior space considerably larger than its outside dimensions.',
};

const dragonbornCard: PrintableRaceCard = {
  type: 'race',
  id: 'r1',
  name: 'Dragonborn',
  traits: [{ name: 'Breath Weapon', description: 'Exhale destructive energy.' }],
};

const elfCard: PrintableSpeciesCard = {
  type: 'species',
  id: 'sp1',
  name: 'Elf',
  traits: [{ name: 'Darkvision', description: 'See in dim light within 60 feet.' }],
};

const acolyteCard: PrintableBackgroundCard = {
  type: 'background',
  id: 'b1',
  name: 'Acolyte',
  traits: [{ name: 'Shelter of the Faithful', description: 'Receive aid at temples.' }],
};

const rageCard: PrintableFeatureCard = {
  type: 'feature',
  id: 'f1',
  name: 'Rage',
  parent: { kind: 'class', id: 'c1', name: 'Barbarian' },
  level: 1,
  description: 'Enter a battle fury granting damage bonuses and resistance.',
};

/** Tray selection matching the three fixture cards, in insertion order. */
const seededItems: PrintTrayItem[] = [
  { type: 'monster', id: 'm1' },
  { type: 'spell', id: 's1' },
  { type: 'item', id: 'i1' },
];

const hydrateResponse: HydratePrintableCardsResponse = {
  groups: [
    { type: 'monster', cards: [goblinCard] },
    { type: 'spell', cards: [fireballCard] },
    { type: 'item', cards: [bagCard] },
  ],
};

function seedTray(items: PrintTrayItem[]) {
  localStorage.setItem(PRINT_TRAY_STORAGE_KEY, JSON.stringify(items));
}

function renderPage() {
  return render(
    <PrintTrayProvider>
      <SrdPrintPage />
    </PrintTrayProvider>
  );
}

/** The route-scoped print stylesheet (page setup + chrome hiding). */
function printStyle(): string {
  return document.querySelector('[data-testid="print-page-style"]')?.textContent ?? '';
}

beforeEach(() => {
  localStorage.clear();
  mockApiFetch.mockReset();
  vi.mocked(toast.error).mockClear();
  trayOverride = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('SrdPrintPage', () => {
  describe('hydrate-and-render happy path', () => {
    it('hydrates the tray in one batch call and renders all cards', async () => {
      seedTray(seededItems);
      mockApiFetch.mockResolvedValue(hydrateResponse);

      renderPage();

      expect(await screen.findByText('Goblin')).toBeInTheDocument();
      expect(screen.getByText('Fireball')).toBeInTheDocument();
      expect(screen.getByText('Bag of Holding')).toBeInTheDocument();
      expect(screen.getAllByTestId('print-card')).toHaveLength(3);

      expect(mockApiFetch).toHaveBeenCalledTimes(1);
      expect(mockApiFetch).toHaveBeenCalledWith('/srd/cards', {
        method: 'POST',
        body: JSON.stringify({
          selections: [
            { type: 'monster', ids: ['m1'] },
            { type: 'spell', ids: ['s1'] },
            { type: 'item', ids: ['i1'] },
          ],
        }),
      });
    });

    it('shows a loading state until the batch call resolves', async () => {
      seedTray(seededItems);
      mockApiFetch.mockReturnValue(new Promise(() => {}));

      renderPage();

      expect(await screen.findByText(/loading print set/i)).toBeInTheDocument();
      expect(screen.queryAllByTestId('print-card')).toHaveLength(0);
    });

    it('dispatches every card type to a card component, with its group label', async () => {
      seedTray([
        ...seededItems,
        { type: 'race', id: 'r1' },
        { type: 'species', id: 'sp1' },
        { type: 'background', id: 'b1' },
        { type: 'feature', id: 'f1' },
      ]);
      mockApiFetch.mockResolvedValue({
        groups: [
          ...hydrateResponse.groups,
          { type: 'race', cards: [dragonbornCard] },
          { type: 'species', cards: [elfCard] },
          { type: 'background', cards: [acolyteCard] },
          { type: 'feature', cards: [rageCard] },
        ],
      } satisfies HydratePrintableCardsResponse);

      renderPage();

      // One rendered card per type — including the race/species/background
      // fall-through to the shared traits card and the feature card.
      expect(await screen.findByText('Dragonborn')).toBeInTheDocument();
      expect(screen.getByText('Elf')).toBeInTheDocument();
      expect(screen.getByText('Acolyte')).toBeInTheDocument();
      expect(screen.getByText('Rage')).toBeInTheDocument();
      expect(screen.getAllByTestId('print-card')).toHaveLength(7);

      for (const label of ['Races', 'Species', 'Backgrounds', 'Features']) {
        expect(screen.getByRole('heading', { name: label })).toBeInTheDocument();
      }
    });

    it('renders multiple cards in one group and sends all ids in one selection', async () => {
      const goblinBoss: PrintableMonsterCard = { ...goblinCard, id: 'm2', name: 'Goblin Boss' };
      seedTray([
        { type: 'monster', id: 'm1' },
        { type: 'monster', id: 'm2' },
      ]);
      mockApiFetch.mockResolvedValue({
        groups: [{ type: 'monster', cards: [goblinCard, goblinBoss] }],
      } satisfies HydratePrintableCardsResponse);

      renderPage();

      expect(await screen.findByText('Goblin')).toBeInTheDocument();
      expect(screen.getByText('Goblin Boss')).toBeInTheDocument();
      expect(screen.getAllByTestId('print-card')).toHaveLength(2);
      expect(mockApiFetch).toHaveBeenCalledWith('/srd/cards', {
        method: 'POST',
        body: JSON.stringify({ selections: [{ type: 'monster', ids: ['m1', 'm2'] }] }),
      });
    });
  });

  describe('tray hydration gate', () => {
    it('does not fetch before the tray has hydrated, even with a stored set', async () => {
      seedTray(seededItems);
      trayOverride = { hydrated: false };
      mockApiFetch.mockResolvedValue(hydrateResponse);

      renderPage();

      expect(await screen.findByText(/loading print set/i)).toBeInTheDocument();
      expect(mockApiFetch).not.toHaveBeenCalled();
    });

    it('shows loading, not the empty state, while an empty tray is still hydrating', async () => {
      trayOverride = { hydrated: false };

      renderPage();

      // An un-hydrated empty tray means "don't know yet" — flashing the empty
      // state here would mislead anyone whose set is still being read.
      expect(await screen.findByText(/loading print set/i)).toBeInTheDocument();
      expect(screen.queryByText(/print set is empty/i)).not.toBeInTheDocument();
      expect(mockApiFetch).not.toHaveBeenCalled();
    });
  });

  describe('grouping and page-break structure', () => {
    it('renders one section per type, in response order, with screen-only headings', async () => {
      seedTray(seededItems);
      mockApiFetch.mockResolvedValue(hydrateResponse);

      renderPage();
      await screen.findByText('Goblin');

      const groups = screen.getAllByTestId('print-group');
      expect(groups).toHaveLength(3);
      expect(groups.map(g => g.getAttribute('data-card-type'))).toEqual([
        'monster',
        'spell',
        'item',
      ]);

      // Each group has an on-screen heading that is excluded from print.
      const monsterHeading = within(groups[0]).getByRole('heading', { name: 'Monsters' });
      expect(monsterHeading.className).toContain('print:hidden');
      expect(within(groups[1]).getByRole('heading', { name: 'Spells' })).toBeInTheDocument();
      expect(within(groups[2]).getByRole('heading', { name: 'Items' })).toBeInTheDocument();

      // Cards land inside their own group.
      expect(within(groups[0]).getByText('Goblin')).toBeInTheDocument();
      expect(within(groups[1]).getByText('Fireball')).toBeInTheDocument();
      expect(within(groups[2]).getByText('Bag of Holding')).toBeInTheDocument();
    });

    it('puts a page break after every group except the last', async () => {
      seedTray(seededItems);
      mockApiFetch.mockResolvedValue(hydrateResponse);

      renderPage();
      await screen.findByText('Goblin');

      const groups = screen.getAllByTestId('print-group');
      expect(groups[0].className).toContain('break-after-page');
      expect(groups[1].className).toContain('break-after-page');
      expect(groups[2].className).not.toContain('break-after-page');
    });

    it('shows a notice when every selected id was dropped by the backend', async () => {
      seedTray(seededItems);
      mockApiFetch.mockResolvedValue({ groups: [] });

      renderPage();

      expect(await screen.findByText(/could not be loaded/i)).toBeInTheDocument();
      expect(screen.queryAllByTestId('print-card')).toHaveLength(0);
      // All-dropped is a distinct state from an empty tray — the user *did*
      // select cards; telling them the set is empty would gaslight them.
      expect(screen.queryByText(/print set is empty/i)).not.toBeInTheDocument();
    });

    it('warns when some ids were silently dropped and counts only returned cards', async () => {
      // The batch endpoint drops unknown ids without complaint (shared
      // contract) — the page must reconcile, or a DM prints an incomplete
      // deck and discovers it mid-session.
      seedTray(seededItems);
      mockApiFetch.mockResolvedValue({
        groups: [
          { type: 'monster', cards: [goblinCard] },
          { type: 'spell', cards: [fireballCard] },
          // The item was dropped.
        ],
      } satisfies HydratePrintableCardsResponse);

      renderPage();

      expect(await screen.findByText('Goblin')).toBeInTheDocument();
      const warning = screen.getByTestId('missing-cards-warning');
      expect(warning).toHaveTextContent('1 of 3 selected cards could not be loaded');
      // Hydration is identity-dependent (VEG-331): a drop can mean a removed
      // entry OR content this account can't access — the copy must not assert
      // "removed" as the only cause.
      expect(warning).toHaveTextContent(/removed or isn't available to your account/i);
      expect(warning).toHaveTextContent('Only the 2 cards below will print');
      // The warning is screen-only — print output stays cards-only.
      expect(warning.className).toContain('print:hidden');
      // The header count reflects what actually prints, not the tray.
      expect(screen.getByText(/2 cards · 4-up/)).toBeInTheDocument();
    });

    it('shows no missing-cards warning when everything hydrates', async () => {
      seedTray(seededItems);
      mockApiFetch.mockResolvedValue(hydrateResponse);

      renderPage();
      await screen.findByText('Goblin');

      expect(screen.queryByTestId('missing-cards-warning')).not.toBeInTheDocument();
      expect(screen.getByText(/3 cards · 4-up/)).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('shows the empty state without calling the API when the tray is empty', async () => {
      renderPage();

      expect(await screen.findByText(/print set is empty/i)).toBeInTheDocument();
      const back = screen.getByRole('link', { name: /browse the srd/i });
      expect(back).toHaveAttribute('href', '/srd');
      expect(mockApiFetch).not.toHaveBeenCalled();
    });
  });

  describe('batch-error state', () => {
    it('surfaces an Error rejection via toast and an inline retry', async () => {
      seedTray(seededItems);
      mockApiFetch.mockRejectedValueOnce(new Error('Hydrate failed'));

      renderPage();

      expect(await screen.findByText('Hydrate failed')).toBeInTheDocument();
      expect(toast.error).toHaveBeenCalledWith('Hydrate failed');
      expect(screen.queryAllByTestId('print-card')).toHaveLength(0);
    });

    it('falls back to a generic message on a non-Error rejection', async () => {
      seedTray(seededItems);
      mockApiFetch.mockRejectedValueOnce('nope');

      renderPage();

      expect(await screen.findByText('Failed to load print cards')).toBeInTheDocument();
      expect(toast.error).toHaveBeenCalledWith('Failed to load print cards');
    });

    it('retries the batch call from the error state', async () => {
      const user = userEvent.setup();
      seedTray(seededItems);
      mockApiFetch.mockRejectedValueOnce(new Error('Hydrate failed'));
      mockApiFetch.mockResolvedValueOnce(hydrateResponse);

      renderPage();
      await screen.findByText('Hydrate failed');

      await user.click(screen.getByRole('button', { name: /try again/i }));

      expect(await screen.findByText('Goblin')).toBeInTheDocument();
      expect(mockApiFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('paper size toggle', () => {
    it('defaults to Letter landscape and switches to A4 and back', async () => {
      const user = userEvent.setup();
      seedTray(seededItems);
      mockApiFetch.mockResolvedValue(hydrateResponse);

      renderPage();
      await screen.findByText('Goblin');

      const letter = screen.getByRole('button', { name: 'Letter' });
      const a4 = screen.getByRole('button', { name: 'A4' });
      expect(letter).toHaveAttribute('aria-pressed', 'true');
      expect(a4).toHaveAttribute('aria-pressed', 'false');
      expect(printStyle()).toContain('size: letter landscape');

      await user.click(a4);
      expect(a4).toHaveAttribute('aria-pressed', 'true');
      expect(letter).toHaveAttribute('aria-pressed', 'false');
      expect(printStyle()).toContain('size: A4 landscape');

      await user.click(letter);
      expect(printStyle()).toContain('size: letter landscape');
    });

    it('hides app chrome in the print stylesheet', async () => {
      seedTray(seededItems);
      mockApiFetch.mockResolvedValue(hydrateResponse);

      renderPage();
      await screen.findByText('Goblin');

      expect(printStyle()).toContain('@media print');
      // Must target the app nav only: every PrintCard has its own <header>,
      // so a bare `header` selector would blank each card's title band.
      expect(printStyle()).toContain('body > header');
      expect(printStyle()).not.toMatch(/[^>] header,/);
    });
  });

  describe('print action', () => {
    it('invokes window.print() from the Print button', async () => {
      const user = userEvent.setup();
      const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
      seedTray(seededItems);
      mockApiFetch.mockResolvedValue(hydrateResponse);

      renderPage();
      await screen.findByText('Goblin');

      await user.click(screen.getByRole('button', { name: 'Print' }));

      expect(printSpy).toHaveBeenCalledTimes(1);
    });

    it('keeps the on-screen controls out of the print output', async () => {
      seedTray(seededItems);
      mockApiFetch.mockResolvedValue(hydrateResponse);

      renderPage();
      await screen.findByText('Goblin');

      expect(screen.getByTestId('print-controls').className).toContain('print:hidden');
    });
  });
});
