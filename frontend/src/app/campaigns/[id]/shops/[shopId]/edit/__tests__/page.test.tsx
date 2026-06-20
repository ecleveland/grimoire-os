import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import EditShopPage from '../page';
import type { Campaign, Shop } from '@/lib/types';

const mockApiFetch = vi.fn();
const mockPush = vi.fn();
const mockUseAuth = vi.fn();

vi.mock('@/lib/api', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'camp-1', shopId: 'shop-1' }),
  useRouter: () => ({ push: mockPush, back: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/lib/auth-context', () => ({ useAuth: () => mockUseAuth() }));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<EditShopPage />, { wrapper });
}

function makeCampaign(over: Partial<Campaign> = {}): Campaign {
  return {
    id: 'camp-1',
    name: 'The Lost Mines',
    description: '',
    ownerId: 'user-1',
    playerIds: [],
    characterIds: [],
    status: 'active',
    setting: '',
    currentSession: 0,
    createdAt: '',
    updatedAt: '',
    ...over,
  };
}

function makeShop(over: Partial<Shop> = {}): Shop {
  return {
    id: 'shop-1',
    campaignId: 'camp-1',
    createdById: 'user-1',
    name: "Maelin's Apothecary",
    theme: 'alchemist',
    description: 'Smells of sulfur.',
    icon: null,
    accent: null,
    items: [
      {
        itemId: 'item-1',
        name: 'Potion of Healing',
        category: 'Potion',
        price: { cp: 0, sp: 0, ep: 0, gp: 50, pp: 0 },
        stock: 5,
      },
    ],
    isOpen: true,
    createdAt: '',
    updatedAt: '',
    ...over,
  };
}

function routeApi(campaign: Campaign, shop: Shop) {
  mockApiFetch.mockImplementation((path: string, init?: RequestInit) => {
    if (path.startsWith('/campaigns/camp-1') && !init) return Promise.resolve(campaign);
    if (path === '/shops/shop-1' && !init) return Promise.resolve(shop);
    if (path === '/shops/shop-1' && init?.method === 'PATCH')
      return Promise.resolve({ ...shop, ...JSON.parse(init.body as string) });
    if (path === '/shops/shop-1' && init?.method === 'DELETE') return Promise.resolve(undefined);
    return Promise.reject(new Error(`unexpected ${path}`));
  });
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockPush.mockReset();
  mockUseAuth.mockReturnValue({ user: { userId: 'user-1', role: 'dungeon_master' } });
});

describe('EditShopPage', () => {
  it('blocks a non-owner from the builder and hides its controls', async () => {
    mockUseAuth.mockReturnValue({ user: { userId: 'user-2', role: 'player' } });
    routeApi(makeCampaign({ ownerId: 'user-1' }), makeShop());
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/only the campaign owner can edit shops/i)).toBeInTheDocument()
    );
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete shop/i })).not.toBeInTheDocument();
  });

  it('waits for auth hydration before deciding ownership (no refusal flash)', async () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: true });
    routeApi(makeCampaign({ ownerId: 'user-1' }), makeShop());
    renderPage();
    await waitFor(() => expect(screen.getByText(/^loading/i)).toBeInTheDocument());
    expect(screen.queryByText(/only the campaign owner/i)).not.toBeInTheDocument();
  });

  it('pre-loads the shop into the form', async () => {
    routeApi(makeCampaign({ ownerId: 'user-1' }), makeShop());
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/^name/i)).toHaveValue("Maelin's Apothecary"));
    expect(screen.getByLabelText(/^theme/i)).toHaveValue('alchemist');
    // The existing line item is rendered with its price + stock.
    expect(screen.getByText('Potion of Healing')).toBeInTheDocument();
    expect(screen.getByLabelText(/line 1 gp/i)).toHaveValue(50);
    expect(screen.getByLabelText(/line 1 stock/i)).toHaveValue(5);
  });

  it('PATCHes the shop without campaignId and navigates back to detail', async () => {
    routeApi(makeCampaign({ ownerId: 'user-1' }), makeShop());
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByLabelText(/^name/i)).toHaveValue("Maelin's Apothecary"));
    await user.clear(screen.getByLabelText(/^name/i));
    await user.type(screen.getByLabelText(/^name/i), 'Renamed Shop');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      const patch = mockApiFetch.mock.calls.find(
        ([p, i]) => p === '/shops/shop-1' && i?.method === 'PATCH'
      );
      expect(patch).toBeDefined();
    });
    const patch = mockApiFetch.mock.calls.find(
      ([p, i]) => p === '/shops/shop-1' && i?.method === 'PATCH'
    )!;
    const body = JSON.parse((patch[1] as RequestInit).body as string);
    expect(body.name).toBe('Renamed Shop');
    expect(body).not.toHaveProperty('campaignId');
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/campaigns/camp-1/shops/shop-1'));
  });

  it('deletes the shop after confirmation and navigates to the list', async () => {
    routeApi(makeCampaign({ ownerId: 'user-1' }), makeShop());
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByLabelText(/^name/i)).toHaveValue("Maelin's Apothecary"));
    await user.click(screen.getByRole('button', { name: /delete shop/i }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /^delete$/i }));

    await waitFor(() => {
      const del = mockApiFetch.mock.calls.find(
        ([p, i]) => p === '/shops/shop-1' && i?.method === 'DELETE'
      );
      expect(del).toBeDefined();
    });
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/campaigns/camp-1/shops'));
  });

  it('toasts an error and stays on the form when save fails', async () => {
    const { toast } = await import('sonner');
    const shop = makeShop();
    mockApiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path.startsWith('/campaigns/camp-1') && !init)
        return Promise.resolve(makeCampaign({ ownerId: 'user-1' }));
      if (path === '/shops/shop-1' && !init) return Promise.resolve(shop);
      if (path === '/shops/shop-1' && init?.method === 'PATCH')
        return Promise.reject(new Error('Save boom'));
      return Promise.reject(new Error(`unexpected ${path}`));
    });
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByLabelText(/^name/i)).toHaveValue("Maelin's Apothecary"));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Save boom'));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('toasts an error and does not navigate when delete fails', async () => {
    const { toast } = await import('sonner');
    const shop = makeShop();
    mockApiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path.startsWith('/campaigns/camp-1') && !init)
        return Promise.resolve(makeCampaign({ ownerId: 'user-1' }));
      if (path === '/shops/shop-1' && !init) return Promise.resolve(shop);
      if (path === '/shops/shop-1' && init?.method === 'DELETE')
        return Promise.reject(new Error('Delete boom'));
      return Promise.reject(new Error(`unexpected ${path}`));
    });
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByLabelText(/^name/i)).toHaveValue("Maelin's Apothecary"));
    await user.click(screen.getByRole('button', { name: /delete shop/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /^delete$/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Delete boom'));
    // A failed delete must NOT navigate the DM away from the shop.
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows a not-found state when the shop fails to load', async () => {
    mockApiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path.startsWith('/campaigns/camp-1') && !init)
        return Promise.resolve(makeCampaign({ ownerId: 'user-1' }));
      if (path === '/shops/shop-1') return Promise.reject(new Error('not found'));
      return Promise.reject(new Error(`unexpected ${path}`));
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('Shop not found.')).toBeInTheDocument());
  });
});
