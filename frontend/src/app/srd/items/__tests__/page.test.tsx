import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ItemListPage from '../page';
import type { SrdItem, PaginatedResponse } from '@/lib/types';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockApiFetch = vi.fn();

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}));

vi.mock('@/components/Pagination', () => ({
  default: () => <div data-testid="pagination" />,
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

const longsword: SrdItem = {
  id: 'item-1',
  name: 'Longsword',
  category: 'Martial Melee',
  cost: '15 gp',
  weight: '3 lb.',
  damage: '1d8 slashing',
  properties: ['Versatile'],
  source: 'SRD 5.2.1',
};

const wandOfTricks: SrdItem = {
  id: 'item-2',
  name: 'Bag of Tricks',
  category: 'Wondrous Item',
  rarity: 'Uncommon',
  requiresAttunement: true,
  isMagic: true,
  description: [
    'This bag appears empty.',
    '',
    '**Gray Bag of Tricks**',
    '',
    '| 1d8 | Creature |',
    '| --- | --- |',
    '| 1 | Weasel |',
    '| 2 | Giant Rat |',
  ].join('\n'),
  properties: [],
  source: 'SRD 5.2.1',
};

function makeResponse(items: SrdItem[]): PaginatedResponse<SrdItem> {
  return { data: items, total: items.length, page: 1, lastPage: 1 };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ItemListPage', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue(makeResponse([longsword]));
  });

  describe('item detail (collapsible description)', () => {
    it('renders rarity and attunement badges for a magic item', async () => {
      mockApiFetch.mockResolvedValue(makeResponse([wandOfTricks]));
      render(<ItemListPage />);

      expect(await screen.findByText('Bag of Tricks')).toBeInTheDocument();
      expect(screen.getByText('Uncommon')).toBeInTheDocument();
      expect(screen.getByText('Requires Attunement')).toBeInTheDocument();
    });

    it('hides the description until Show details is clicked, then renders the reconstructed table', async () => {
      mockApiFetch.mockResolvedValue(makeResponse([wandOfTricks]));
      const user = userEvent.setup();
      render(<ItemListPage />);

      const toggle = await screen.findByRole('button', { name: 'Show details' });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByText('This bag appears empty.')).not.toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();

      await user.click(toggle);

      expect(screen.getByText('This bag appears empty.')).toBeInTheDocument();
      // The reconstructed GFM table renders as a real <table>, not literal pipes.
      const table = screen.getByRole('table');
      expect(table).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Creature' })).toBeInTheDocument();
      expect(screen.getByRole('cell', { name: 'Weasel' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Hide details' })).toHaveAttribute(
        'aria-expanded',
        'true'
      );
    });

    it('collapses the description when Hide details is clicked', async () => {
      mockApiFetch.mockResolvedValue(makeResponse([wandOfTricks]));
      const user = userEvent.setup();
      render(<ItemListPage />);

      await user.click(await screen.findByRole('button', { name: 'Show details' }));
      await user.click(screen.getByRole('button', { name: 'Hide details' }));

      await waitFor(() => expect(screen.queryByRole('table')).not.toBeInTheDocument());
      expect(screen.getByRole('button', { name: 'Show details' })).toBeInTheDocument();
    });

    it('shows no details toggle for an item without a description', async () => {
      mockApiFetch.mockResolvedValue(makeResponse([longsword]));
      render(<ItemListPage />);

      expect(await screen.findByText('Longsword')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /details/i })).not.toBeInTheDocument();
    });
  });

  describe('focus preservation across debounced refetch', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    async function setupWithPendingRefetch(initial: SrdItem[]) {
      mockApiFetch.mockResolvedValueOnce(makeResponse(initial));

      let resolveRefetch!: (v: PaginatedResponse<SrdItem>) => void;
      mockApiFetch.mockImplementationOnce(
        () =>
          new Promise<PaginatedResponse<SrdItem>>(resolve => {
            resolveRefetch = resolve;
          })
      );

      render(<ItemListPage />);
      const input = await screen.findByPlaceholderText('Search items...');

      vi.useFakeTimers();
      return { input, resolveRefetch: () => resolveRefetch(makeResponse([longsword])) };
    }

    it('keeps the search input mounted while a refetch is in flight', async () => {
      const { input, resolveRefetch } = await setupWithPendingRefetch([longsword]);

      input.focus();
      fireEvent.change(input, { target: { value: 'l' } });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(350);
      });

      expect(screen.getByPlaceholderText('Search items...')).toBe(input);
      expect(document.activeElement).toBe(input);

      await act(async () => {
        resolveRefetch();
        await vi.runAllTimersAsync();
      });
    });

    it('keeps the search input mounted when refetch is triggered with no current results', async () => {
      const { input, resolveRefetch } = await setupWithPendingRefetch([]);

      input.focus();
      fireEvent.change(input, { target: { value: 'x' } });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(350);
      });

      expect(screen.getByPlaceholderText('Search items...')).toBe(input);
      expect(document.activeElement).toBe(input);

      await act(async () => {
        resolveRefetch();
        await vi.runAllTimersAsync();
      });
    });
  });
});
