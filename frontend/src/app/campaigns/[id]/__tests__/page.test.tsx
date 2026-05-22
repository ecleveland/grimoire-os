import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    render(<CampaignDetailPage />);
    expect(screen.getByText(/^loading\.\.\./i)).toBeInTheDocument();
  });

  it('shows a not-found message if the campaign request resolves with null/undefined', async () => {
    mockApiFetch.mockRejectedValue(new Error('404'));
    render(<CampaignDetailPage />);
    await waitFor(() => expect(screen.getByText(/campaign not found/i)).toBeInTheDocument());
    expect(mockToastError).toHaveBeenCalledWith('Failed to load campaign');
  });

  it('renders campaign name, status, players, session, description, and setting', async () => {
    mockApiFetch.mockResolvedValue(makeCampaign());
    render(<CampaignDetailPage />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'The Lost Mines' })).toBeInTheDocument()
    );
    // Status appears twice (header badge + overview list); both should say "active"
    expect(screen.getAllByText('active').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('2 players')).toBeInTheDocument();
    expect(screen.getByText(/session 4/i)).toBeInTheDocument();
    expect(screen.getByText('A starter adventure')).toBeInTheDocument();
    expect(screen.getByText(/forgotten realms/i)).toBeInTheDocument();
  });

  it('shows the Edit link only when the current user owns the campaign', async () => {
    mockApiFetch.mockResolvedValue(makeCampaign({ ownerId: 'user-1' }));
    const { unmount } = render(<CampaignDetailPage />);
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
    render(<CampaignDetailPage />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'The Lost Mines' })).toBeInTheDocument()
    );
    expect(screen.queryByRole('link', { name: /edit/i })).not.toBeInTheDocument();
  });

  it('renders the overview tab content by default', async () => {
    mockApiFetch.mockResolvedValue(makeCampaign());
    render(<CampaignDetailPage />);
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
    render(<CampaignDetailPage />);
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

  it('shows the empty state when the notes tab has no notes', async () => {
    mockApiFetch.mockResolvedValueOnce(makeCampaign());
    mockApiFetch.mockResolvedValueOnce(makeListResponse<Note>([]));
    const user = userEvent.setup();
    render(<CampaignDetailPage />);
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
    render(<CampaignDetailPage />);
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
    render(<CampaignDetailPage />);
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
    render(<CampaignDetailPage />);
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
      render(<CampaignDetailPage />);
      await waitFor(() => expect(screen.getByText('ABCD-1234')).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: /copy/i }));
      expect(writeText).toHaveBeenCalledWith('ABCD-1234');
      expect(mockToastSuccess).toHaveBeenCalledWith('Copied!');
    });

    it('generates a new invite code via POST when the button is clicked', async () => {
      mockApiFetch.mockResolvedValueOnce(makeCampaign({ inviteCode: undefined }));
      mockApiFetch.mockResolvedValueOnce({ inviteCode: 'NEW-CODE' });
      const user = userEvent.setup();
      render(<CampaignDetailPage />);
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
      render(<CampaignDetailPage />);
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /generate invite code/i })).toBeInTheDocument()
      );
      await user.click(screen.getByRole('button', { name: /generate invite code/i }));
      await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('rate limited'));
    });
  });

  it('hides the invite-code panel for non-owners', async () => {
    mockApiFetch.mockResolvedValue(makeCampaign({ ownerId: 'other' }));
    render(<CampaignDetailPage />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'The Lost Mines' })).toBeInTheDocument()
    );
    expect(screen.queryByText(/invite code/i)).not.toBeInTheDocument();
  });

  it('hides the session line when currentSession is undefined', async () => {
    mockApiFetch.mockResolvedValue(makeCampaign({ currentSession: undefined }));
    render(<CampaignDetailPage />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'The Lost Mines' })).toBeInTheDocument()
    );
    expect(screen.queryByText(/^session /i)).not.toBeInTheDocument();
  });

  it('uses singular "player" wording when there is exactly one player', async () => {
    mockApiFetch.mockResolvedValue(makeCampaign({ playerIds: ['only-one'] }));
    render(<CampaignDetailPage />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'The Lost Mines' })).toBeInTheDocument()
    );
    expect(screen.getByText('1 player')).toBeInTheDocument();
  });
});
