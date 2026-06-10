import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NpcRelationsPanel from '../NpcRelationsPanel';
import type { Npc, NpcRelation, PaginatedResponse } from '@/lib/types';

const mockApiFetch = vi.fn();
const mockPush = vi.fn();
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, back: vi.fn() }),
}));
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

function makeRelation(over: Partial<NpcRelation> = {}): NpcRelation {
  return {
    id: 'rel-1',
    fromNpcId: 'npc-1',
    toNpcId: 'npc-2',
    relation: 'parent',
    notes: null,
    toNpc: { id: 'npc-2', name: 'Aria Stormwind', race: 'Human' },
    fromNpc: { id: 'npc-1', name: 'Old Maelin', race: 'Human' },
    ...over,
  };
}

function makeNpc(over: Partial<Npc> = {}): Npc {
  return {
    id: 'npc-1',
    campaignId: 'campaign-1',
    createdById: 'user-1',
    name: 'Old Maelin',
    race: 'Human',
    background: 'Sage',
    profession: 'Innkeeper',
    alignment: 'Neutral Good',
    size: 'Medium',
    age: 64,
    gender: 'male',
    appearance: '',
    personalityTraits: [],
    ideals: [],
    bonds: [],
    flaws: [],
    statBlock: null,
    goldPieces: 0,
    silverPieces: 0,
    copperPieces: 0,
    loot: [],
    lootOverrides: null,
    generationParams: null,
    lockedFields: [],
    isManual: false,
    outgoingLinks: [],
    incomingLinks: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockPush.mockReset();
});

