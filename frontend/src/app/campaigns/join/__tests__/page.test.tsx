import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import JoinCampaignPage from '../page';
import type { Campaign } from '@/lib/types';

const mockApiFetch = vi.fn();
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();
const mockPush = vi.fn();

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
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

function renderPage(client: QueryClient = makeTestClient()) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<JoinCampaignPage />, { wrapper });
}

function makeCampaign(over: Partial<Campaign> = {}): Campaign {
  return {
    id: 'camp-99',
    name: 'The Joined Campaign',
    ...over,
  } as Campaign;
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockToastError.mockReset();
  mockToastSuccess.mockReset();
  mockPush.mockReset();
});

describe('JoinCampaignPage', () => {
  it('renders the heading, code input, and submit button', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /join a campaign/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/invite code/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /join campaign/i })).toBeInTheDocument();
  });

  it('disables the submit button until a code is entered', async () => {
    const user = userEvent.setup();
    renderPage();
    const submit = screen.getByRole('button', { name: /join campaign/i });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText(/invite code/i), 'abc123');
    expect(submit).toBeEnabled();
  });

  it('posts the trimmed, encoded code and navigates to the joined campaign on success', async () => {
    const user = userEvent.setup();
    const client = makeTestClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    mockApiFetch.mockResolvedValue(makeCampaign({ id: 'camp-99', name: 'The Joined Campaign' }));
    renderPage(client);

    await user.type(screen.getByLabelText(/invite code/i), '  deadbeefcafe  ');
    await user.click(screen.getByRole('button', { name: /join campaign/i }));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/campaigns/join/deadbeefcafe', {
        method: 'POST',
      });
    });
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/campaigns/camp-99'));
    expect(mockToastSuccess).toHaveBeenCalledWith('Joined The Joined Campaign!');
    // The campaigns-list cache is invalidated so the new campaign shows on return.
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalled());
  });

  it('still toasts and navigates when the cache invalidation rejects', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    const client = makeTestClient();
    // A failed list refetch must not strand a user who has already joined.
    vi.spyOn(client, 'invalidateQueries').mockRejectedValue(new Error('refetch failed'));
    mockApiFetch.mockResolvedValue(makeCampaign({ id: 'camp-99', name: 'The Joined Campaign' }));
    renderPage(client);

    await user.type(screen.getByLabelText(/invite code/i), 'goodcode');
    await user.click(screen.getByRole('button', { name: /join campaign/i }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/campaigns/camp-99'));
    expect(mockToastSuccess).toHaveBeenCalledWith('Joined The Joined Campaign!');
    // The invalidation failure is logged, not swallowed and not surfaced as a join error.
    await waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith(
        'Failed to invalidate campaigns list after join:',
        expect.any(Error)
      )
    );
    expect(mockToastError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('disables the button and fires a single request while the join is in flight', async () => {
    const user = userEvent.setup();
    let resolveJoin: (c: Campaign) => void = () => {};
    mockApiFetch.mockReturnValue(
      new Promise<Campaign>(resolve => {
        resolveJoin = resolve;
      })
    );
    renderPage();

    await user.type(screen.getByLabelText(/invite code/i), 'somecode');
    await user.click(screen.getByRole('button', { name: /join campaign/i }));

    // Mid-flight the button shows the pending label and is disabled.
    const button = screen.getByRole('button', { name: /joining/i });
    expect(button).toBeDisabled();

    // A second submit attempt while pending must not fire another request.
    await user.click(button);
    expect(mockApiFetch).toHaveBeenCalledTimes(1);

    resolveJoin(makeCampaign({ id: 'camp-99' }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/campaigns/camp-99'));
  });

  it('encodes codes containing URL-special characters', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue(makeCampaign());
    renderPage();

    await user.type(screen.getByLabelText(/invite code/i), 'a b/c');
    await user.click(screen.getByRole('button', { name: /join campaign/i }));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/campaigns/join/a%20b%2Fc', { method: 'POST' });
    });
  });

  it('surfaces the backend error message and does not navigate on an Error rejection', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    mockApiFetch.mockRejectedValue(new Error('Invite code has expired'));
    renderPage();

    await user.type(screen.getByLabelText(/invite code/i), 'expiredcode');
    await user.click(screen.getByRole('button', { name: /join campaign/i }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Invite code has expired'));
    expect(mockPush).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('falls back to a generic message on a non-Error rejection', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    mockApiFetch.mockRejectedValue('boom');
    renderPage();

    await user.type(screen.getByLabelText(/invite code/i), 'somecode');
    await user.click(screen.getByRole('button', { name: /join campaign/i }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Failed to join campaign'));
    expect(mockPush).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
