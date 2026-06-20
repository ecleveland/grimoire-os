import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ShopStockEditor from '../ShopStockEditor';
import type { ShopLineItem } from '@/lib/types';

const mockApiFetch = vi.fn();
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const potion = { id: 'item-1', name: 'Potion of Healing', category: 'Potion', cost: '50 gp' };
const torch = { id: 'item-2', name: 'Torch', category: 'Adventuring Gear', cost: '1 cp' };
const varies = { id: 'item-3', name: 'Spellbook', category: 'Equipment', cost: 'Varies' };

function makeResponse(items: object[]) {
  return { data: items, total: items.length, page: 1, lastPage: 1 };
}

const zero = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };

function setup(value: ShopLineItem[] = []) {
  const onChange = vi.fn();
  render(<ShopStockEditor value={value} onChange={onChange} />);
  return { onChange };
}

// Stateful harness so an onChange actually updates the rendered value (needed
// for multi-edit flows like typing a custom name then a price).
function Harness({
  initial,
  onChange,
}: {
  initial: ShopLineItem[];
  onChange: (v: ShopLineItem[]) => void;
}) {
  const [val, setVal] = useState(initial);
  return (
    <ShopStockEditor
      value={val}
      onChange={v => {
        setVal(v);
        onChange(v);
      }}
    />
  );
}

function setupStateful(initial: ShopLineItem[] = []) {
  const onChange = vi.fn();
  render(<Harness initial={initial} onChange={onChange} />);
  return { onChange };
}

function lastChange(onChange: ReturnType<typeof vi.fn>) {
  return onChange.mock.calls[onChange.mock.calls.length - 1]?.[0];
}

beforeEach(() => {
  mockApiFetch.mockReset();
});

