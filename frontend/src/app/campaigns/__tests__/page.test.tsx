import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CampaignsPage from '../page';
import type { CampaignListItem, PaginatedResponse } from '@/lib/types';

const mockApiFetch = vi.fn();
const mockToastError = vi.fn();
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: vi.fn(),
  },
}));

function makeCampaign(over: Partial<CampaignListItem> = {}): CampaignListItem {
  return {
    id: 'camp-1',
    name: 'The Lost Mines',
    description: 'A starter adventure',
    ownerId: 'user-1',
    playerIds: ['user-2', 'user-3'],
    status: 'active',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

function makeResponse(
  data: CampaignListItem[],
  over: Partial<PaginatedResponse<CampaignListItem>> = {}
) {
  return {
    data,
    total: data.length,
    page: 1,
    lastPage: 1,
    limit: 20,
    ...over,
  } as PaginatedResponse<CampaignListItem>;
}

function renderPage() {
  // Fresh QueryClient per render with retries off so error states settle
  // immediately and no cache bleeds between tests. The client is returned so a
  // test can invalidate the cached list to force a background refetch.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const utils = render(
    <QueryClientProvider client={client}>
      <CampaignsPage />
    </QueryClientProvider>
  );
  return { client, ...utils };
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockToastError.mockReset();
});

describe('CampaignsPage', () => {
  it('shows the loading state before the fetch resolves', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText(/loading campaigns/i)).toBeInTheDocument();
  });

  it('fetches campaigns with pagination params on mount', async () => {
    mockApiFetch.mockResolvedValue(makeResponse([]));
    renderPage();
    await waitFor(() => {
      // useListQuery sorts the params so the cache key ignores their order.
      expect(mockApiFetch).toHaveBeenCalledWith('/campaigns?limit=20&page=1');
    });
  });

  it('renders the heading and a link to create a new campaign', async () => {
    mockApiFetch.mockResolvedValue(makeResponse([makeCampaign()]));
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /campaigns/i })).toBeInTheDocument()
    );
    const newLink = screen.getByRole('link', { name: /new campaign/i });
    expect(newLink).toHaveAttribute('href', '/campaigns/new');
    const joinLink = screen.getByRole('link', { name: /join campaign/i });
    expect(joinLink).toHaveAttribute('href', '/campaigns/join');
  });

  it('renders a card per campaign with name, description, status, and player count', async () => {
    mockApiFetch.mockResolvedValue(
      makeResponse([
        makeCampaign({
          id: 'a',
          name: 'The Lost Mines',
          description: 'A starter adventure',
          status: 'active',
          playerIds: ['u2', 'u3'],
        }),
        makeCampaign({
          id: 'b',
          name: 'Curse of Strahd',
          description: undefined,
          status: 'paused',
          playerIds: ['u4'],
        }),
      ])
    );
    renderPage();
    await waitFor(() => expect(screen.getByText('The Lost Mines')).toBeInTheDocument());
    expect(screen.getByText('A starter adventure')).toBeInTheDocument();
    expect(screen.getByText('Curse of Strahd')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByText('paused')).toBeInTheDocument();
    expect(screen.getByText('2 players')).toBeInTheDocument();
    expect(screen.getByText('1 player')).toBeInTheDocument();
    const detailLink = screen.getByRole('link', { name: /the lost mines/i });
    expect(detailLink).toHaveAttribute('href', '/campaigns/a');
  });

  it('shows the empty state when no campaigns are returned', async () => {
    mockApiFetch.mockResolvedValue(makeResponse([]));
    renderPage();
    await waitFor(() => expect(screen.getByText(/no campaigns yet/i)).toBeInTheDocument());
  });

  it('toasts an error when the campaigns request fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockApiFetch.mockRejectedValue(new Error('boom'));
    renderPage();
    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(
        'Failed to load campaigns',
        expect.objectContaining({ id: 'load-campaigns' })
      )
    );
    consoleError.mockRestore();
  });

  it('shows a retryable error when the campaigns request fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockApiFetch.mockRejectedValueOnce(new Error('boom'));
    renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Failed to load campaigns');
    expect(screen.queryByText(/no campaigns yet/i)).not.toBeInTheDocument();

    mockApiFetch.mockResolvedValueOnce(makeResponse([makeCampaign()]));
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('The Lost Mines')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    consoleError.mockRestore();
  });

  it('keeps the loaded campaigns when a background refetch fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockApiFetch.mockResolvedValueOnce(makeResponse([makeCampaign()]));
    const { client } = renderPage();
    expect(await screen.findByText('The Lost Mines')).toBeInTheDocument();

    mockApiFetch.mockRejectedValueOnce(new Error('offline'));
    await client.invalidateQueries();

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(
        'Failed to load campaigns',
        expect.objectContaining({ id: 'load-campaigns' })
      )
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('The Lost Mines')).toBeInTheDocument();
    consoleError.mockRestore();
  });

  it('keeps the rows on screen while a refetch runs after a failed background refetch', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockApiFetch.mockResolvedValueOnce(makeResponse([makeCampaign()]));
    const { client } = renderPage();
    expect(await screen.findByText('The Lost Mines')).toBeInTheDocument();

    mockApiFetch.mockRejectedValueOnce(new Error('offline'));
    await client.invalidateQueries();
    await waitFor(() => expect(mockToastError).toHaveBeenCalled());

    // The query now holds status 'error' with data. A second refetch that is
    // still in flight must not replace the rows with the loading view.
    mockApiFetch.mockReturnValueOnce(new Promise(() => {}));
    void client.invalidateQueries();
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(3));

    expect(screen.getByText('The Lost Mines')).toBeInTheDocument();
    expect(screen.queryByText(/loading campaigns/i)).not.toBeInTheDocument();
    consoleError.mockRestore();
  });

  it('renders pagination controls when there is more than one page', async () => {
    mockApiFetch.mockResolvedValue(
      makeResponse([makeCampaign({ id: 'a' })], { total: 25, lastPage: 2 })
    );
    renderPage();
    await waitFor(() => expect(screen.getByText('The Lost Mines')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
    expect(screen.getByText(/page 1 of 2/i)).toBeInTheDocument();
  });
});
