import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NoteDetailPage from '../page';
import type { Note } from '@/lib/types';

const mockApiFetch = vi.fn();
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();
const mockRouterPush = vi.fn();
const mockUseAuth = vi.fn();

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'camp-1', noteId: 'note-1' }),
  useRouter: () => ({ push: mockRouterPush }),
}));
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

function makeNote(over: Partial<Note> = {}): Note {
  return {
    id: 'note-1',
    campaignId: 'camp-1',
    authorId: 'user-1',
    title: 'Session 1 recap',
    content: 'The party met at the inn.',
    visibility: 'party',
    sessionNumber: 3,
    tags: ['lore', 'quest'],
    createdAt: '',
    updatedAt: '',
    ...over,
  } as Note;
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockToastError.mockReset();
  mockToastSuccess.mockReset();
  mockRouterPush.mockReset();
  mockUseAuth.mockReturnValue({
    user: { userId: 'user-1', username: 'dm', role: 'dungeon_master' },
  });
});

describe('NoteDetailPage', () => {
  it('shows the loading state before the fetch resolves', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    render(<NoteDetailPage />);
    expect(screen.getByText(/^loading\.\.\./i)).toBeInTheDocument();
  });

  it('renders not-found and toasts when the request fails', async () => {
    mockApiFetch.mockRejectedValue(new Error('404'));
    render(<NoteDetailPage />);
    await waitFor(() => expect(screen.getByText(/note not found/i)).toBeInTheDocument());
    expect(mockToastError).toHaveBeenCalledWith('Failed to load note');
  });

  it('renders title, visibility badge, session number, tags, and content', async () => {
    mockApiFetch.mockResolvedValue(makeNote());
    render(<NoteDetailPage />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /session 1 recap/i })).toBeInTheDocument()
    );
    expect(screen.getByText('party')).toBeInTheDocument();
    expect(screen.getByText(/^session 3$/i)).toBeInTheDocument();
    expect(screen.getByText('lore')).toBeInTheDocument();
    expect(screen.getByText('quest')).toBeInTheDocument();
    expect(screen.getByText('The party met at the inn.')).toBeInTheDocument();
  });

  it('omits the session line and tag row when those fields are absent', async () => {
    mockApiFetch.mockResolvedValue(makeNote({ sessionNumber: undefined, tags: [] }));
    render(<NoteDetailPage />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /session 1 recap/i })).toBeInTheDocument()
    );
    expect(screen.queryByText('lore')).not.toBeInTheDocument();
    expect(screen.queryByText('quest')).not.toBeInTheDocument();
    // The "Session N" subtitle <p> renders only when sessionNumber is defined.
    expect(
      screen.queryByText(
        (_text, el) => el?.tagName === 'P' && /^\s*Session \d+\s*$/.test(el.textContent ?? '')
      )
    ).not.toBeInTheDocument();
  });

  it('shows an Edit button only when the current user is the author', async () => {
    mockApiFetch.mockResolvedValue(makeNote({ authorId: 'someone-else' }));
    render(<NoteDetailPage />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /session 1 recap/i })).toBeInTheDocument()
    );
    expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument();
  });

  it('lets the author switch into edit mode, save changes, and exit back to view mode', async () => {
    mockApiFetch.mockResolvedValueOnce(makeNote());
    mockApiFetch.mockResolvedValueOnce(
      makeNote({
        title: 'Updated title',
        content: 'Updated body',
        visibility: 'dm_only',
        sessionNumber: 5,
        tags: ['updated'],
      })
    );
    const user = userEvent.setup();
    render(<NoteDetailPage />);

    await user.click(await screen.findByRole('button', { name: /^edit$/i }));

    const titleInput = screen.getByLabelText(/title/i);
    expect(titleInput).toHaveValue('Session 1 recap');
    expect(screen.getByLabelText(/content/i)).toHaveValue('The party met at the inn.');
    expect(screen.getByLabelText(/visibility/i)).toHaveValue('party');
    expect(screen.getByLabelText(/session number/i)).toHaveValue(3);
    expect(screen.getByLabelText(/tags/i)).toHaveValue('lore, quest');

    await user.clear(titleInput);
    await user.type(titleInput, 'Updated title');
    await user.clear(screen.getByLabelText(/content/i));
    await user.type(screen.getByLabelText(/content/i), 'Updated body');
    await user.selectOptions(screen.getByLabelText(/visibility/i), 'dm_only');
    await user.clear(screen.getByLabelText(/session number/i));
    await user.type(screen.getByLabelText(/session number/i), '5');
    await user.clear(screen.getByLabelText(/tags/i));
    await user.type(screen.getByLabelText(/tags/i), 'updated');

    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Note updated!'));
    expect(mockApiFetch).toHaveBeenLastCalledWith(
      '/notes/note-1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          title: 'Updated title',
          content: 'Updated body',
          visibility: 'dm_only',
          sessionNumber: 5,
          tags: ['updated'],
        }),
      })
    );
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /updated title/i })).toBeInTheDocument()
    );
    expect(screen.queryByLabelText(/^title$/i)).not.toBeInTheDocument();
  });

  it('cancel button exits edit mode without persisting changes', async () => {
    mockApiFetch.mockResolvedValueOnce(makeNote());
    const user = userEvent.setup();
    render(<NoteDetailPage />);
    await user.click(await screen.findByRole('button', { name: /^edit$/i }));

    await user.clear(screen.getByLabelText(/title/i));
    await user.type(screen.getByLabelText(/title/i), 'Discarded');
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(screen.getByRole('heading', { name: /session 1 recap/i })).toBeInTheDocument();
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });

  it('shows the saving label while update is in flight and toasts on failure', async () => {
    mockApiFetch.mockResolvedValueOnce(makeNote());
    let reject: (err: unknown) => void = () => {};
    mockApiFetch.mockReturnValueOnce(
      new Promise((_resolve, rej) => {
        reject = rej;
      })
    );
    const user = userEvent.setup();
    render(<NoteDetailPage />);
    await user.click(await screen.findByRole('button', { name: /^edit$/i }));
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    const saving = await screen.findByRole('button', { name: /saving\.\.\./i });
    expect(saving).toBeDisabled();

    reject(new Error('conflict'));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('conflict'));
    expect(screen.getByRole('button', { name: /^save$/i })).toBeEnabled();
  });

  it('toasts a generic message when the update rejection is not an Error', async () => {
    mockApiFetch.mockResolvedValueOnce(makeNote());
    mockApiFetch.mockRejectedValueOnce('boom');
    const user = userEvent.setup();
    render(<NoteDetailPage />);
    await user.click(await screen.findByRole('button', { name: /^edit$/i }));
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Failed to update note'));
  });

  it('sends sessionNumber: null in the PATCH body when it is cleared', async () => {
    mockApiFetch.mockResolvedValueOnce(makeNote({ sessionNumber: 3 }));
    mockApiFetch.mockResolvedValueOnce(makeNote({ sessionNumber: undefined }));
    const user = userEvent.setup();
    render(<NoteDetailPage />);
    await user.click(await screen.findByRole('button', { name: /^edit$/i }));
    await user.clear(screen.getByLabelText(/session number/i));
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
    const [, init] = mockApiFetch.mock.calls[1];
    const body = JSON.parse((init as { body: string }).body);
    expect(body.sessionNumber).toBeNull();
  });

  it('navigates back to the campaign when the back link is clicked', async () => {
    mockApiFetch.mockResolvedValue(makeNote());
    const user = userEvent.setup();
    render(<NoteDetailPage />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /session 1 recap/i })).toBeInTheDocument()
    );
    await user.click(screen.getByRole('button', { name: /back to campaign/i }));
    expect(mockRouterPush).toHaveBeenCalledWith('/campaigns/camp-1');
  });
});
