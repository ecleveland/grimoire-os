import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import ShopDetailPage from '../page';
import type { Campaign, Shop } from '@/lib/types';

const mockApiFetch = vi.fn();
const mockUseAuth = vi.fn();

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'camp-1', shopId: 'shop-1' }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/lib/auth-context', () => ({ useAuth: () => mockUseAuth() }));

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<ShopDetailPage />, { wrapper });
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
    description: 'A cramped shop reeking of sulfur.',
    icon: null,
    accent: null,
    items: [
      {
        itemId: null,
        name: 'Potion of Healing',
        category: 'Potion',
        price: { cp: 0, sp: 0, ep: 0, gp: 50, pp: 0 },
        stock: 5,
      },
      { itemId: null, name: 'Torch', price: { cp: 1, sp: 0, ep: 0, gp: 0, pp: 0 }, stock: null },
      {
        itemId: null,
        name: 'Rare Tonic',
        price: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 1 },
        stock: 0,
      },
    ],
    isOpen: true,
    createdAt: '',
    updatedAt: '',
    ...over,
  };
}

function routeApi(campaign: Campaign, shop: Shop | 'reject') {
  mockApiFetch.mockImplementation((path: string) => {
    if (path.startsWith('/campaigns/camp-1')) return Promise.resolve(campaign);
    if (path.startsWith('/shops/shop-1')) {
      return shop === 'reject' ? Promise.reject(new Error('not found')) : Promise.resolve(shop);
    }
    return Promise.reject(new Error(`unexpected path ${path}`));
  });
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockUseAuth.mockReturnValue({ user: { userId: 'user-1', role: 'dungeon_master' } });
});

describe('ShopDetailPage', () => {
  it('shows a loading state before the fetch resolves', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText(/^loading/i)).toBeInTheDocument();
  });

  it('shows a not-found state when the shop fails to load', async () => {
    routeApi(makeCampaign(), 'reject');
    renderPage();
    await waitFor(() => expect(screen.getByText('Shop not found.')).toBeInTheDocument());
  });

  it('renders the themed banner and each line item with formatted price and stock', async () => {
    routeApi(makeCampaign(), makeShop());
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: "Maelin's Apothecary" })).toBeInTheDocument()
    );
    // Formatted prices via the shared coin util.
    expect(screen.getByText('Potion of Healing')).toBeInTheDocument();
    expect(screen.getByText('50 gp')).toBeInTheDocument();
    expect(screen.getByText('1 cp')).toBeInTheDocument();
    expect(screen.getByText('1 pp')).toBeInTheDocument();
    // Stock statuses.
    expect(screen.getByText('5 left')).toBeInTheDocument();
    expect(screen.getByText('Unlimited')).toBeInTheDocument();
    expect(screen.getByText('Out of stock')).toBeInTheDocument();
  });

  it('shows the empty-stock message when the shop has no items', async () => {
    routeApi(makeCampaign(), makeShop({ items: [] }));
    renderPage();
    await waitFor(() =>
      expect(screen.getByText('This shop has nothing in stock.')).toBeInTheDocument()
    );
  });

  it('shows a Manage affordance to the owner', async () => {
    routeApi(makeCampaign({ ownerId: 'user-1' }), makeShop());
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: "Maelin's Apothecary" })).toBeInTheDocument()
    );
    expect(screen.getByRole('link', { name: /manage/i })).toHaveAttribute(
      'href',
      '/campaigns/camp-1/shops/shop-1/edit'
    );
  });

  it('hides the Manage affordance from non-owner members', async () => {
    mockUseAuth.mockReturnValue({ user: { userId: 'user-2', role: 'player' } });
    routeApi(makeCampaign({ ownerId: 'user-1' }), makeShop());
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: "Maelin's Apothecary" })).toBeInTheDocument()
    );
    expect(screen.queryByRole('link', { name: /manage/i })).not.toBeInTheDocument();
  });

  it('hides a closed shop from non-owner members', async () => {
    mockUseAuth.mockReturnValue({ user: { userId: 'user-2', role: 'player' } });
    routeApi(makeCampaign({ ownerId: 'user-1' }), makeShop({ isOpen: false }));
    renderPage();
    await waitFor(() => expect(screen.getByText('This shop is closed.')).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: "Maelin's Apothecary" })).not.toBeInTheDocument();
  });

  it('lets the owner preview a closed shop', async () => {
    routeApi(makeCampaign({ ownerId: 'user-1' }), makeShop({ isOpen: false }));
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: "Maelin's Apothecary" })).toBeInTheDocument()
    );
    expect(screen.getByText('Closed')).toBeInTheDocument();
  });

  it('does not flash "closed" to the owner while ownership is still resolving', async () => {
    // The closed shop resolves before the campaign (ownership) query, the order
    // that would otherwise briefly deny the owner their own closed shop.
    let resolveCampaign!: (c: Campaign) => void;
    const campaignPromise = new Promise<Campaign>(r => {
      resolveCampaign = r;
    });
    mockApiFetch.mockImplementation((path: string) => {
      if (path.startsWith('/campaigns/camp-1')) return campaignPromise;
      if (path.startsWith('/shops/shop-1')) return Promise.resolve(makeShop({ isOpen: false }));
      return Promise.reject(new Error(`unexpected path ${path}`));
    });
    renderPage();
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/shops/shop-1'));
    await Promise.resolve();
    expect(screen.queryByText('This shop is closed.')).not.toBeInTheDocument();

    // Once ownership resolves to the owner, the shop becomes visible.
    resolveCampaign(makeCampaign({ ownerId: 'user-1' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: "Maelin's Apothecary" })).toBeInTheDocument()
    );
  });
});
