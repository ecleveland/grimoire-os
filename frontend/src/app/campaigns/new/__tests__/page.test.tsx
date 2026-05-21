import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NewCampaignPage from '../page';
import type { Campaign } from '@/lib/types';

const mockApiFetch = vi.fn();
const mockPush = vi.fn();
const mockBack = vi.fn();
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));

function makeCampaign(over: Partial<Campaign> = {}): Campaign {
  return {
    id: 'new-id',
    name: 'The Lost Mines',
    ownerId: 'user-1',
    playerIds: [],
    characterIds: [],
    status: 'active',
    createdAt: '',
    updatedAt: '',
    ...over,
  };
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockPush.mockReset();
  mockBack.mockReset();
  mockToastError.mockReset();
  mockToastSuccess.mockReset();
});

describe('NewCampaignPage', () => {
  it('renders the form with Name, Description, and Setting fields', () => {
    render(<NewCampaignPage />);
    expect(screen.getByRole('heading', { name: /create campaign/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^description/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^setting/i)).toBeInTheDocument();
  });

  it('marks Name as required', () => {
    render(<NewCampaignPage />);
    expect(screen.getByLabelText(/^name/i)).toBeRequired();
  });

  it('POSTs /campaigns with form values and redirects to the new campaign on success', async () => {
    mockApiFetch.mockResolvedValue(makeCampaign({ id: 'created-id' }));
    const user = userEvent.setup();
    render(<NewCampaignPage />);

    await user.type(screen.getByLabelText(/^name/i), 'My Campaign');
    await user.type(screen.getByLabelText(/^description/i), 'A grand tale');
    await user.type(screen.getByLabelText(/^setting/i), 'Eberron');
    await user.click(screen.getByRole('button', { name: /create campaign/i }));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/campaigns',
      expect.objectContaining({ method: 'POST' })
    );
    const body = JSON.parse((mockApiFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({
      name: 'My Campaign',
      description: 'A grand tale',
      setting: 'Eberron',
    });
    expect(mockToastSuccess).toHaveBeenCalledWith('Campaign created!');
    expect(mockPush).toHaveBeenCalledWith('/campaigns/created-id');
  });

  it('shows submitting state while the request is in flight', async () => {
    let resolveFetch: (value: Campaign) => void = () => {};
    mockApiFetch.mockReturnValue(
      new Promise<Campaign>(resolve => {
        resolveFetch = resolve;
      })
    );
    const user = userEvent.setup();
    render(<NewCampaignPage />);
    await user.type(screen.getByLabelText(/^name/i), 'In Progress');
    await user.click(screen.getByRole('button', { name: /create campaign/i }));
    expect(screen.getByRole('button', { name: /creating/i })).toBeDisabled();
    resolveFetch(makeCampaign({ id: 'x' }));
    await waitFor(() => expect(mockPush).toHaveBeenCalled());
  });

  it('toasts an error and re-enables the submit button when the API fails', async () => {
    mockApiFetch.mockRejectedValue(new Error('Name already exists'));
    const user = userEvent.setup();
    render(<NewCampaignPage />);

    await user.type(screen.getByLabelText(/^name/i), 'Dup');
    await user.click(screen.getByRole('button', { name: /create campaign/i }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Name already exists'));
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /create campaign/i })).not.toBeDisabled();
  });

  it('falls back to a generic message when the rejection is not an Error', async () => {
    mockApiFetch.mockRejectedValue('weird');
    const user = userEvent.setup();
    render(<NewCampaignPage />);

    await user.type(screen.getByLabelText(/^name/i), 'X');
    await user.click(screen.getByRole('button', { name: /create campaign/i }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Failed to create campaign'));
  });

  it('Cancel navigates back without calling the API', async () => {
    const user = userEvent.setup();
    render(<NewCampaignPage />);
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(mockBack).toHaveBeenCalled();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});
