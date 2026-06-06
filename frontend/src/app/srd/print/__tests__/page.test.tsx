import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import SrdPrintPage from '../page';
import { PrintTrayProvider, PRINT_TRAY_STORAGE_KEY } from '@/lib/print-tray-context';
import type { PrintTrayItem } from '@/lib/print-tray-context';
import type {
  HydratePrintableCardsResponse,
  PrintableItemCard,
  PrintableMonsterCard,
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
