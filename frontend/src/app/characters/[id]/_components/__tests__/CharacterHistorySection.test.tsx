import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CharacterHistorySection from '../CharacterHistorySection';
import type { CharacterSnapshotSummary } from '@/lib/types';
import { makeCharacter } from '@/test-utils/character';
import { renderWithQueryClient } from '@/test-utils/query';

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

const PATH = '/characters/char-1/snapshots';
const CAP_MESSAGE = 'A character can keep at most 50 snapshots. Delete one to save another.';

function makeSnapshot(over: Partial<CharacterSnapshotSummary> = {}): CharacterSnapshotSummary {
  return {
    id: 'snap-1',
    level: 4,
    label: null,
    takenAt: '2026-09-01T12:00:00Z',
    ...over,
  };
}

const newest = makeSnapshot({
  id: 'snap-2',
  level: 5,
  label: 'Before the dragon',
  takenAt: '2026-10-12T12:00:00Z',
});
const oldest = makeSnapshot();

interface Routes {
  list: () => Promise<CharacterSnapshotSummary[]>;
  post?: () => Promise<CharacterSnapshotSummary>;
  del?: () => Promise<void>;
}

// Route the shared apiFetch mock by path and method: the list GET, the save
// POST and the delete DELETE.
function routeApiFetch({ list, post, del }: Routes) {
  mockApiFetch.mockImplementation((path: string, options?: { method?: string }) => {
    const method = options?.method ?? 'GET';
    if (path === PATH && method === 'GET') return list();
    if (path === PATH && method === 'POST' && post) return post();
    if (path.startsWith(`${PATH}/`) && method === 'DELETE' && del) return del();
    return Promise.reject(new Error(`unexpected apiFetch: ${method} ${path}`));
  });
}

function renderSection(isOwner = true) {
  return renderWithQueryClient(
    <CharacterHistorySection character={makeCharacter({ id: 'char-1' })} isOwner={isOwner} />
  );
}

