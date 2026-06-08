import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import MonsterLookupPanel from '../MonsterLookupPanel';
import type { SrdMonster, PaginatedResponse } from '@/lib/types';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockApiFetch = vi.fn();

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

const goblin: SrdMonster = {
  id: 'monster-1',
  name: 'Goblin',
  size: 'Small',
  type: 'Humanoid',
  alignment: 'Neutral Evil',
  armorClass: 15,
  hitPoints: 7,
  speed: '30 ft.',
  str: 8,
  dex: 14,
  con: 10,
  int: 10,
  wis: 8,
  cha: 8,
  damageResistances: [],
  damageImmunities: [],
  damageVulnerabilities: [],
  conditionImmunities: [],
  challengeRating: 0.25,
  actions: [],
  source: 'SRD 5.2.1',
};

const goblinDetail: SrdMonster = {
  ...goblin,
  specialAbilities: [{ name: 'Nimble Escape', description: 'Disengage as a bonus action.' }],
  actions: [{ name: 'Scimitar', description: 'Melee: +4 to hit, 1d6+2 slashing.' }],
};

function makeResponse(
  monsters: SrdMonster[],
  total = monsters.length
): PaginatedResponse<SrdMonster> {
  return { data: monsters, total, page: 1, lastPage: 1 };
}

/** Routes the list (`/srd/monsters?…`) and detail (`/srd/monsters/:id`) endpoints. */
function routeApi(
  list: SrdMonster[] = [goblin],
  detail: (path: string) => Promise<unknown> = () => Promise.resolve(goblinDetail)
) {
  mockApiFetch.mockImplementation((path: string) => {
    if (path.startsWith('/srd/monsters/')) return detail(path);
    return Promise.resolve(makeResponse(list));
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('MonsterLookupPanel', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it('renders the panel heading and a search input without fetching on mount', () => {
    routeApi();
    render(<MonsterLookupPanel />);

    expect(screen.getByText(/monster lookup/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search monsters/i)).toBeInTheDocument();
    // Idle: an empty query must not hit the API.
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('shows a prompt to search while the query is empty', () => {
    routeApi();
    render(<MonsterLookupPanel />);

    expect(screen.getByText(/type to search/i)).toBeInTheDocument();
  });

  it('debounces the search input into a GET /srd/monsters request carrying the query', async () => {
    routeApi();
    const user = userEvent.setup();
    render(<MonsterLookupPanel />);

    await user.type(screen.getByPlaceholderText(/search monsters/i), 'goblin');

    await waitFor(() => {
      const listCall = mockApiFetch.mock.calls.find(
        ([path]) => typeof path === 'string' && path.startsWith('/srd/monsters?')
      );
      expect(listCall).toBeDefined();
      expect(listCall![0]).toContain('q=goblin');
    });
    // Debounce collapses the six keystrokes into a single list request.
    const listCalls = mockApiFetch.mock.calls.filter(
      ([path]) => typeof path === 'string' && path.startsWith('/srd/monsters?')
    );
    expect(listCalls).toHaveLength(1);
  });

  it('renders compact results for a query', async () => {
    routeApi();
    const user = userEvent.setup();
    render(<MonsterLookupPanel />);

    await user.type(screen.getByPlaceholderText(/search monsters/i), 'goblin');

    expect(await screen.findByRole('button', { name: /goblin/i })).toBeInTheDocument();
  });

  it('opens the shared stat block when a result is selected, fetching the detail', async () => {
    routeApi();
    const user = userEvent.setup();
    render(<MonsterLookupPanel />);

    await user.type(screen.getByPlaceholderText(/search monsters/i), 'goblin');
    await user.click(await screen.findByRole('button', { name: /goblin/i }));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/srd/monsters/monster-1');
    });
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(await screen.findByText('Nimble Escape.')).toBeInTheDocument();
  });

  it('closes the stat block on Escape without leaving the dialog mounted', async () => {
    routeApi();
    const user = userEvent.setup();
    render(<MonsterLookupPanel />);

    await user.type(screen.getByPlaceholderText(/search monsters/i), 'goblin');
    await user.click(await screen.findByRole('button', { name: /goblin/i }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('shows a no-results state when the query matches nothing', async () => {
    routeApi([]);
    const user = userEvent.setup();
    render(<MonsterLookupPanel />);

    await user.type(screen.getByPlaceholderText(/search monsters/i), 'zzzz');

    expect(await screen.findByText(/no monsters found/i)).toBeInTheDocument();
  });

  it('toasts and opens no dialog when the detail fetch fails', async () => {
    vi.mocked(toast.error).mockClear();
    routeApi([goblin], () => Promise.reject(new Error('boom')));
    const user = userEvent.setup();
    render(<MonsterLookupPanel />);

    await user.type(screen.getByPlaceholderText(/search monsters/i), 'goblin');
    await user.click(await screen.findByRole('button', { name: /goblin/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('toasts when the search request fails', async () => {
    vi.mocked(toast.error).mockClear();
    mockApiFetch.mockRejectedValue(new Error('search boom'));
    const user = userEvent.setup();
    render(<MonsterLookupPanel />);

    await user.type(screen.getByPlaceholderText(/search monsters/i), 'goblin');

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });
});
