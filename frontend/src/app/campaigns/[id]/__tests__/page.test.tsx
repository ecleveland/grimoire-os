import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import CampaignDetailPage from '../page';
import type { Campaign, Note, Encounter, Npc, PaginatedResponse } from '@/lib/types';

const mockApiFetch = vi.fn();
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();
const mockUseAuth = vi.fn();

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'camp-1' }),
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

// Fresh QueryClient per render with retries off so error states resolve
// immediately instead of waiting on react-query's retry/backoff.
function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<CampaignDetailPage />, { wrapper });
}

function makeCampaign(over: Partial<Campaign> = {}): Campaign {
  return {
    id: 'camp-1',
    name: 'The Lost Mines',
    description: 'A starter adventure',
    ownerId: 'user-1',
    playerIds: ['user-2', 'user-3'],
    characterIds: ['char-1'],
    status: 'active',
    setting: 'Forgotten Realms',
    currentSession: 4,
    createdAt: '',
    updatedAt: '',
    ...over,
  };
}

function makeNote(over: Partial<Note> = {}): Note {
  return {
    id: 'note-1',
    campaignId: 'camp-1',
    authorId: 'user-1',
    title: 'Session 1 recap',
    content: 'Stuff happened.',
    visibility: 'party',
    tags: [],
    createdAt: '',
    updatedAt: '',
    ...over,
  } as Note;
}

function makeEncounter(over: Partial<Encounter> = {}): Encounter {
  return {
    id: 'enc-1',
    campaignId: 'camp-1',
    createdBy: 'user-1',
    name: 'Goblin Ambush',
    isActive: false,
    round: 0,
    currentTurn: 0,
    combatants: [],
    createdAt: '',
    updatedAt: '',
    ...over,
  } as Encounter;
}

function makeNpc(over: Partial<Npc> = {}): Npc {
  return {
    id: 'npc-1',
    campaignId: 'camp-1',
    createdById: 'user-1',
    name: 'Old Maelin',
    race: 'Human',
    profession: 'Peasant',
    alignment: 'Neutral Good',
    personalityTraits: [],
    ideals: [],
    bonds: [],
    flaws: [],
    goldPieces: 0,
    silverPieces: 0,
    copperPieces: 0,
    lockedFields: [],
    isManual: false,
    createdAt: '',
    updatedAt: '',
    ...over,
  } as Npc;
}

function makeListResponse<T>(data: T[]): PaginatedResponse<T> {
  return { data, total: data.length, page: 1, lastPage: 1, limit: 20 };
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockToastError.mockReset();
  mockToastSuccess.mockReset();
  mockUseAuth.mockReturnValue({
    user: { userId: 'user-1', username: 'dm', role: 'dungeon_master' },
  });
});

