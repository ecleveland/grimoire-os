import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import CampaignsPage from '../page';
import type { Campaign, PaginatedResponse } from '@/lib/types';

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

function makeCampaign(over: Partial<Campaign> = {}): Campaign {
  return {
    id: 'camp-1',
    name: 'The Lost Mines',
    description: 'A starter adventure',
    ownerId: 'user-1',
    playerIds: ['user-2', 'user-3'],
    characterIds: [],
    status: 'active',
    setting: 'Forgotten Realms',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

function makeResponse(data: Campaign[], over: Partial<PaginatedResponse<Campaign>> = {}) {
  return {
    data,
    total: data.length,
    page: 1,
    lastPage: 1,
    limit: 20,
    ...over,
  } as PaginatedResponse<Campaign>;
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockToastError.mockReset();
});

describe('CampaignsPage', () => {
  it('shows the loading state before the fetch resolves', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    render(<CampaignsPage />);
    expect(screen.getByText(/loading campaigns/i)).toBeInTheDocument();
  });

  it('fetches campaigns with pagination params on mount', async () => {
    mockApiFetch.mockResolvedValue(makeResponse([]));
    render(<CampaignsPage />);
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/campaigns?page=1&limit=20');
    });
  });

  it('renders the heading and a link to create a new campaign', async () => {
    mockApiFetch.mockResolvedValue(makeResponse([makeCampaign()]));
    render(<CampaignsPage />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /campaigns/i })).toBeInTheDocument()
    );
    const newLink = screen.getByRole('link', { name: /new campaign/i });
    expect(newLink).toHaveAttribute('href', '/campaigns/new');
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
    render(<CampaignsPage />);
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
    render(<CampaignsPage />);
    await waitFor(() => expect(screen.getByText(/no campaigns yet/i)).toBeInTheDocument());
  });

  it('toasts an error when the campaigns request fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockApiFetch.mockRejectedValue(new Error('boom'));
    render(<CampaignsPage />);
    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(
        'Failed to load campaigns',
        expect.objectContaining({ id: 'load-campaigns' })
      )
    );
    consoleError.mockRestore();
  });

  it('renders pagination controls when there is more than one page', async () => {
    mockApiFetch.mockResolvedValue(
      makeResponse([makeCampaign({ id: 'a' })], { total: 25, lastPage: 2 })
    );
    render(<CampaignsPage />);
    await waitFor(() => expect(screen.getByText('The Lost Mines')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
    expect(screen.getByText(/page 1 of 2/i)).toBeInTheDocument();
  });
});
