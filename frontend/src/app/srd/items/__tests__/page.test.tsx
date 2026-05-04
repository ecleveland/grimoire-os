import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
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

function makeResponse(items: SrdItem[]): PaginatedResponse<SrdItem> {
  return { data: items, total: items.length, page: 1, lastPage: 1 };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ItemListPage', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue(makeResponse([longsword]));
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
