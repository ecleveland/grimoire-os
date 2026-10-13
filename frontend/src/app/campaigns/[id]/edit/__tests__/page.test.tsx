import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

function renderPage() {
  // Fresh QueryClient per render with retries off so error states settle
  // immediately and no cache bleeds between tests. The client is returned so a
  // test can invalidate the cached campaign to force a background refetch.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const utils = render(
    <QueryClientProvider client={client}>
      <EditCampaignPage />
    </QueryClientProvider>
  );
  return { client, ...utils };
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
    renderPage();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('prefills the form with existing campaign values', async () => {
    mockApiFetch.mockResolvedValue(makeCampaign());
    renderPage();
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
    renderPage();
    await waitFor(() => {
      expect((screen.getByLabelText(/^name/i) as HTMLInputElement).value).toBe('The Lost Mines');
    });
    expect((screen.getByLabelText(/^description/i) as HTMLTextAreaElement).value).toBe('');
    expect((screen.getByLabelText(/^setting/i) as HTMLInputElement).value).toBe('');
  });

  it('toasts an error when the initial load fails', async () => {
    mockApiFetch.mockRejectedValue(new Error('nope'));
    renderPage();
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Failed to load campaign'));
  });

  it('renders an error state instead of an editable form when the initial load fails', async () => {
    mockApiFetch.mockRejectedValue(new Error('nope'));
    renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Failed to load campaign.');
    expect(within(alert).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    // No form: a Save here would PATCH empty defaults over the real record.
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^name/i)).not.toBeInTheDocument();
  });

  it('Retry re-fetches and renders the form once the load succeeds', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('nope'));
    mockApiFetch.mockResolvedValueOnce(makeCampaign());
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() =>
      expect((screen.getByLabelText(/^name/i) as HTMLInputElement).value).toBe('The Lost Mines')
    );
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });

  it('renders not-found when the campaign comes back empty', async () => {
    mockApiFetch.mockResolvedValue(null);
    renderPage();
    expect(await screen.findByText('Campaign not found.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to campaigns/i })).toHaveAttribute(
      'href',
      '/campaigns'
    );
    expect(screen.queryByLabelText(/^name/i)).not.toBeInTheDocument();
  });

  it('keeps the form and its unsaved edits when a background refetch fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockApiFetch.mockResolvedValueOnce(makeCampaign());
    const { client } = renderPage();
    await waitFor(() =>
      expect((screen.getByLabelText(/^name/i) as HTMLInputElement).value).toBe('The Lost Mines')
    );
    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: 'Half-typed' } });

    mockApiFetch.mockRejectedValueOnce(new Error('offline'));
    await client.invalidateQueries();

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Failed to load campaign'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect((screen.getByLabelText(/^name/i) as HTMLInputElement).value).toBe('Half-typed');
    consoleError.mockRestore();
  });

  it('PATCHes /campaigns/:id with edited values and redirects on save', async () => {
    mockApiFetch.mockResolvedValueOnce(makeCampaign());
    mockApiFetch.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    renderPage();

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
    renderPage();

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
    renderPage();
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
    renderPage();
    await waitFor(() =>
      expect((screen.getByLabelText(/^name/i) as HTMLInputElement).value).toBe('The Lost Mines')
    );
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    // Confirmation dialog is now open
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/delete campaign\?/i)).toBeInTheDocument();
    // Cascade warning (VEG-312): campaign content dies with the campaign
    expect(
      screen.getByText(/permanently deletes all of its notes, encounters, and NPCs/i)
    ).toBeInTheDocument();
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

  it('does not toast a load error after a successful delete', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockApiFetch.mockResolvedValueOnce(makeCampaign());
    mockApiFetch.mockResolvedValueOnce(undefined);
    // Any GET after the DELETE hits a campaign that no longer exists.
    mockApiFetch.mockRejectedValue(new Error('Campaign not found'));
    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect((screen.getByLabelText(/^name/i) as HTMLInputElement).value).toBe('The Lost Mines')
    );
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /delete/i }));

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Campaign deleted'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/campaigns'));
    // Let any refetch the delete triggered settle before checking for its toast.
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(mockToastError).not.toHaveBeenCalled();
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
    consoleError.mockRestore();
  });

  it('Delete confirm dialog can be dismissed via Cancel', async () => {
    mockApiFetch.mockResolvedValueOnce(makeCampaign());
    const user = userEvent.setup();
    renderPage();
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
    renderPage();
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
