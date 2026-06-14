import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import CampaignMembership from '../CampaignMembership';
import type { Campaign, CampaignListItem, Character, PaginatedResponse } from '@/lib/types';

const mockApiFetch = vi.fn();
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));

function makeTestClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderControl(ui: ReactNode, client: QueryClient = makeTestClient()) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<>{ui}</>, { wrapper });
}

function makeCharacter(over: Partial<Character> = {}): Character {
  return {
    id: 'char-1',
    userId: 'user-1',
    name: 'Thorin',
    ...over,
  } as Character;
}

function makeCampaign(over: Partial<CampaignListItem> = {}): CampaignListItem {
  return {
    id: 'camp-1',
    name: 'The Lost Mines',
    description: undefined,
    ownerId: 'user-1',
    status: 'active',
    playerIds: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

function campaignsResponse(items: CampaignListItem[]): PaginatedResponse<CampaignListItem> {
  return { data: items, total: items.length, page: 1, lastPage: 1, limit: 100 };
}

// Route the shared apiFetch mock by path: the campaigns-list GET vs the attach POST.
function routeApiFetch(campaigns: CampaignListItem[], attachResult?: () => Promise<Campaign>) {
  mockApiFetch.mockImplementation((path: string, options?: { method?: string }) => {
    if (path.startsWith('/campaigns?')) return Promise.resolve(campaignsResponse(campaigns));
    if (options?.method === 'POST')
      return (attachResult ?? (() => Promise.resolve({} as Campaign)))();
    return Promise.reject(new Error(`unexpected apiFetch: ${path}`));
  });
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockToastError.mockReset();
  mockToastSuccess.mockReset();
});

describe('CampaignMembership', () => {
  it('shows the attached campaign as a link when the character is in a campaign', async () => {
    routeApiFetch([makeCampaign({ id: 'camp-1', name: 'The Lost Mines' })]);
    renderControl(
      <CampaignMembership character={makeCharacter({ campaignId: 'camp-1' })} isOwner={true} />
    );

    const link = await screen.findByRole('link', { name: /the lost mines/i });
    expect(link).toHaveAttribute('href', '/campaigns/camp-1');
    // No picker when already attached.
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('falls back to a generic link label when the attached campaign is not in the list', async () => {
    // e.g. attached to a campaign beyond the fetched page, or the viewer isn't a member.
    routeApiFetch([makeCampaign({ id: 'other', name: 'Some Other Campaign' })]);
    renderControl(
      <CampaignMembership
        character={makeCharacter({ campaignId: 'camp-unknown' })}
        isOwner={true}
      />
    );

    const link = await screen.findByRole('link', { name: /view campaign/i });
    expect(link).toHaveAttribute('href', '/campaigns/camp-unknown');
  });

  it('shows the attached campaign link to a non-owner viewer too', async () => {
    routeApiFetch([makeCampaign({ id: 'camp-1', name: 'The Lost Mines' })]);
    renderControl(
      <CampaignMembership character={makeCharacter({ campaignId: 'camp-1' })} isOwner={false} />
    );

    expect(await screen.findByRole('link', { name: /the lost mines/i })).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('reflects the attached campaign after the parent refetches post-attach', async () => {
    routeApiFetch([makeCampaign({ id: 'camp-2', name: 'Curse of Strahd' })]);
    const { rerender } = renderControl(
      <CampaignMembership character={makeCharacter({ id: 'char-1' })} isOwner={true} />
    );
    // Starts unattached: the picker is shown.
    await screen.findByRole('combobox', { name: /add to campaign/i });

    // After attach, the parent's character query refetches and passes the
    // attached character down — the control flips to the campaign link.
    rerender(
      <CampaignMembership
        character={makeCharacter({ id: 'char-1', campaignId: 'camp-2' })}
        isOwner={true}
      />
    );
    expect(await screen.findByRole('link', { name: /curse of strahd/i })).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('does not flash the empty state while the campaigns list is loading', async () => {
    let resolveCampaigns: (r: PaginatedResponse<CampaignListItem>) => void = () => {};
    mockApiFetch.mockImplementation((path: string) => {
      if (path.startsWith('/campaigns?'))
        return new Promise<PaginatedResponse<CampaignListItem>>(resolve => {
          resolveCampaigns = resolve;
        });
      return Promise.reject(new Error(`unexpected apiFetch: ${path}`));
    });
    renderControl(<CampaignMembership character={makeCharacter()} isOwner={true} />);

    // While pending, the "Join a campaign" empty prompt must not appear.
    expect(screen.queryByText(/join a campaign/i)).toBeNull();
    resolveCampaigns(campaignsResponse([]));
    expect(await screen.findByText(/join a campaign/i)).toBeInTheDocument();
  });

  it('does not show the empty prompt when the campaigns fetch fails (only on success)', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockApiFetch.mockImplementation((path: string) => {
      if (path.startsWith('/campaigns?')) return Promise.reject(new Error('boom'));
      return Promise.reject(new Error(`unexpected apiFetch: ${path}`));
    });
    renderControl(<CampaignMembership character={makeCharacter()} isOwner={true} />);

    // The fetch error is surfaced (errorToast), and the empty state — gated on
    // isSuccess — must NOT render, so an owner with campaigns isn't misdirected.
    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith('Failed to load your campaigns')
    );
    expect(screen.queryByText(/join a campaign/i)).toBeNull();
    consoleError.mockRestore();
  });

  it('renders a campaign picker for the owner when unattached', async () => {
    routeApiFetch([
      makeCampaign({ id: 'camp-1', name: 'The Lost Mines' }),
      makeCampaign({ id: 'camp-2', name: 'Curse of Strahd' }),
    ]);
    renderControl(<CampaignMembership character={makeCharacter()} isOwner={true} />);

    const select = await screen.findByRole('combobox', { name: /add to campaign/i });
    expect(select).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: 'The Lost Mines' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Curse of Strahd' })).toBeInTheDocument();
    // Button disabled until a campaign is chosen.
    expect(screen.getByRole('button', { name: /add to campaign/i })).toBeDisabled();
  });

  it('posts the attach request and invalidates the character query on success', async () => {
    routeApiFetch([makeCampaign({ id: 'camp-2', name: 'Curse of Strahd' })], () =>
      Promise.resolve({ id: 'camp-2', name: 'Curse of Strahd' } as Campaign)
    );
    const client = makeTestClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const user = userEvent.setup();
    renderControl(
      <CampaignMembership character={makeCharacter({ id: 'char-1' })} isOwner={true} />,
      client
    );

    await screen.findByRole('option', { name: 'Curse of Strahd' });
    await user.selectOptions(screen.getByRole('combobox', { name: /add to campaign/i }), 'camp-2');
    await user.click(screen.getByRole('button', { name: /add to campaign/i }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/campaigns/camp-2/characters/char-1', {
        method: 'POST',
      })
    );
    expect(mockToastSuccess).toHaveBeenCalled();
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['api', '/characters/char-1'] })
    );
  });

  it('shows an empty state when the owner has no campaigns to attach to', async () => {
    routeApiFetch([]);
    renderControl(<CampaignMembership character={makeCharacter()} isOwner={true} />);

    expect(await screen.findByText(/join a campaign/i)).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('renders nothing for a non-owner viewing an unattached character', () => {
    routeApiFetch([makeCampaign()]);
    const { container } = renderControl(
      <CampaignMembership character={makeCharacter()} isOwner={false} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('surfaces the backend error message on a failed attach (Error)', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    routeApiFetch([makeCampaign({ id: 'camp-2', name: 'Curse of Strahd' })], () =>
      Promise.reject(new Error('You can only add your own characters to a campaign'))
    );
    const user = userEvent.setup();
    renderControl(<CampaignMembership character={makeCharacter()} isOwner={true} />);

    await screen.findByRole('option', { name: 'Curse of Strahd' });
    await user.selectOptions(screen.getByRole('combobox', { name: /add to campaign/i }), 'camp-2');
    await user.click(screen.getByRole('button', { name: /add to campaign/i }));

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(
        'You can only add your own characters to a campaign'
      )
    );
    consoleError.mockRestore();
  });

  it('falls back to a generic message on a non-Error rejection', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    routeApiFetch([makeCampaign({ id: 'camp-2', name: 'Curse of Strahd' })], () =>
      Promise.reject('boom')
    );
    const user = userEvent.setup();
    renderControl(<CampaignMembership character={makeCharacter()} isOwner={true} />);

    await screen.findByRole('option', { name: 'Curse of Strahd' });
    await user.selectOptions(screen.getByRole('combobox', { name: /add to campaign/i }), 'camp-2');
    await user.click(screen.getByRole('button', { name: /add to campaign/i }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Failed to add to campaign'));
    consoleError.mockRestore();
  });
});