function rowTexts() {
  return screen.getAllByTestId('snapshot-row').map(row => row.textContent);
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockToastError.mockReset();
  mockToastSuccess.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CharacterHistorySection (VEG-644)', () => {
  it('renders nothing and fetches nothing for a non-owner', () => {
    routeApiFetch({ list: () => Promise.resolve([newest]) });
    const { container } = renderSection(false);

    expect(container).toBeEmptyDOMElement();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('shows a loading line, then the empty state once an empty list resolves', async () => {
    let resolveList: (rows: CharacterSnapshotSummary[]) => void = () => {};
    routeApiFetch({
      list: () =>
        new Promise(resolve => {
          resolveList = resolve;
        }),
    });
    renderSection();

    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByText(/no snapshots yet/i)).toBeNull();

    resolveList([]);
    expect(
      await screen.findByText('No snapshots yet. One is saved automatically at every level-up.')
    ).toBeInTheDocument();
    expect(screen.queryByText('Loading…')).toBeNull();
  });

  it('renders each row as level, label and date in the order the API returns', async () => {
    routeApiFetch({ list: () => Promise.resolve([newest, oldest]) });
    renderSection();

    expect(await screen.findByText('Level 5 · Before the dragon · 12 Oct 2026')).toBeVisible();
    expect(screen.getByText('Level 4 · 1 Sept 2026')).toBeVisible();
    expect(rowTexts()).toEqual([
      expect.stringContaining('Level 5 · Before the dragon'),
      expect.stringContaining('Level 4 · 1 Sept 2026'),
    ]);
    expect(screen.queryByText(/no snapshots yet/i)).toBeNull();
  });

  it('toasts a failed list fetch and shows neither rows nor the empty state', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    routeApiFetch({ list: () => Promise.reject(new Error('boom')) });
    renderSection();

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Failed to load snapshots'));
    expect(screen.queryAllByTestId('snapshot-row')).toHaveLength(0);
    expect(screen.queryByText(/no snapshots yet/i)).toBeNull();
    expect(screen.queryByText('Loading…')).toBeNull();
  });

  describe('save snapshot', () => {
    it('posts the label, toasts, closes the dialog and refetches the list', async () => {
      let rows = [oldest];
      routeApiFetch({
        list: () => Promise.resolve(rows),
        post: () => {
          rows = [newest, ...rows];
          return Promise.resolve(newest);
        },
      });
      const user = userEvent.setup();
      renderSection();
      await screen.findByText('Level 4 · 1 Sept 2026');

      await user.click(screen.getByRole('button', { name: 'Save snapshot' }));
      const dialog = screen.getByTestId('save-snapshot-dialog');
      const input = within(dialog).getByLabelText('Label');
      expect(input).toHaveAttribute('placeholder', 'Before the dragon fight');
      await user.type(input, 'Before the dragon');
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      await waitFor(() =>
        expect(mockApiFetch).toHaveBeenCalledWith(PATH, {
          method: 'POST',
          body: JSON.stringify({ label: 'Before the dragon' }),
        })
      );
      await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Saved snapshot'));
      expect(screen.queryByTestId('save-snapshot-dialog')).toBeNull();
      expect(await screen.findByText('Level 5 · Before the dragon · 12 Oct 2026')).toBeVisible();
      expect(screen.getAllByTestId('snapshot-row')).toHaveLength(2);
    });

    it.each([
      ['an empty', ''],
      ['a whitespace-only', '   '],
    ])('posts an empty body for %s label', async (_desc, typed) => {
      routeApiFetch({
        list: () => Promise.resolve([]),
        post: () => Promise.resolve(makeSnapshot({ id: 'snap-3', level: 1 })),
      });
      const user = userEvent.setup();
      renderSection();
      await screen.findByText(/no snapshots yet/i);

      await user.click(screen.getByRole('button', { name: 'Save snapshot' }));
      const dialog = screen.getByTestId('save-snapshot-dialog');
      if (typed) await user.type(within(dialog).getByLabelText('Label'), typed);
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      await waitFor(() =>
        expect(mockApiFetch).toHaveBeenCalledWith(PATH, { method: 'POST', body: '{}' })
      );
    });

    it('toasts the backend message on an Error rejection and keeps the dialog open', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      routeApiFetch({
        list: () => Promise.resolve([oldest]),
        post: () => Promise.reject(new Error(CAP_MESSAGE)),
      });
      const user = userEvent.setup();
      renderSection();
      await screen.findByText('Level 4 · 1 Sept 2026');

      await user.click(screen.getByRole('button', { name: 'Save snapshot' }));
      const dialog = screen.getByTestId('save-snapshot-dialog');
      await user.type(within(dialog).getByLabelText('Label'), 'One too many');
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(mockToastError).toHaveBeenCalledWith(CAP_MESSAGE));
      expect(mockToastSuccess).not.toHaveBeenCalled();
      expect(screen.getByTestId('save-snapshot-dialog')).toBeInTheDocument();
      expect(within(dialog).getByLabelText('Label')).toHaveValue('One too many');
    });

    it('falls back to a generic toast on a non-Error rejection', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      routeApiFetch({
        list: () => Promise.resolve([oldest]),
        post: () => Promise.reject('boom'),
      });
      const user = userEvent.setup();
      renderSection();
      await screen.findByText('Level 4 · 1 Sept 2026');

      await user.click(screen.getByRole('button', { name: 'Save snapshot' }));
      await user.click(
        within(screen.getByTestId('save-snapshot-dialog')).getByRole('button', { name: 'Save' })
      );

      await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Failed to save snapshot'));
    });

    it('closes the dialog on Cancel without posting', async () => {
      routeApiFetch({ list: () => Promise.resolve([oldest]) });
      const user = userEvent.setup();
      renderSection();
      await screen.findByText('Level 4 · 1 Sept 2026');

      await user.click(screen.getByRole('button', { name: 'Save snapshot' }));
      await user.click(
        within(screen.getByTestId('save-snapshot-dialog')).getByRole('button', { name: 'Cancel' })
      );

      expect(screen.queryByTestId('save-snapshot-dialog')).toBeNull();
      expect(mockApiFetch).not.toHaveBeenCalledWith(
        PATH,
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('delete snapshot', () => {
    const deleteNewest = { name: 'Delete snapshot Level 5 · Before the dragon · 12 Oct 2026' };

    it('sends no DELETE when the confirm dialog is cancelled', async () => {
      routeApiFetch({ list: () => Promise.resolve([newest, oldest]) });
      const user = userEvent.setup();
      renderSection();
      await screen.findByText('Level 5 · Before the dragon · 12 Oct 2026');

      await user.click(screen.getByRole('button', deleteNewest));
      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByText('Delete snapshot?')).toBeVisible();
      await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByRole('dialog')).toBeNull();
      expect(mockApiFetch).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ method: 'DELETE' })
      );
      expect(screen.getAllByTestId('snapshot-row')).toHaveLength(2);
    });

    it('confirms, sends the DELETE, toasts and drops the row after the refetch', async () => {
      let rows = [newest, oldest];
      routeApiFetch({
        list: () => Promise.resolve(rows),
        del: () => {
          rows = [oldest];
          return Promise.resolve();
        },
      });
      const user = userEvent.setup();
      renderSection();
      await screen.findByText('Level 5 · Before the dragon · 12 Oct 2026');

      await user.click(screen.getByRole('button', deleteNewest));
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));

      await waitFor(() =>
        expect(mockApiFetch).toHaveBeenCalledWith(`${PATH}/snap-2`, { method: 'DELETE' })
      );
      await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Snapshot deleted'));
      await waitFor(() =>
        expect(screen.queryByText('Level 5 · Before the dragon · 12 Oct 2026')).toBeNull()
      );
      expect(rowTexts()).toEqual([expect.stringContaining('Level 4 · 1 Sept 2026')]);
    });

    it('toasts the backend message on an Error rejection', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      routeApiFetch({
        list: () => Promise.resolve([newest, oldest]),
        del: () => Promise.reject(new Error('Snapshot not found')),
      });
      const user = userEvent.setup();
      renderSection();
      await screen.findByText('Level 5 · Before the dragon · 12 Oct 2026');

      await user.click(screen.getByRole('button', deleteNewest));
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));

      await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Snapshot not found'));
      expect(mockToastSuccess).not.toHaveBeenCalled();
      expect(screen.getAllByTestId('snapshot-row')).toHaveLength(2);
    });

    it('falls back to a generic toast on a non-Error rejection', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      routeApiFetch({
        list: () => Promise.resolve([newest, oldest]),
        del: () => Promise.reject('boom'),
      });
      const user = userEvent.setup();
      renderSection();
      await screen.findByText('Level 5 · Before the dragon · 12 Oct 2026');

      await user.click(screen.getByRole('button', deleteNewest));
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));

      await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Failed to delete snapshot'));
    });
  });
});
