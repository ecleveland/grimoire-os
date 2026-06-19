import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import ShopsListPage from '../page';
import type { Campaign, ShopListItem, PaginatedResponse } from '@/lib/types';

const mockApiFetch = vi.fn();
const mockUseAuth = vi.fn();

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'camp-1' }),
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
  return render(<ShopsListPage />, { wrapper });
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

function makeShop(over: Partial<ShopListItem> = {}): ShopListItem {
  return {
    id: 'shop-1',
    campaignId: 'camp-1',
    createdById: 'user-1',
    name: "Maelin's Apothecary",
    theme: 'alchemist',
    description: null,
    icon: null,
    accent: null,
    isOpen: true,
    createdAt: '',
    updatedAt: '',
    ...over,
  };
}

function list(data: ShopListItem[]): PaginatedResponse<ShopListItem> {
  return { data, total: data.length, page: 1, lastPage: 1 };
}

function routeApi(campaign: Campaign, shops: ShopListItem[]) {
  mockApiFetch.mockImplementation((path: string) => {
    if (path.startsWith('/campaigns/camp-1')) return Promise.resolve(campaign);
    if (path.startsWith('/shops?campaignId=camp-1')) return Promise.resolve(list(shops));
    return Promise.reject(new Error(`unexpected path ${path}`));
  });
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockUseAuth.mockReturnValue({ user: { userId: 'user-1', role: 'dungeon_master' } });
});

describe('ShopsListPage', () => {
  it('shows a loading state before the fetch resolves', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText(/loading shops/i)).toBeInTheDocument();
  });

  it('shows the empty state when there are no shops', async () => {
    routeApi(makeCampaign(), []);
    renderPage();
    await waitFor(() => expect(screen.getByText('No shops yet.')).toBeInTheDocument());
  });

  it('renders the storefront grid and links each shop to its detail page', async () => {
    routeApi(makeCampaign(), [makeShop({ id: 'shop-a', name: 'Open Apothecary' })]);
    renderPage();
    await waitFor(() => expect(screen.getByText('Open Apothecary')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /open apothecary/i })).toHaveAttribute(
      'href',
      '/campaigns/camp-1/shops/shop-a'
    );
  });

  it('owner sees closed shops (badged) and a New Shop affordance', async () => {
    routeApi(makeCampaign({ ownerId: 'user-1' }), [
      makeShop({ id: 'shop-a', name: 'Open Apothecary', isOpen: true }),
      makeShop({ id: 'shop-b', name: 'Shuttered Smithy', isOpen: false }),
    ]);
    renderPage();
    await waitFor(() => expect(screen.getByText('Open Apothecary')).toBeInTheDocument());
    expect(screen.getByText('Shuttered Smithy')).toBeInTheDocument();
    expect(screen.getByText('Closed')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /new shop/i })).toHaveAttribute(
      'href',
      '/campaigns/camp-1/shops/new'
    );
  });

  it('hides closed shops and the New Shop affordance from non-owner members', async () => {
    mockUseAuth.mockReturnValue({ user: { userId: 'user-2', role: 'player' } });
    routeApi(makeCampaign({ ownerId: 'user-1' }), [
      makeShop({ id: 'shop-a', name: 'Open Apothecary', isOpen: true }),
      makeShop({ id: 'shop-b', name: 'Shuttered Smithy', isOpen: false }),
    ]);
    renderPage();
    await waitFor(() => expect(screen.getByText('Open Apothecary')).toBeInTheDocument());
    expect(screen.queryByText('Shuttered Smithy')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /new shop/i })).not.toBeInTheDocument();
  });
});