describe('CampaignDetailPage', () => {
  it('shows the loading state before the fetch resolves', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText(/^loading\.\.\./i)).toBeInTheDocument();
  });

  it('shows a not-found message and toasts when the campaign request rejects', async () => {
    mockApiFetch.mockRejectedValue(new Error('404'));
    renderPage();
    await waitFor(() => expect(screen.getByText(/campaign not found/i)).toBeInTheDocument());
    expect(mockToastError).toHaveBeenCalledWith('Failed to load campaign');
  });

  it('renders campaign name, status, players, session, description, and setting', async () => {
    mockApiFetch.mockResolvedValue(makeCampaign());
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'The Lost Mines' })).toBeInTheDocument()
    );
    expect(screen.getAllByText('active').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('2 players')).toBeInTheDocument();
    expect(screen.getByText(/session 4/i)).toBeInTheDocument();
    expect(screen.getByText('A starter adventure')).toBeInTheDocument();
    expect(screen.getByText(/forgotten realms/i)).toBeInTheDocument();
  });

  it('shows the Edit link only when the current user owns the campaign', async () => {
    mockApiFetch.mockResolvedValue(makeCampaign({ ownerId: 'user-1' }));
    const { unmount } = renderPage();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'The Lost Mines' })).toBeInTheDocument()
    );
    expect(screen.getByRole('link', { name: /edit/i })).toHaveAttribute(
      'href',
      '/campaigns/camp-1/edit'
    );
    unmount();

    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue(makeCampaign({ ownerId: 'someone-else' }));
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'The Lost Mines' })).toBeInTheDocument()
    );
    expect(screen.queryByRole('link', { name: /edit/i })).not.toBeInTheDocument();
  });

  it('renders the overview tab content by default', async () => {
    mockApiFetch.mockResolvedValue(makeCampaign());
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'The Lost Mines' })).toBeInTheDocument()
    );
    expect(screen.getByRole('heading', { name: /campaign details/i })).toBeInTheDocument();
    const playersDt = screen.getByText(/^players$/i);
    expect(playersDt.nextSibling?.textContent).toBe('2');
    const charsDt = screen.getByText(/^characters$/i);
    expect(charsDt.nextSibling?.textContent).toBe('1');
  });

  it('loads notes when the Notes tab is selected', async () => {
    mockApiFetch.mockResolvedValueOnce(makeCampaign());
    mockApiFetch.mockResolvedValueOnce(
      makeListResponse([makeNote({ id: 'note-a', title: 'Session 1 recap' })])
    );
    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'The Lost Mines' })).toBeInTheDocument()
    );
    await user.click(screen.getByRole('button', { name: /^notes$/i }));
    await waitFor(() => expect(screen.getByText('Session 1 recap')).toBeInTheDocument());
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('/notes?campaignId=camp-1&page=1')
    );
    const link = screen.getByRole('link', { name: /session 1 recap/i });
    expect(link).toHaveAttribute('href', '/campaigns/camp-1/notes/note-a');
  });

  it('does not flash the empty state while notes are still loading', async () => {
    let resolveNotes!: (v: PaginatedResponse<Note>) => void;
    mockApiFetch.mockResolvedValueOnce(makeCampaign());
    mockApiFetch.mockImplementationOnce(
      () => new Promise<PaginatedResponse<Note>>(resolve => (resolveNotes = resolve))
    );
    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'The Lost Mines' })).toBeInTheDocument()
    );
    await user.click(screen.getByRole('button', { name: /^notes$/i }));
    // While the request is in flight the "No notes yet." copy must not appear.
    expect(screen.queryByText(/no notes yet/i)).not.toBeInTheDocument();
    expect(screen.getByText(/loading notes/i)).toBeInTheDocument();
    resolveNotes(makeListResponse<Note>([]));
    await waitFor(() => expect(screen.getByText(/no notes yet/i)).toBeInTheDocument());
  });

  it('shows the empty state when the notes tab has no notes', async () => {
    mockApiFetch.mockResolvedValueOnce(makeCampaign());
    mockApiFetch.mockResolvedValueOnce(makeListResponse<Note>([]));
    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'The Lost Mines' })).toBeInTheDocument()
    );
    await user.click(screen.getByRole('button', { name: /^notes$/i }));
    await waitFor(() => expect(screen.getByText(/no notes yet/i)).toBeInTheDocument());
  });

  it('toasts an error when loading notes fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockApiFetch.mockResolvedValueOnce(makeCampaign());
    mockApiFetch.mockRejectedValueOnce(new Error('notes boom'));
    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'The Lost Mines' })).toBeInTheDocument()
    );
    await user.click(screen.getByRole('button', { name: /^notes$/i }));
    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(
        'Failed to load notes',
        expect.objectContaining({ id: 'load-notes' })
      )
    );
    consoleError.mockRestore();
  });

  it('loads encounters when the Encounters tab is selected', async () => {
    mockApiFetch.mockResolvedValueOnce(makeCampaign());
    mockApiFetch.mockResolvedValueOnce(
      makeListResponse([makeEncounter({ id: 'enc-a', name: 'Goblin Ambush', round: 2 })])
    );
    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'The Lost Mines' })).toBeInTheDocument()
    );
    await user.click(screen.getByRole('button', { name: /^encounters$/i }));
    await waitFor(() => expect(screen.getByText('Goblin Ambush')).toBeInTheDocument());
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('/encounters?campaignId=camp-1&page=1')
    );
  });

  it('loads recent NPCs when the NPCs tab is selected and shows a View all link', async () => {
    mockApiFetch.mockResolvedValueOnce(makeCampaign());
    mockApiFetch.mockResolvedValueOnce(
      makeListResponse([makeNpc({ id: 'npc-a', name: 'Old Maelin' })])
    );
    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'The Lost Mines' })).toBeInTheDocument()
    );
    await user.click(screen.getByRole('button', { name: /^npcs$/i }));
    await waitFor(() => expect(screen.getByText('Old Maelin')).toBeInTheDocument());
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('/npcs?campaignId=camp-1&page=1&limit=3')
    );
    expect(screen.getByRole('link', { name: /view all/i })).toHaveAttribute(
      'href',
      '/campaigns/camp-1/npcs'
    );
  });

  describe('invite code (owner)', () => {
    it('renders the existing invite code if present and copies it to the clipboard', async () => {
      const user = userEvent.setup();
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
      });
      mockApiFetch.mockResolvedValue(makeCampaign({ inviteCode: 'ABCD-1234' }));
      renderPage();
      await waitFor(() => expect(screen.getByText('ABCD-1234')).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: /copy/i }));
      expect(writeText).toHaveBeenCalledWith('ABCD-1234');
      expect(mockToastSuccess).toHaveBeenCalledWith('Copied!');
    });

    it('generates a new invite code via POST when the button is clicked', async () => {
      mockApiFetch.mockResolvedValueOnce(makeCampaign({ inviteCode: undefined }));
      mockApiFetch.mockResolvedValueOnce({ inviteCode: 'NEW-CODE' });
      const user = userEvent.setup();
      renderPage();
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /generate invite code/i })).toBeInTheDocument()
      );
      await user.click(screen.getByRole('button', { name: /generate invite code/i }));
      await waitFor(() => expect(screen.getByText('NEW-CODE')).toBeInTheDocument());
      expect(mockApiFetch).toHaveBeenLastCalledWith(
        '/campaigns/camp-1/invite-code',
        expect.objectContaining({ method: 'POST' })
      );
      expect(mockToastSuccess).toHaveBeenCalledWith('Invite code generated!');
    });

    it('toasts an error if invite-code generation fails', async () => {
      mockApiFetch.mockResolvedValueOnce(makeCampaign({ inviteCode: undefined }));
      mockApiFetch.mockRejectedValueOnce(new Error('rate limited'));
      const user = userEvent.setup();
      renderPage();
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /generate invite code/i })).toBeInTheDocument()
      );
      await user.click(screen.getByRole('button', { name: /generate invite code/i }));
      await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('rate limited'));
    });

    it('revokes the invite code via DELETE and shows the Generate button again on success', async () => {
      mockApiFetch.mockResolvedValueOnce(makeCampaign({ inviteCode: 'ABCD-1234' }));
      mockApiFetch.mockResolvedValueOnce(undefined);
      const user = userEvent.setup();
      renderPage();
      await waitFor(() => expect(screen.getByText('ABCD-1234')).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: /revoke/i }));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /generate invite code/i })).toBeInTheDocument()
      );
      expect(mockApiFetch).toHaveBeenLastCalledWith(
        '/campaigns/camp-1/invite-code',
        expect.objectContaining({ method: 'DELETE' })
      );
      expect(mockToastSuccess).toHaveBeenCalledWith('Invite code revoked');
    });

    it('toasts an error if revoke fails and keeps the existing code visible', async () => {
      mockApiFetch.mockResolvedValueOnce(makeCampaign({ inviteCode: 'STAY-PUT' }));
      mockApiFetch.mockRejectedValueOnce(new Error('server down'));
      const user = userEvent.setup();
      renderPage();
      await waitFor(() => expect(screen.getByText('STAY-PUT')).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: /revoke/i }));
      await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('server down'));
      expect(screen.getByText('STAY-PUT')).toBeInTheDocument();
    });
  });

  it('hides the invite-code panel for non-owners', async () => {
    mockApiFetch.mockResolvedValue(makeCampaign({ ownerId: 'other' }));
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'The Lost Mines' })).toBeInTheDocument()
    );
    expect(screen.queryByText(/invite code/i)).not.toBeInTheDocument();
  });

  it('hides the session line when currentSession is undefined', async () => {
    mockApiFetch.mockResolvedValue(makeCampaign({ currentSession: undefined }));
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'The Lost Mines' })).toBeInTheDocument()
    );
    expect(screen.queryByText(/^session /i)).not.toBeInTheDocument();
  });

  describe('encounter delete (VEG-291)', () => {
    // Path-routing mock: the encounters list is read from a mutable closure, so a
    // DELETE followed by react-query's cache invalidation re-reads the shrunken
    // list — no brittle call-order sequencing.
    function routeCampaign(opts: {
      campaign?: Campaign;
      encounters: Encounter[];
      onDelete?: (id: string) => Promise<unknown>;
    }) {
      const campaign = opts.campaign ?? makeCampaign();
      let rows = opts.encounters;
      mockApiFetch.mockImplementation(
        (path: string, init?: { method?: string }): Promise<unknown> => {
          if (path.startsWith('/campaigns/camp-1') && init?.method === undefined) {
            return Promise.resolve(campaign);
          }
          if (path.startsWith('/encounters/') && init?.method === 'DELETE') {
            const id = path.split('/')[2];
            if (opts.onDelete) return opts.onDelete(id);
            rows = rows.filter(e => e.id !== id);
            return Promise.resolve(undefined);
          }
          if (path.startsWith('/encounters?campaignId=camp-1')) {
            const params = new URLSearchParams(path.split('?')[1]);
            const page = Number(params.get('page') ?? '1');
            const limit = Number(params.get('limit') ?? '20');
            const total = rows.length;
            const lastPage = Math.max(1, Math.ceil(total / limit));
            const data = rows.slice((page - 1) * limit, page * limit);
            return Promise.resolve({ data, total, page, lastPage, limit });
          }
          return Promise.resolve(makeListResponse([]));
        }
      );
    }

    async function openEncountersTab(user: ReturnType<typeof userEvent.setup>) {
      renderPage();
      await waitFor(() =>
        expect(screen.getByRole('heading', { name: 'The Lost Mines' })).toBeInTheDocument()
      );
      await user.click(screen.getByRole('button', { name: /^encounters$/i }));
      await waitFor(() => expect(screen.getByText('Goblin Ambush')).toBeInTheDocument());
    }

    it('shows a delete button per encounter for the campaign owner', async () => {
      const user = userEvent.setup();
      routeCampaign({ encounters: [makeEncounter({ id: 'enc-a', name: 'Goblin Ambush' })] });
      await openEncountersTab(user);
      expect(screen.getByRole('button', { name: /delete goblin ambush/i })).toBeInTheDocument();
    });

    it('hides the delete button for non-owners', async () => {
      const user = userEvent.setup();
      routeCampaign({
        campaign: makeCampaign({ ownerId: 'someone-else' }),
        encounters: [makeEncounter({ id: 'enc-a', name: 'Goblin Ambush' })],
      });
      await openEncountersTab(user);
      expect(
        screen.queryByRole('button', { name: /delete goblin ambush/i })
      ).not.toBeInTheDocument();
    });

    it('confirming sends DELETE with the right id, re-syncs the list, and toasts success', async () => {
      const user = userEvent.setup();
      routeCampaign({ encounters: [makeEncounter({ id: 'enc-a', name: 'Goblin Ambush' })] });
      await openEncountersTab(user);
      await user.click(screen.getByRole('button', { name: /delete goblin ambush/i }));
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveTextContent(/delete encounter/i);
      await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
      await waitFor(() => expect(screen.queryByText('Goblin Ambush')).not.toBeInTheDocument());
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/encounters/enc-a',
        expect.objectContaining({ method: 'DELETE' })
      );
      // The list is re-synced from the server (refetched), not patched locally.
      const encounterListCalls = mockApiFetch.mock.calls.filter(
        c => typeof c[0] === 'string' && c[0].startsWith('/encounters?campaignId=camp-1')
      );
      expect(encounterListCalls.length).toBeGreaterThanOrEqual(2);
      expect(mockToastSuccess).toHaveBeenCalledWith('Encounter deleted');
    });

    it('deleting the last row of a later page clamps back to the previous page', async () => {
      const user = userEvent.setup();
      const rows = Array.from({ length: 21 }, (_, i) =>
        makeEncounter({ id: `enc-${i}`, name: `Encounter ${i}` })
      );
      routeCampaign({ encounters: rows });
      renderPage();
      await waitFor(() =>
        expect(screen.getByRole('heading', { name: 'The Lost Mines' })).toBeInTheDocument()
      );
      await user.click(screen.getByRole('button', { name: /^encounters$/i }));
      await waitFor(() => expect(screen.getByText('Encounter 0')).toBeInTheDocument());

      await user.click(screen.getByRole('button', { name: 'Next' }));
      await waitFor(() => expect(screen.getByText('Encounter 20')).toBeInTheDocument());

      await user.click(screen.getByRole('button', { name: /delete encounter 20/i }));
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));

      // 20 rows remain → page 2 no longer exists → clamp to page 1.
      await waitFor(() =>
        expect(
          mockApiFetch.mock.calls.filter(
            c => typeof c[0] === 'string' && c[0].includes('/encounters?campaignId=camp-1&page=1')
          ).length
        ).toBeGreaterThanOrEqual(2)
      );
      await waitFor(() => expect(screen.getByText('Encounter 0')).toBeInTheDocument());
    });

    it('re-clamps to the server lastPage when a fetched page comes back empty', async () => {
      const user = userEvent.setup();
      // 21 rows so page 2 exists, then another DM "deletes" down to 20 between
      // our page-1 view and the page-2 fetch.
      const rows = Array.from({ length: 21 }, (_, i) =>
        makeEncounter({ id: `enc-${i}`, name: `Encounter ${i}` })
      );
      let dropped = false;
      mockApiFetch.mockImplementation((path: string): Promise<unknown> => {
        if (path.startsWith('/campaigns/camp-1')) return Promise.resolve(makeCampaign());
        if (path.startsWith('/encounters?campaignId=camp-1')) {
          const params = new URLSearchParams(path.split('?')[1]);
          const page = Number(params.get('page') ?? '1');
          const live = dropped ? rows.slice(0, 20) : rows;
          const total = live.length;
          const lastPage = Math.max(1, Math.ceil(total / 20));
          // Simulate the concurrent shrink the first time page 2 is requested.
          if (page === 2 && !dropped) {
            dropped = true;
            return Promise.resolve({ data: [], total: 20, page: 2, lastPage: 1, limit: 20 });
          }
          return Promise.resolve({
            data: live.slice((page - 1) * 20, page * 20),
            total,
            page,
            lastPage,
            limit: 20,
          });
        }
        return Promise.resolve(makeListResponse([]));
      });
      renderPage();
      await waitFor(() =>
        expect(screen.getByRole('heading', { name: 'The Lost Mines' })).toBeInTheDocument()
      );
      await user.click(screen.getByRole('button', { name: /^encounters$/i }));
      await waitFor(() => expect(screen.getByText('Encounter 0')).toBeInTheDocument());

      await user.click(screen.getByRole('button', { name: 'Next' }));
      await waitFor(() =>
        expect(mockApiFetch).toHaveBeenLastCalledWith(
          expect.stringContaining('/encounters?campaignId=camp-1&page=1')
        )
      );
      await waitFor(() => expect(screen.getByText('Encounter 0')).toBeInTheDocument());
    });

    it('disables the delete button while the DELETE is in flight', async () => {
      const user = userEvent.setup();
      routeCampaign({
        encounters: [makeEncounter({ id: 'enc-a', name: 'Goblin Ambush' })],
        onDelete: () => new Promise(() => {}), // never resolves
      });
      await openEncountersTab(user);
      await user.click(screen.getByRole('button', { name: /delete goblin ambush/i }));
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
      expect(screen.getByRole('button', { name: /delete goblin ambush/i })).toBeDisabled();
    });

    it('moves focus to the Encounters heading after a successful delete', async () => {
      const user = userEvent.setup();
      routeCampaign({ encounters: [makeEncounter({ id: 'enc-a', name: 'Goblin Ambush' })] });
      await openEncountersTab(user);
      await user.click(screen.getByRole('button', { name: /delete goblin ambush/i }));
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
      await waitFor(() => expect(screen.queryByText('Goblin Ambush')).not.toBeInTheDocument());
      await waitFor(() =>
        expect(screen.getByRole('heading', { name: 'Encounters' })).toHaveFocus()
      );
    });

    it('cancelling closes the dialog without calling DELETE and keeps the row', async () => {
      const user = userEvent.setup();
      routeCampaign({ encounters: [makeEncounter({ id: 'enc-a', name: 'Goblin Ambush' })] });
      await openEncountersTab(user);
      const deleteCallsBefore = mockApiFetch.mock.calls.filter(
        c => (c[1] as { method?: string } | undefined)?.method === 'DELETE'
      ).length;
      await user.click(screen.getByRole('button', { name: /delete goblin ambush/i }));
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      const deleteCallsAfter = mockApiFetch.mock.calls.filter(
        c => (c[1] as { method?: string } | undefined)?.method === 'DELETE'
      ).length;
      expect(deleteCallsAfter).toBe(deleteCallsBefore);
      expect(screen.getByText('Goblin Ambush')).toBeInTheDocument();
    });

    it('toasts the error message when DELETE rejects with an Error and keeps the row', async () => {
      const user = userEvent.setup();
      routeCampaign({
        encounters: [makeEncounter({ id: 'enc-a', name: 'Goblin Ambush' })],
        onDelete: () => Promise.reject(new Error('not yours')),
      });
      await openEncountersTab(user);
      await user.click(screen.getByRole('button', { name: /delete goblin ambush/i }));
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
      await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('not yours'));
      expect(screen.getByText('Goblin Ambush')).toBeInTheDocument();
    });

    it('toasts a generic message when DELETE rejects with a non-Error', async () => {
      const user = userEvent.setup();
      routeCampaign({
        encounters: [makeEncounter({ id: 'enc-a', name: 'Goblin Ambush' })],
        onDelete: () => Promise.reject('boom'),
      });
      await openEncountersTab(user);
      await user.click(screen.getByRole('button', { name: /delete goblin ambush/i }));
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
      await waitFor(() =>
        expect(mockToastError).toHaveBeenCalledWith('Failed to delete encounter')
      );
      expect(screen.getByText('Goblin Ambush')).toBeInTheDocument();
    });
  });

  it('uses singular "player" wording when there is exactly one player', async () => {
    mockApiFetch.mockResolvedValue(makeCampaign({ playerIds: ['only-one'] }));
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'The Lost Mines' })).toBeInTheDocument()
    );
    expect(screen.getByText('1 player')).toBeInTheDocument();
  });
});
