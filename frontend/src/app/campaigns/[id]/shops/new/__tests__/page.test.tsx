import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import NewShopPage from '../page';
import type { Campaign } from '@/lib/types';

const mockApiFetch = vi.fn();
const mockPush = vi.fn();
const mockUseAuth = vi.fn();

vi.mock('@/lib/api', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'camp-1' }),
  useRouter: () => ({ push: mockPush, back: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/auth-context', () => ({ useAuth: () => mockUseAuth() }));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<NewShopPage />, { wrapper });
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

function routeApi(campaign: Campaign) {
  mockApiFetch.mockImplementation((path: string, init?: RequestInit) => {
    if (path.startsWith('/campaigns/camp-1') && !init) return Promise.resolve(campaign);
    if (path === '/shops' && init?.method === 'POST') {
      return Promise.resolve({ id: 'shop-new', ...JSON.parse(init.body as string) });
    }
    return Promise.reject(new Error(`unexpected ${path}`));
  });
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockPush.mockReset();
  mockUseAuth.mockReturnValue({ user: { userId: 'user-1', role: 'dungeon_master' } });
});

describe('NewShopPage', () => {
  it('blocks a non-owner from the builder', async () => {
    mockUseAuth.mockReturnValue({ user: { userId: 'user-2', role: 'player' } });
    routeApi(makeCampaign({ ownerId: 'user-1' }));
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/only the campaign owner can create shops/i)).toBeInTheDocument()
    );
    expect(screen.queryByRole('button', { name: /create shop/i })).not.toBeInTheDocument();
  });

  it('waits for auth hydration before deciding ownership (no refusal flash)', async () => {
    // Auth not yet hydrated: user is null but isLoading is true. The owner must
    // see "Loading", never the "only the owner" refusal.
    mockUseAuth.mockReturnValue({ user: null, isLoading: true });
    routeApi(makeCampaign({ ownerId: 'user-1' }));
    renderPage();
    await waitFor(() => expect(screen.getByText(/^loading/i)).toBeInTheDocument());
    expect(screen.queryByText(/only the campaign owner/i)).not.toBeInTheDocument();
  });

  it('posts the shop with campaignId and the form values, then navigates to it', async () => {
    routeApi(makeCampaign({ ownerId: 'user-1' }));
    const user = userEvent.setup();
    renderPage();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /create shop/i })).toBeInTheDocument()
    );
    await user.type(screen.getByLabelText(/^name/i), "Maelin's Apothecary");
    await user.selectOptions(screen.getByLabelText(/^theme/i), 'alchemist');
    await user.type(screen.getByLabelText(/^description/i), 'Smells of sulfur.');
    await user.click(screen.getByRole('button', { name: /create shop/i }));

    await waitFor(() => {
      const post = mockApiFetch.mock.calls.find(([p, i]) => p === '/shops' && i?.method === 'POST');
      expect(post).toBeDefined();
    });
    const post = mockApiFetch.mock.calls.find(([p, i]) => p === '/shops' && i?.method === 'POST')!;
    const body = JSON.parse((post[1] as RequestInit).body as string);
    expect(body).toMatchObject({
      campaignId: 'camp-1',
      name: "Maelin's Apothecary",
      theme: 'alchemist',
      description: 'Smells of sulfur.',
      isOpen: true,
      items: [],
    });
    // Blank optional fields are sent as null.
    expect(body.icon).toBeNull();
    expect(body.accent).toBeNull();
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/campaigns/camp-1/shops/shop-new'));
  });

  it('toasts an error and stays on the form when create fails', async () => {
    const { toast } = await import('sonner');
    mockApiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path.startsWith('/campaigns/camp-1') && !init)
        return Promise.resolve(makeCampaign({ ownerId: 'user-1' }));
      if (path === '/shops' && init?.method === 'POST')
        return Promise.reject(new Error('Server boom'));
      return Promise.reject(new Error(`unexpected ${path}`));
    });
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('button', { name: /create shop/i });
    await user.type(screen.getByLabelText(/^name/i), 'Stall');
    await user.click(screen.getByRole('button', { name: /create shop/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Server boom'));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('disables submit until a name is entered', async () => {
    routeApi(makeCampaign({ ownerId: 'user-1' }));
    const user = userEvent.setup();
    renderPage();

    const submit = await screen.findByRole('button', { name: /create shop/i });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText(/^name/i), 'Stall');
    expect(submit).toBeEnabled();
  });

  it('adds a catalog line that rides along in the POST body', async () => {
    mockApiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path.startsWith('/campaigns/camp-1') && !init)
        return Promise.resolve(makeCampaign({ ownerId: 'user-1' }));
      if (path.startsWith('/srd/items?'))
        return Promise.resolve({
          data: [{ id: 'item-1', name: 'Potion of Healing', category: 'Potion', cost: '50 gp' }],
          total: 1,
          page: 1,
          lastPage: 1,
        });
      if (path === '/shops' && init?.method === 'POST')
        return Promise.resolve({ id: 'shop-new', ...JSON.parse(init.body as string) });
      return Promise.reject(new Error(`unexpected ${path}`));
    });
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('button', { name: /create shop/i });
    await user.type(screen.getByLabelText(/^name/i), 'Apothecary');
    await user.type(screen.getByLabelText(/search items/i), 'potion');
    await user.click(await screen.findByRole('button', { name: /add potion of healing/i }));
    await user.click(screen.getByRole('button', { name: /create shop/i }));

    await waitFor(() => {
      const post = mockApiFetch.mock.calls.find(([p, i]) => p === '/shops' && i?.method === 'POST');
      expect(post).toBeDefined();
    });
    const post = mockApiFetch.mock.calls.find(([p, i]) => p === '/shops' && i?.method === 'POST')!;
    const body = JSON.parse((post[1] as RequestInit).body as string);
    expect(body.items).toEqual([
      {
        itemId: 'item-1',
        name: 'Potion of Healing',
        category: 'Potion',
        price: { cp: 0, sp: 0, ep: 0, gp: 50, pp: 0 },
        stock: null,
      },
    ]);
  });

  // VEG-355 — themed presets: the Suggest-stock button pre-fills the editor.
  const suggestion = {
    itemId: 'item-acid',
    name: 'Acid',
    category: 'Adventuring Gear',
    price: { cp: 0, sp: 0, ep: 0, gp: 25, pp: 0 },
    stock: null,
  };

  function routeWithSuggestions(items: (typeof suggestion)[]) {
    mockApiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path.startsWith('/campaigns/camp-1') && !init)
        return Promise.resolve(makeCampaign({ ownerId: 'user-1' }));
      if (path.startsWith('/shops/theme-suggestions')) return Promise.resolve({ items });
      if (path === '/shops' && init?.method === 'POST')
        return Promise.resolve({ id: 'shop-new', ...JSON.parse(init.body as string) });
      return Promise.reject(new Error(`unexpected ${path}`));
    });
  }

  it('suggests stock from the theme and rides it along in the POST body', async () => {
    routeWithSuggestions([suggestion]);
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('button', { name: /create shop/i });
    await user.type(screen.getByLabelText(/^name/i), "Maelin's Apothecary");
    await user.selectOptions(screen.getByLabelText(/^theme/i), 'alchemist');
    await user.click(screen.getByRole('button', { name: /suggest stock for alchemist/i }));

    // The suggested line appears in the editor.
    await screen.findByText('Acid');
    // It targeted the theme endpoint.
    expect(
      mockApiFetch.mock.calls.some(([p]) => p === '/shops/theme-suggestions?theme=alchemist')
    ).toBe(true);

    await user.click(screen.getByRole('button', { name: /create shop/i }));
    await waitFor(() => {
      const post = mockApiFetch.mock.calls.find(([p, i]) => p === '/shops' && i?.method === 'POST');
      expect(post).toBeDefined();
    });
    const post = mockApiFetch.mock.calls.find(([p, i]) => p === '/shops' && i?.method === 'POST')!;
    const body = JSON.parse((post[1] as RequestInit).body as string);
    expect(body.items).toEqual([suggestion]);
  });

  it('skips already-stocked suggestions on re-suggest (dedupe)', async () => {
    const { toast } = await import('sonner');
    routeWithSuggestions([suggestion]);
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('button', { name: /create shop/i });
    await user.selectOptions(screen.getByLabelText(/^theme/i), 'alchemist');
    const suggest = screen.getByRole('button', { name: /suggest stock for alchemist/i });
    await user.click(suggest);
    await screen.findByText('Acid');

    // Re-suggesting the same theme adds nothing and informs the DM.
    await user.click(suggest);
    await waitFor(() => expect(toast.info).toHaveBeenCalled());
    expect(screen.getAllByText('Acid')).toHaveLength(1);
  });

  it('toasts when the suggestion request fails', async () => {
    const { toast } = await import('sonner');
    mockApiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path.startsWith('/campaigns/camp-1') && !init)
        return Promise.resolve(makeCampaign({ ownerId: 'user-1' }));
      if (path.startsWith('/shops/theme-suggestions'))
        return Promise.reject(new Error('Suggest boom'));
      return Promise.reject(new Error(`unexpected ${path}`));
    });
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('button', { name: /create shop/i });
    await user.selectOptions(screen.getByLabelText(/^theme/i), 'alchemist');
    await user.click(screen.getByRole('button', { name: /suggest stock for alchemist/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Suggest boom'));
  });
});