describe('ShopStockEditor', () => {
  it('shows an empty state and does not fetch while the search is empty', () => {
    setup();
    expect(screen.getByText(/no items yet/i)).toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('debounces the search into a single GET /srd/items request', async () => {
    mockApiFetch.mockResolvedValue(makeResponse([potion]));
    const user = userEvent.setup();
    setup();

    await user.type(screen.getByLabelText(/search items/i), 'pot');

    await waitFor(() => {
      const call = mockApiFetch.mock.calls.find(
        ([path]) => typeof path === 'string' && path.startsWith('/srd/items?')
      );
      expect(call).toBeDefined();
      expect(call![0]).toContain('q=pot');
    });
    expect(
      mockApiFetch.mock.calls.filter(
        ([path]) => typeof path === 'string' && path.startsWith('/srd/items?')
      )
    ).toHaveLength(1);
  });

  it('adds a catalog item with price defaulted from its cost and unlimited stock', async () => {
    mockApiFetch.mockResolvedValue(makeResponse([potion]));
    const user = userEvent.setup();
    const { onChange } = setup();

    await user.type(screen.getByLabelText(/search items/i), 'pot');
    await user.click(await screen.findByRole('button', { name: /add potion of healing/i }));

    expect(onChange).toHaveBeenCalledWith([
      {
        itemId: 'item-1',
        name: 'Potion of Healing',
        category: 'Potion',
        price: { ...zero, gp: 50 },
        stock: null,
      },
    ]);
  });

  it('defaults a non-fixed catalog cost (e.g. "Varies") to a free price', async () => {
    mockApiFetch.mockResolvedValue(makeResponse([varies]));
    const user = userEvent.setup();
    const { onChange } = setup();

    await user.type(screen.getByLabelText(/search items/i), 'spell');
    await user.click(await screen.findByRole('button', { name: /add spellbook/i }));

    expect(lastChange(onChange)[0].price).toEqual(zero);
  });

  it('hides catalog results already stocked (by itemId)', async () => {
    mockApiFetch.mockResolvedValue(makeResponse([potion, torch]));
    const user = userEvent.setup();
    setup([
      { itemId: 'item-1', name: 'Potion of Healing', price: { ...zero, gp: 50 }, stock: null },
    ]);

    await user.type(screen.getByLabelText(/search items/i), 'o');

    expect(await screen.findByRole('button', { name: /add torch/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add potion of healing/i })).toBeNull();
  });

  it('adds a custom (id-less) line the DM can name and price', async () => {
    const user = userEvent.setup();
    const { onChange } = setup();

    await user.click(screen.getByRole('button', { name: /add custom line/i }));

    expect(onChange).toHaveBeenCalledWith([
      { itemId: null, name: '', price: { ...zero }, stock: null },
    ]);
  });

  it('edits a custom line name', async () => {
    const { onChange } = setupStateful([
      { itemId: null, name: '', price: { ...zero }, stock: null },
    ]);
    fireEvent.change(screen.getByLabelText(/line 1 name/i), { target: { value: 'Mug of ale' } });
    expect(lastChange(onChange)[0].name).toBe('Mug of ale');
  });

  it('overrides a line price denomination', async () => {
    const { onChange } = setup([
      { itemId: 'item-1', name: 'Potion of Healing', price: { ...zero, gp: 50 }, stock: null },
    ]);
    fireEvent.change(screen.getByLabelText(/line 1 gp/i), { target: { value: '40' } });
    expect(lastChange(onChange)[0].price).toEqual({ ...zero, gp: 40 });
  });

  it('clamps a negative price to 0 and floors fractional input', () => {
    const { onChange } = setup([
      { itemId: 'item-1', name: 'Potion of Healing', price: { ...zero, gp: 50 }, stock: null },
    ]);
    fireEvent.change(screen.getByLabelText(/line 1 sp/i), { target: { value: '-3' } });
    expect(lastChange(onChange)[0].price.sp).toBe(0);
    fireEvent.change(screen.getByLabelText(/line 1 cp/i), { target: { value: '2.9' } });
    expect(lastChange(onChange)[0].price.cp).toBe(2);
  });

  it('sets a finite stock and clears it back to unlimited when blanked', () => {
    const { onChange } = setupStateful([
      { itemId: 'item-1', name: 'Potion of Healing', price: { ...zero, gp: 50 }, stock: null },
    ]);
    const stock = screen.getByLabelText(/line 1 stock/i);
    fireEvent.change(stock, { target: { value: '5' } });
    expect(lastChange(onChange)[0].stock).toBe(5);
    fireEvent.change(stock, { target: { value: '' } });
    expect(lastChange(onChange)[0].stock).toBeNull();
  });

  it('removes a line', async () => {
    const user = userEvent.setup();
    const { onChange } = setup([
      { itemId: 'item-1', name: 'Potion of Healing', price: { ...zero, gp: 50 }, stock: null },
      { itemId: 'item-2', name: 'Torch', price: { ...zero, cp: 1 }, stock: null },
    ]);

    await user.click(screen.getByRole('button', { name: /remove potion of healing/i }));

    expect(onChange).toHaveBeenCalledWith([
      { itemId: 'item-2', name: 'Torch', price: { ...zero, cp: 1 }, stock: null },
    ]);
  });

  it('keeps the surviving custom line’s input intact when an earlier custom line is removed', async () => {
    const user = userEvent.setup();
    setupStateful([
      { itemId: null, name: 'Mug of ale', price: { ...zero, cp: 4 }, stock: null },
      { itemId: null, name: 'Wheel of cheese', price: { ...zero, sp: 5 }, stock: null },
    ]);

    // Stable keys mean removing line 1 leaves line 2's editable name input
    // associated with its own value, not the removed row's.
    await user.click(screen.getByRole('button', { name: /remove mug of ale/i }));

    const remaining = screen.getByLabelText(/line 1 name/i);
    expect(remaining).toHaveValue('Wheel of cheese');
  });

  it('surfaces the server message and clears stale results when the search fails', async () => {
    const { toast } = await import('sonner');
    mockApiFetch
      .mockResolvedValueOnce(makeResponse([potion]))
      .mockRejectedValueOnce(new Error('boom'));
    const user = userEvent.setup();
    setup();

    await user.type(screen.getByLabelText(/search items/i), 'pot');
    await screen.findByRole('button', { name: /add potion of healing/i });

    await user.type(screen.getByLabelText(/search items/i), 'ion');
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('boom'));
    expect(screen.queryByRole('button', { name: /add potion of healing/i })).toBeNull();
  });
});
