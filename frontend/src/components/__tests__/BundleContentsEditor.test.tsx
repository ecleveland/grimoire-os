import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BundleContentsEditor from '../BundleContentsEditor';
import type { SrdItemBundleComponent } from '@/lib/types';

const mockApiFetch = vi.fn();
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));
vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}));

const candle = { id: 'item-1', name: 'Candle', category: 'Adventuring Gear', isMagic: false };
const rope = { id: 'item-2', name: 'Rope, Hempen', category: 'Adventuring Gear', isMagic: false };

function makeResponse(items: object[]) {
  return { data: items, total: items.length, page: 1, lastPage: 1 };
}

function setup(value: SrdItemBundleComponent[] = [], selfId?: string) {
  const onChange = vi.fn();
  render(<BundleContentsEditor value={value} onChange={onChange} selfId={selfId} />);
  return { onChange };
}

beforeEach(() => {
  mockApiFetch.mockReset();
});

describe('BundleContentsEditor', () => {
  it('shows an empty state and does not fetch while the search is empty', () => {
    setup();
    expect(screen.getByText(/no contents yet/i)).toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('debounces the search into a single GET /srd/items request', async () => {
    mockApiFetch.mockResolvedValue(makeResponse([candle]));
    const user = userEvent.setup();
    setup();

    await user.type(screen.getByLabelText(/search items/i), 'can');

    await waitFor(() => {
      const call = mockApiFetch.mock.calls.find(
        ([path]) => typeof path === 'string' && path.startsWith('/srd/items?')
      );
      expect(call).toBeDefined();
      expect(call![0]).toContain('q=can');
    });
    expect(
      mockApiFetch.mock.calls.filter(
        ([path]) => typeof path === 'string' && path.startsWith('/srd/items?')
      )
    ).toHaveLength(1);
  });

  it('picking a result adds an entry keyed by itemId with quantity 1', async () => {
    mockApiFetch.mockResolvedValue(makeResponse([candle]));
    const user = userEvent.setup();
    const { onChange } = setup();

    await user.type(screen.getByLabelText(/search items/i), 'can');
    await user.click(await screen.findByRole('button', { name: /add candle/i }));

    expect(onChange).toHaveBeenCalledWith([{ itemId: 'item-1', name: 'Candle', quantity: 1 }]);
  });

  it('hides results already in the list', async () => {
    mockApiFetch.mockResolvedValue(makeResponse([candle, rope]));
    const user = userEvent.setup();
    setup([{ itemId: 'item-1', name: 'Candle', quantity: 5 }]);

    await user.type(screen.getByLabelText(/search items/i), 'e');

    expect(await screen.findByRole('button', { name: /add rope, hempen/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add candle/i })).toBeNull();
  });

  it('excludes the pack itself from the pickable results (no self-containment)', async () => {
    mockApiFetch.mockResolvedValue(makeResponse([candle, rope]));
    const user = userEvent.setup();
    setup([], 'item-1'); // the pack being edited is Candle's id

    await user.type(screen.getByLabelText(/search items/i), 'e');

    expect(await screen.findByRole('button', { name: /add rope, hempen/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add candle/i })).toBeNull();
  });

  it('renders existing entries with their quantity', () => {
    setup([{ itemId: 'item-1', name: 'Candle', quantity: 10 }]);
    expect(screen.getByLabelText('Candle quantity')).toHaveValue(10);
  });

  it('editing a quantity emits the updated entry and clamps below 1 up to 1', () => {
    const { onChange } = setup([{ itemId: 'item-1', name: 'Candle', quantity: 10 }]);
    fireEvent.change(screen.getByLabelText('Candle quantity'), { target: { value: '0' } });
    expect(onChange).toHaveBeenCalledWith([{ itemId: 'item-1', name: 'Candle', quantity: 1 }]);
  });

  it('removes an entry', async () => {
    const user = userEvent.setup();
    const { onChange } = setup([
      { itemId: 'item-1', name: 'Candle', quantity: 10 },
      { itemId: 'item-2', name: 'Rope, Hempen', quantity: 1 },
    ]);

    await user.click(screen.getByRole('button', { name: /remove candle/i }));

    expect(onChange).toHaveBeenCalledWith([
      { itemId: 'item-2', name: 'Rope, Hempen', quantity: 1 },
    ]);
  });

  it('toasts the server message when the search fails', async () => {
    const { toast } = await import('sonner');
    mockApiFetch.mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    setup();

    await user.type(screen.getByLabelText(/search items/i), 'can');

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('boom'));
  });
});
