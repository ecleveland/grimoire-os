import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import ShopPurchasePanel from '../ShopPurchasePanel';
import type { Character, PartyCharacter, Shop, ShopLineItem } from '@/lib/types';

const mockApiFetch = vi.fn();

// Provide the real-shaped ApiError so the panel's `err instanceof ApiError`
// status branching (409) works against the same class it imports. Defined via
// vi.hoisted so the (hoisted) mock factory can reference it eagerly.
const { ApiError } = vi.hoisted(() => {
  class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(status: number, message: string, body?: unknown) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.body = body;
    }
  }
  return { ApiError };
});

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  ApiError,
}));
const mockToast = { success: vi.fn(), error: vi.fn() };
vi.mock('sonner', () => ({
  toast: {
    success: (...a: unknown[]) => mockToast.success(...a),
    error: (...a: unknown[]) => mockToast.error(...a),
  },
}));

const zero = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
const gp = (n: number) => ({ ...zero, gp: n });

const line = (over: Partial<ShopLineItem> = {}): ShopLineItem => ({
  itemId: null,
  name: 'Potion of Healing',
  category: 'Potion',
  price: gp(50),
  stock: 5,
  ...over,
});

const makeShop = (over: Partial<Shop> = {}): Shop =>
  ({
    id: 'shop-1',
    campaignId: 'camp-1',
    createdById: 'dm-1',
    name: "Maelin's Apothecary",
    theme: 'alchemist',
    description: null,
    icon: null,
    accent: null,
    items: [line()],
    isOpen: true,
    version: 0,
    createdAt: '',
    updatedAt: '',
    ...over,
  }) as Shop;

const makeParty = (over: Partial<PartyCharacter> = {}): PartyCharacter =>
  ({
    id: 'char-1',
    userId: 'user-1',
    name: 'Mialee',
    race: 'Elf',
    class: 'Wizard',
    level: 3,
    armorClass: 12,
    initiative: 2,
    hitPoints: null,
    ...over,
  }) as PartyCharacter;

const makeCharacter = (over: Partial<Character> = {}): Character =>
  ({
    id: 'char-1',
    userId: 'user-1',
    campaignId: 'camp-1',
    name: 'Mialee',
    currency: gp(100),
    inventory: [],
    version: 4,
    ...over,
  }) as unknown as Character;

/** Route apiFetch by path + method; tests override individual responses. */
function routeApi(opts: {
  party?: PartyCharacter[];
  character?: Character;
  purchase?: () => Promise<unknown>;
}) {
  mockApiFetch.mockImplementation((path: string, init?: { method?: string }) => {
    if (path === '/shops/shop-1/purchase' && init?.method === 'POST') {
      return (opts.purchase ?? (() => Promise.resolve({})))();
    }
    if (path === '/campaigns/camp-1/characters') return Promise.resolve(opts.party ?? []);
    if (path.startsWith('/characters/')) return Promise.resolve(opts.character ?? makeCharacter());
    return Promise.resolve(null);
  });
}

function renderPanel(props: { shop?: Shop; userId?: string } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  render(
    <ShopPurchasePanel
      shop={props.shop ?? makeShop()}
      campaignId="camp-1"
      userId={props.userId ?? 'user-1'}
    />,
    { wrapper }
  );
  return { invalidateSpy };
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockToast.success.mockReset();
  mockToast.error.mockReset();
});

