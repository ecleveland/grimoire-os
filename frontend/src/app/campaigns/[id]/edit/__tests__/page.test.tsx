import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EditCampaignPage from '../page';
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
  useParams: () => ({ id: 'camp-1' }),
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
    id: 'camp-1',
    name: 'The Lost Mines',
    description: 'A starter adventure',
    ownerId: 'user-1',
    playerIds: [],
    characterIds: [],
    status: 'active',
    setting: 'Forgotten Realms',
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

describe('EditCampaignPage', () => {
  it('shows the loading state before the fetch resolves', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    render(<EditCampaignPage />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('prefills the form with existing campaign values', async () => {
    mockApiFetch.mockResolvedValue(makeCampaign());
    render(<EditCampaignPage />);
    await waitFor(() => {
      expect((screen.getByLabelText(/^name/i) as HTMLInputElement).value).toBe('The Lost Mines');
    });
    expect((screen.getByLabelText(/^description/i) as HTMLTextAreaElement).value).toBe(
      'A starter adventure'
    );
    expect((screen.getByLabelText(/^setting/i) as HTMLInputElement).value).toBe('Forgotten Realms');
    expect((screen.getByLabelText(/^status/i) as HTMLSelectElement).value).toBe('active');
  });

  it('treats missing optional fields as empty strings', async () => {
    mockApiFetch.mockResolvedValue(makeCampaign({ description: undefined, setting: undefined }));
    render(<EditCampaignPage />);
    await waitFor(() => {
      expect((screen.getByLabelText(/^name/i) as HTMLInputElement).value).toBe('The Lost Mines');
    });
    expect((screen.getByLabelText(/^description/i) as HTMLTextAreaElement).value).toBe('');
    expect((screen.getByLabelText(/^setting/i) as HTMLInputElement).value).toBe('');
  });

  it('toasts an error when the initial load fails', async () => {
    mockApiFetch.mockRejectedValue(new Error('nope'));
    render(<EditCampaignPage />);
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Failed to load campaign'));
  });

  it('renders an error state instead of an editable form when the initial load fails', async () => {
    mockApiFetch.mockRejectedValue(new Error('nope'));
    render(<EditCampaignPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument());
    // No form: a Save here would PATCH empty defaults over the real record.
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^name/i)).not.toBeInTheDocument();
  });

  it('Retry re-fetches and renders the form once the load succeeds', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('nope'));
    mockApiFetch.mockResolvedValueOnce(makeCampaign());
    const user = userEvent.setup();
    render(<EditCampaignPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() =>
      expect((screen.getByLabelText(/^name/i) as HTMLInputElement).value).toBe('The Lost Mines')
    );
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });

  it('PATCHes /campaigns/:id with edited values and redirects on save', async () => {
    mockApiFetch.mockResolvedValueOnce(makeCampaign());
    mockApiFetch.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<EditCampaignPage />);

    await waitFor(() =>
      expect((screen.getByLabelText(/^name/i) as HTMLInputElement).value).toBe('The Lost Mines')
    );
    const nameInput = screen.getByLabelText(/^name/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Renamed');
    await user.selectOptions(screen.getByLabelText(/^status/i), 'paused');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
    expect(mockApiFetch).toHaveBeenLastCalledWith(
      '/campaigns/camp-1',
      expect.objectContaining({ method: 'PATCH' })
    );
    const body = JSON.parse((mockApiFetch.mock.calls[1][1] as RequestInit).body as string);
    expect(body).toEqual({
      name: 'Renamed',
      description: 'A starter adventure',
      setting: 'Forgotten Realms',
      status: 'paused',
    });
    expect(mockToastSuccess).toHaveBeenCalledWith('Campaign updated!');
    expect(mockPush).toHaveBeenCalledWith('/campaigns/camp-1');
  });

  it('toasts an error and stays on the page if the PATCH fails', async () => {
    mockApiFetch.mockResolvedValueOnce(makeCampaign());
    mockApiFetch.mockRejectedValueOnce(new Error('forbidden'));
    const user = userEvent.setup();
    render(<EditCampaignPage />);

    await waitFor(() =>
      expect((screen.getByLabelText(/^name/i) as HTMLInputElement).value).toBe('The Lost Mines')
    );
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('forbidden'));
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /save changes/i })).not.toBeDisabled();
  });

  it('Cancel navigates back without saving', async () => {
    mockApiFetch.mockResolvedValueOnce(makeCampaign());
    const user = userEvent.setup();
    render(<EditCampaignPage />);
    await waitFor(() =>
      expect((screen.getByLabelText(/^name/i) as HTMLInputElement).value).toBe('The Lost Mines')
    );
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(mockBack).toHaveBeenCalled();
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });

  it('Delete opens the confirm dialog and DELETEs on confirmation', async () => {
    mockApiFetch.mockResolvedValueOnce(makeCampaign());
    mockApiFetch.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<EditCampaignPage />);
    await waitFor(() =>
      expect((screen.getByLabelText(/^name/i) as HTMLInputElement).value).toBe('The Lost Mines')
    );
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    // Confirmation dialog is now open
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/delete campaign\?/i)).toBeInTheDocument();
    // Click the confirm "Delete" button inside the dialog (the second one)
    const dialog = screen.getByRole('dialog');
    const confirmBtn = within(dialog).getByRole('button', { name: /delete/i });
    await user.click(confirmBtn);

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
    expect(mockApiFetch).toHaveBeenLastCalledWith(
      '/campaigns/camp-1',
      expect.objectContaining({ method: 'DELETE' })
    );
    expect(mockToastSuccess).toHaveBeenCalledWith('Campaign deleted');
    expect(mockPush).toHaveBeenCalledWith('/campaigns');
  });

  it('Delete confirm dialog can be dismissed via Cancel', async () => {
    mockApiFetch.mockResolvedValueOnce(makeCampaign());
    const user = userEvent.setup();
    render(<EditCampaignPage />);
    await waitFor(() =>
      expect((screen.getByLabelText(/^name/i) as HTMLInputElement).value).toBe('The Lost Mines')
    );
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });

  it('toasts an error if the DELETE fails', async () => {
    mockApiFetch.mockResolvedValueOnce(makeCampaign());
    mockApiFetch.mockRejectedValueOnce(new Error('cannot delete'));
    const user = userEvent.setup();
    render(<EditCampaignPage />);
    await waitFor(() =>
      expect((screen.getByLabelText(/^name/i) as HTMLInputElement).value).toBe('The Lost Mines')
    );
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /delete/i }));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('cannot delete'));
    expect(mockPush).not.toHaveBeenCalled();
  });
});
