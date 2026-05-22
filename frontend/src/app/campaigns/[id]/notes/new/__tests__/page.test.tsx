import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NewNotePage from '../page';

const mockApiFetch = vi.fn();
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();
const mockRouterPush = vi.fn();
const mockRouterBack = vi.fn();

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'camp-1' }),
  useRouter: () => ({ push: mockRouterPush, back: mockRouterBack }),
}));
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));

beforeEach(() => {
  mockApiFetch.mockReset();
  mockToastError.mockReset();
  mockToastSuccess.mockReset();
  mockRouterPush.mockReset();
  mockRouterBack.mockReset();
});

describe('NewNotePage', () => {
  it('renders the form with default visibility set to private', () => {
    render(<NewNotePage />);
    expect(screen.getByRole('heading', { name: /create note/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/title/i)).toHaveValue('');
    expect(screen.getByLabelText(/content/i)).toHaveValue('');
    expect(screen.getByLabelText(/visibility/i)).toHaveValue('private');
    expect(screen.getByLabelText(/session number/i)).toHaveValue(null);
    expect(screen.getByLabelText(/tags/i)).toHaveValue('');
    expect(screen.getByRole('button', { name: /create note/i })).toBeEnabled();
  });

  it('submits the new note, toasts success, and navigates to the detail page', async () => {
    mockApiFetch.mockResolvedValue({ id: 'note-99' });
    const user = userEvent.setup();
    render(<NewNotePage />);

    await user.type(screen.getByLabelText(/title/i), 'Session 1 recap');
    await user.type(screen.getByLabelText(/content/i), 'The party met at the inn.');
    await user.selectOptions(screen.getByLabelText(/visibility/i), 'party');
    await user.type(screen.getByLabelText(/session number/i), '3');
    await user.type(screen.getByLabelText(/tags/i), ' lore, , quest ');

    await user.click(screen.getByRole('button', { name: /create note/i }));

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Note created!'));
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/notes',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          campaignId: 'camp-1',
          title: 'Session 1 recap',
          content: 'The party met at the inn.',
          visibility: 'party',
          sessionNumber: 3,
          tags: ['lore', 'quest'],
        }),
      })
    );
    expect(mockRouterPush).toHaveBeenCalledWith('/campaigns/camp-1/notes/note-99');
  });

  it('omits sessionNumber when left blank and sends an empty tags array', async () => {
    mockApiFetch.mockResolvedValue({ id: 'note-2' });
    const user = userEvent.setup();
    render(<NewNotePage />);
    await user.type(screen.getByLabelText(/title/i), 'No session');
    await user.type(screen.getByLabelText(/content/i), 'Body');
    await user.click(screen.getByRole('button', { name: /create note/i }));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    const [, init] = mockApiFetch.mock.calls[0];
    const body = JSON.parse((init as { body: string }).body);
    expect(body.sessionNumber).toBeUndefined();
    expect(body.tags).toEqual([]);
    expect(body.visibility).toBe('private');
  });

  it('shows the submitting label while the request is in flight and re-enables on error', async () => {
    let reject: (err: unknown) => void = () => {};
    mockApiFetch.mockReturnValue(
      new Promise((_resolve, rej) => {
        reject = rej;
      })
    );
    const user = userEvent.setup();
    render(<NewNotePage />);
    await user.type(screen.getByLabelText(/title/i), 't');
    await user.type(screen.getByLabelText(/content/i), 'c');
    await user.click(screen.getByRole('button', { name: /create note/i }));

    const submitting = await screen.findByRole('button', { name: /creating\.\.\./i });
    expect(submitting).toBeDisabled();

    reject(new Error('server down'));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('server down'));
    expect(screen.getByRole('button', { name: /create note/i })).toBeEnabled();
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it('toasts a generic message when the rejection is not an Error', async () => {
    mockApiFetch.mockRejectedValue('boom');
    const user = userEvent.setup();
    render(<NewNotePage />);
    await user.type(screen.getByLabelText(/title/i), 't');
    await user.type(screen.getByLabelText(/content/i), 'c');
    await user.click(screen.getByRole('button', { name: /create note/i }));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Failed to create note'));
  });

  it('calls router.back when the cancel button is clicked', async () => {
    const user = userEvent.setup();
    render(<NewNotePage />);
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(mockRouterBack).toHaveBeenCalledTimes(1);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});