describe('NpcRelationsPanel', () => {
  it('shows empty state when no relations exist', () => {
    render(<NpcRelationsPanel npc={makeNpc()} onRefetch={() => {}} />);
    expect(screen.getByText(/no relations yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add existing npc/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /generate related npc/i })).toBeInTheDocument();
  });

  it('lists outgoing relations with the related NPC name and race', () => {
    const rel = makeRelation({
      relation: 'parent',
      toNpc: { id: 'npc-2', name: 'Aria Stormwind', race: 'Elf' },
    });
    render(<NpcRelationsPanel npc={makeNpc({ outgoingLinks: [rel] })} onRefetch={() => {}} />);
    expect(screen.getByText(/parent/i)).toBeInTheDocument();
    expect(screen.getByText(/aria stormwind/i)).toBeInTheDocument();
    expect(screen.getByText(/elf/i)).toBeInTheDocument();
  });

  it('removes a relation when delete is confirmed (DELETE + onRefetch)', async () => {
    const user = userEvent.setup();
    const onRefetch = vi.fn();
    mockApiFetch.mockResolvedValueOnce(undefined);

    const rel = makeRelation({ id: 'rel-99' });
    render(<NpcRelationsPanel npc={makeNpc({ outgoingLinks: [rel] })} onRefetch={onRefetch} />);

    await user.click(screen.getByRole('button', { name: /remove relation/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/"parent" relation to aria stormwind/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /^remove$/i }));
    await waitFor(() => expect(onRefetch).toHaveBeenCalled());
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/npcs/npc-1/relations/rel-99',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('skips delete when the confirmation dialog is cancelled', async () => {
    const user = userEvent.setup();
    const rel = makeRelation();
    render(<NpcRelationsPanel npc={makeNpc({ outgoingLinks: [rel] })} onRefetch={() => {}} />);
    await user.click(screen.getByRole('button', { name: /remove relation/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('Add Existing flow: searches, picks a result, POSTs the relation, calls onRefetch', async () => {
    const user = userEvent.setup();
    const onRefetch = vi.fn();
    const candidateList: PaginatedResponse<Npc> = {
      data: [
        makeNpc({ id: 'npc-2', name: 'Bren Stormwind' }),
        makeNpc({ id: 'npc-3', name: 'Aria Stormwind' }),
      ],
      total: 2,
      page: 1,
      lastPage: 1,
    };
    mockApiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (typeof path === 'string' && path.startsWith('/npcs?')) {
        return Promise.resolve(candidateList);
      }
      if (path === '/npcs/npc-1/relations' && init?.method === 'POST') {
        return Promise.resolve({ id: 'rel-new' });
      }
      return Promise.resolve(undefined);
    });

    render(<NpcRelationsPanel npc={makeNpc()} onRefetch={onRefetch} />);

    await user.click(screen.getByRole('button', { name: /add existing npc/i }));
    await user.selectOptions(screen.getByLabelText(/relation type/i), 'parent');

    const searchBox = screen.getByPlaceholderText(/search npcs/i);
    await user.type(searchBox, 'Bren');

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.stringContaining('/npcs?campaignId=campaign-1')
      )
    );

    await user.click(await screen.findByRole('button', { name: /bren stormwind/i }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenLastCalledWith(
        '/npcs/npc-1/relations',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ toNpcId: 'npc-2', relation: 'parent' }),
        })
      )
    );
    expect(onRefetch).toHaveBeenCalled();
  });

  it('Add Existing search sends the term to the API instead of filtering client-side (VEG-313)', async () => {
    const user = userEvent.setup();
    // The server matches on more than a client substring could (e.g. paginated
    // rows beyond page 1) — render whatever it returns, even names that don't
    // contain the typed term.
    const candidateList: PaginatedResponse<Npc> = {
      data: [makeNpc({ id: 'npc-42', name: 'Karis the Grey' })],
      total: 1,
      page: 1,
      lastPage: 1,
    };
    mockApiFetch.mockImplementation((path: string) => {
      if (typeof path === 'string' && path.startsWith('/npcs?')) {
        return Promise.resolve(candidateList);
      }
      return Promise.resolve(undefined);
    });

    render(<NpcRelationsPanel npc={makeNpc()} onRefetch={() => {}} />);
    await user.click(screen.getByRole('button', { name: /add existing npc/i }));
    await user.type(screen.getByPlaceholderText(/search npcs/i), 'shadow cloak');

    // The query string carries the (encoded) search term.
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(expect.stringContaining('search=shadow%20cloak'))
    );
    expect(mockApiFetch).toHaveBeenCalledWith(expect.stringContaining('campaignId=campaign-1'));
    // Server-side matches render even without a client-side substring hit.
    expect(await screen.findByRole('button', { name: /karis the grey/i })).toBeInTheDocument();
  });

  it('hints to refine the search when more matches exist than the page shows', async () => {
    const user = userEvent.setup();
    const page1: PaginatedResponse<Npc> = {
      data: Array.from({ length: 10 }, (_, i) =>
        makeNpc({ id: `npc-t${i}`, name: `Townsfolk ${i}` })
      ),
      total: 23,
      page: 1,
      lastPage: 3,
    };
    mockApiFetch.mockResolvedValue(page1);

    render(<NpcRelationsPanel npc={makeNpc()} onRefetch={() => {}} />);
    await user.click(screen.getByRole('button', { name: /add existing npc/i }));
    await user.type(screen.getByPlaceholderText(/search npcs/i), 'townsfolk');

    await screen.findByRole('button', { name: /townsfolk 0/i });
    expect(screen.getByText(/showing 10 of 23/i)).toBeInTheDocument();
  });

  it('shows no refine hint when every match fits on the page', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue({
      data: [makeNpc({ id: 'npc-2', name: 'Bren Stormwind' })],
      total: 1,
      page: 1,
      lastPage: 1,
    });

    render(<NpcRelationsPanel npc={makeNpc()} onRefetch={() => {}} />);
    await user.click(screen.getByRole('button', { name: /add existing npc/i }));
    await user.type(screen.getByPlaceholderText(/search npcs/i), 'bren');

    await screen.findByRole('button', { name: /bren stormwind/i });
    expect(screen.queryByText(/showing \d+ of \d+/i)).not.toBeInTheDocument();
  });

  it('does not count the excluded self toward the refine hint', async () => {
    const user = userEvent.setup();
    // Self is in the results: 2 fetched / total 2, but only 1 is linkable —
    // everything linkable is shown, so no hint.
    mockApiFetch.mockResolvedValue({
      data: [makeNpc({ id: 'npc-1', name: 'Old Maelin' }), makeNpc({ id: 'npc-2', name: 'Mae' })],
      total: 2,
      page: 1,
      lastPage: 1,
    });

    render(<NpcRelationsPanel npc={makeNpc()} onRefetch={() => {}} />);
    await user.click(screen.getByRole('button', { name: /add existing npc/i }));
    await user.type(screen.getByPlaceholderText(/search npcs/i), 'mae');

    await screen.findByRole('button', { name: /^mae/i });
    expect(screen.queryByText(/showing \d+ of \d+/i)).not.toBeInTheDocument();
  });

  it('Add Existing search debounces keystrokes into a single request', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue({ data: [], total: 0, page: 1, lastPage: 1 });

    render(<NpcRelationsPanel npc={makeNpc()} onRefetch={() => {}} />);
    await user.click(screen.getByRole('button', { name: /add existing npc/i }));
    await user.type(screen.getByPlaceholderText(/search npcs/i), 'Bren');

    // Four keystrokes → one trailing-edge request carrying the final term.
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(expect.stringContaining('search=Bren'))
    );
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });

  it('Add Existing autocomplete excludes the current NPC from results', async () => {
    const user = userEvent.setup();
    // The server can return the NPC being edited; only the client-side
    // exclusion hides "Old Maelin".
    const candidateList: PaginatedResponse<Npc> = {
      data: [
        makeNpc({ id: 'npc-1', name: 'Old Maelin' }), // current — must be filtered
        makeNpc({ id: 'npc-2', name: 'Bram Smith' }),
      ],
      total: 2,
      page: 1,
      lastPage: 1,
    };
    mockApiFetch.mockImplementation((path: string) => {
      if (typeof path === 'string' && path.startsWith('/npcs?')) {
        return Promise.resolve(candidateList);
      }
      return Promise.resolve(undefined);
    });

    render(<NpcRelationsPanel npc={makeNpc()} onRefetch={() => {}} />);

    await user.click(screen.getByRole('button', { name: /add existing npc/i }));
    await user.type(screen.getByPlaceholderText(/search npcs/i), 'm');

    await screen.findByRole('button', { name: /bram smith/i });
    expect(screen.queryByRole('button', { name: /^old maelin$/i })).not.toBeInTheDocument();
  });

  it('Generate Related flow: POSTs to /relations/generate and navigates to the new NPC', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValueOnce({
      id: 'new-npc-id',
      campaignId: 'campaign-1',
      name: 'Bren',
    });

    render(<NpcRelationsPanel npc={makeNpc()} onRefetch={() => {}} />);

    await user.click(screen.getByRole('button', { name: /generate related npc/i }));
    await user.selectOptions(screen.getByLabelText(/relation type/i), 'parent');
    await user.click(screen.getByRole('button', { name: /^generate$/i }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/npcs/npc-1/relations/generate',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ relation: 'parent' }),
        })
      )
    );
    expect(mockPush).toHaveBeenCalledWith('/campaigns/campaign-1/npcs/new-npc-id');
  });
});