describe('ShopPurchasePanel', () => {
  it('shows a hint and no Buy controls when the user has no character in the campaign', async () => {
    routeApi({ party: [makeParty({ id: 'other', userId: 'user-2' })] });
    renderPanel();

    expect(await screen.findByText(/add one of your characters/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /buy/i })).not.toBeInTheDocument();
  });

  it('auto-selects a single character, shows the balance, and enables an affordable Buy', async () => {
    routeApi({ party: [makeParty()], character: makeCharacter({ currency: gp(100) }) });
    renderPanel();

    expect(await screen.findByText(/buying as/i)).toHaveTextContent(/mialee/i);
    await screen.findByText(/100 gp/i); // balance
    const buy = await screen.findByRole('button', { name: /buy potion of healing/i });
    await waitFor(() => expect(buy).toBeEnabled());
  });

  it('renders a zero balance and cannot afford anything with a null purse (legacy data)', async () => {
    // Regression (VEG-425): currency is `Json?` in the DB, so a legacy/minimal
    // character deserializes it as null; formatCoin(null)/canAffordLine(null,…)
    // threw. It should read as an empty purse — 0 gp, affords nothing.
    routeApi({ party: [makeParty()], character: makeCharacter({ currency: null }) });
    renderPanel();

    expect(await screen.findByText(/buying as/i)).toHaveTextContent(/mialee/i);
    await screen.findByText(/\b0 gp\b/i); // balance renders as an empty purse
    const buy = await screen.findByRole('button', { name: /buy potion of healing/i });
    await waitFor(() => expect(buy).toBeDisabled());
  });

  it('posts the purchase with version echoes, toasts success, and refetches', async () => {
    const receipt = {
      characterId: 'char-1',
      item: { name: 'Potion of Healing', itemId: null, quantity: 1 },
      totalPaid: gp(50),
      newBalance: gp(50),
      remainingStock: 4,
      shopVersion: 1,
      characterVersion: 5,
    };
    routeApi({
      party: [makeParty()],
      character: makeCharacter({ currency: gp(100), version: 4 }),
      purchase: () => Promise.resolve(receipt),
    });
    const { invalidateSpy } = renderPanel();

    const buy = await screen.findByRole('button', { name: /buy potion of healing/i });
    await waitFor(() => expect(buy).toBeEnabled());
    await userEvent.click(buy);

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/shops/shop-1/purchase', {
        method: 'POST',
        body: JSON.stringify({
          characterId: 'char-1',
          itemIndex: 0,
          quantity: 1,
          expectedShopVersion: 0,
          expectedCharacterVersion: 4,
        }),
      })
    );
    await waitFor(() =>
      expect(mockToast.success).toHaveBeenCalledWith(expect.stringMatching(/potion of healing/i))
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['api', '/shops/shop-1'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['api', '/characters/char-1'] });
  });

  it('sends the chosen quantity in the request body', async () => {
    routeApi({
      party: [makeParty()],
      character: makeCharacter({ currency: gp(500) }),
      purchase: () =>
        Promise.resolve({ item: { name: 'Potion of Healing', quantity: 3 }, totalPaid: gp(150) }),
    });
    renderPanel();

    const qty = await screen.findByLabelText(/quantity of potion of healing/i);
    fireEvent.change(qty, { target: { value: '3' } });
    await userEvent.click(await screen.findByRole('button', { name: /buy potion of healing/i }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/shops/shop-1/purchase',
        expect.objectContaining({ body: expect.stringContaining('"quantity":3') })
      )
    );
  });

  it('disables Buy when the character cannot afford the line', async () => {
    routeApi({ party: [makeParty()], character: makeCharacter({ currency: gp(10) }) });
    renderPanel();

    const buy = await screen.findByRole('button', { name: /buy potion of healing/i });
    await waitFor(() => expect(buy).toBeDisabled());
  });

  it('renders no Buy control for an out-of-stock line', async () => {
    routeApi({ party: [makeParty()], character: makeCharacter() });
    renderPanel({ shop: makeShop({ items: [line({ name: 'Rare Tonic', stock: 0 })] }) });

    await screen.findByText(/buying as/i);
    expect(screen.queryByRole('button', { name: /buy rare tonic/i })).not.toBeInTheDocument();
    expect(screen.getByText(/nothing in stock to buy/i)).toBeInTheDocument();
  });

  it('shows a "shop changed" message and refetches on a 409 conflict', async () => {
    routeApi({
      party: [makeParty()],
      character: makeCharacter({ currency: gp(100) }),
      purchase: () => Promise.reject(new ApiError(409, 'Shop stock changed during purchase')),
    });
    const { invalidateSpy } = renderPanel();

    const buy = await screen.findByRole('button', { name: /buy potion of healing/i });
    await waitFor(() => expect(buy).toBeEnabled());
    await userEvent.click(buy);

    await waitFor(() =>
      expect(mockToast.error).toHaveBeenCalledWith(expect.stringMatching(/shop changed/i))
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['api', '/shops/shop-1'] });
  });

  it('surfaces a backend rejection message (e.g. out of stock) as an error toast', async () => {
    routeApi({
      party: [makeParty()],
      character: makeCharacter({ currency: gp(100) }),
      purchase: () => Promise.reject(new ApiError(400, 'Not enough stock for this purchase')),
    });
    renderPanel();

    const buy = await screen.findByRole('button', { name: /buy potion of healing/i });
    await waitFor(() => expect(buy).toBeEnabled());
    await userEvent.click(buy);

    await waitFor(() =>
      expect(mockToast.error).toHaveBeenCalledWith('Not enough stock for this purchase')
    );
  });

  it('offers a character picker when the user has more than one character', async () => {
    routeApi({
      party: [makeParty(), makeParty({ id: 'char-2', name: 'Tordek' })],
      character: makeCharacter({ id: 'char-2', name: 'Tordek', currency: gp(100) }),
    });
    renderPanel();

    const select = await screen.findByRole('combobox', { name: /buying as/i });
    expect(screen.getByRole('option', { name: 'Mialee' })).toBeInTheDocument();
    await userEvent.selectOptions(select, 'char-2');

    // Selecting a character fetches that full character sheet.
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/characters/char-2'));
  });
});
