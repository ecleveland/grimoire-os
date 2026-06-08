import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InitiativeTrackerPage from '../page';
import type { Encounter, Combatant } from '@/lib/types';

const mockApiFetch = vi.fn();
const mockToastError = vi.fn();
const mockUseAuth = vi.fn();

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'camp-1', encounterId: 'enc-1' }),
}));
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

function makeCombatant(over: Partial<Combatant> = {}): Combatant {
  return {
    name: 'Goblin',
    initiative: 10,
    hp: 7,
    maxHp: 7,
    ac: 13,
    isNpc: true,
    ...over,
  };
}

function makeEncounter(over: Partial<Encounter> = {}): Encounter {
  return {
    id: 'enc-1',
    campaignId: 'camp-1',
    createdBy: 'user-1',
    name: 'Goblin Ambush',
    combatants: [
      makeCombatant({ name: 'Hero', initiative: 18, hp: 24, maxHp: 24, ac: 16, isNpc: false }),
      makeCombatant({ name: 'Goblin A', initiative: 12, hp: 7, maxHp: 7 }),
      makeCombatant({ name: 'Goblin B', initiative: 8, hp: 7, maxHp: 7 }),
    ],
    currentTurn: 0,
    round: 1,
    isActive: false,
    createdAt: '',
    updatedAt: '',
    ...over,
  } as Encounter;
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockToastError.mockReset();
  mockUseAuth.mockReturnValue({
    user: { userId: 'user-1', username: 'dm', role: 'dungeon_master' },
    isDm: true,
  });
});

describe('InitiativeTrackerPage', () => {
  it('shows the loading state before the fetch resolves', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    render(<InitiativeTrackerPage />);
    expect(screen.getByText(/^loading\.\.\./i)).toBeInTheDocument();
  });

  it('shows the not-found state and toasts when the request fails', async () => {
    mockApiFetch.mockRejectedValue(new Error('404'));
    render(<InitiativeTrackerPage />);
    await waitFor(() => expect(screen.getByText(/encounter not found/i)).toBeInTheDocument());
    expect(mockToastError).toHaveBeenCalledWith('Failed to load encounter');
  });

  it('renders the encounter header, round, and combatants sorted by initiative descending', async () => {
    mockApiFetch.mockResolvedValue(makeEncounter());
    render(<InitiativeTrackerPage />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /goblin ambush/i })).toBeInTheDocument()
    );
    expect(screen.getByText('Inactive')).toBeInTheDocument();
    expect(screen.getByText(/round 1/i)).toBeInTheDocument();

    // Order check: combatants render top-down sorted by initiative DESC.
    const names = screen.getAllByText(/^(Hero|Goblin A|Goblin B)$/).map(n => n.textContent);
    expect(names).toEqual(['Hero', 'Goblin A', 'Goblin B']);

    // NPC badge appears for NPC combatants only
    expect(screen.getAllByText('NPC').length).toBe(2);
  });

  it('hides controller buttons and shows read-only HP for non-controllers', async () => {
    mockUseAuth.mockReturnValue({
      user: { userId: 'someone-else', username: 'p', role: 'player' },
      isDm: false,
    });
    mockApiFetch.mockResolvedValue(makeEncounter());
    render(<InitiativeTrackerPage />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /goblin ambush/i })).toBeInTheDocument()
    );
    expect(screen.queryByRole('button', { name: /start combat/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /next turn/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.getByText('24/24')).toBeInTheDocument();
  });

  it('lets the creator toggle active state via Start/End Combat', async () => {
    mockApiFetch.mockResolvedValueOnce(makeEncounter({ isActive: false }));
    mockApiFetch.mockResolvedValueOnce(makeEncounter({ isActive: true }));
    const user = userEvent.setup();
    render(<InitiativeTrackerPage />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /start combat/i })).toBeInTheDocument()
    );
    await user.click(screen.getByRole('button', { name: /start combat/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /end combat/i })).toBeInTheDocument()
    );
    expect(mockApiFetch).toHaveBeenLastCalledWith(
      '/encounters/enc-1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ isActive: true }),
      })
    );
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('advances to the next turn within the round, then bumps the round number on wrap-around', async () => {
    mockApiFetch.mockResolvedValueOnce(makeEncounter({ currentTurn: 0, round: 1 }));
    mockApiFetch.mockResolvedValueOnce(makeEncounter({ currentTurn: 1, round: 1 }));
    mockApiFetch.mockResolvedValueOnce(makeEncounter({ currentTurn: 2, round: 1 }));
    mockApiFetch.mockResolvedValueOnce(makeEncounter({ currentTurn: 0, round: 2 }));
    const user = userEvent.setup();
    render(<InitiativeTrackerPage />);
    await screen.findByRole('button', { name: /next turn/i });

    await user.click(screen.getByRole('button', { name: /next turn/i }));
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenLastCalledWith(
        '/encounters/enc-1',
        expect.objectContaining({
          body: JSON.stringify({ currentTurn: 1, round: 1 }),
        })
      )
    );

    await user.click(screen.getByRole('button', { name: /next turn/i }));
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenLastCalledWith(
        '/encounters/enc-1',
        expect.objectContaining({
          body: JSON.stringify({ currentTurn: 2, round: 1 }),
        })
      )
    );

    await user.click(screen.getByRole('button', { name: /next turn/i }));
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenLastCalledWith(
        '/encounters/enc-1',
        expect.objectContaining({
          body: JSON.stringify({ currentTurn: 0, round: 2 }),
        })
      )
    );
  });

  it('does not advance turn when every combatant has 0 HP', async () => {
    mockApiFetch.mockResolvedValue(
      makeEncounter({
        combatants: [
          makeCombatant({ name: 'Hero', initiative: 18, hp: 0, maxHp: 24, isNpc: false }),
          makeCombatant({ name: 'Goblin', initiative: 10, hp: 0, maxHp: 7 }),
        ],
      })
    );
    const user = userEvent.setup();
    render(<InitiativeTrackerPage />);
    await screen.findByRole('button', { name: /next turn/i });
    await user.click(screen.getByRole('button', { name: /next turn/i }));
    // Only the initial GET was made — no PATCH.
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });

  it('lets the controller edit a combatant HP and clamps to [0, maxHp]', async () => {
    mockApiFetch.mockResolvedValueOnce(makeEncounter());
    mockApiFetch.mockResolvedValueOnce(makeEncounter());
    render(<InitiativeTrackerPage />);
    await screen.findByRole('button', { name: /next turn/i });

    const hpInputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    // Sorted order: Hero (idx 0), Goblin A (1), Goblin B (2).
    fireEvent.change(hpInputs[1], { target: { value: '99' } });

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
    const [, init] = mockApiFetch.mock.calls[1];
    const body = JSON.parse((init as { body: string }).body);
    expect(body.combatants[1].name).toBe('Goblin A');
    expect(body.combatants[1].hp).toBe(7);
  });

  it('clamps negative HP entries to 0', async () => {
    mockApiFetch.mockResolvedValueOnce(makeEncounter());
    mockApiFetch.mockResolvedValueOnce(makeEncounter());
    render(<InitiativeTrackerPage />);
    await screen.findByRole('button', { name: /next turn/i });

    const hpInputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    fireEvent.change(hpInputs[2], { target: { value: '-5' } });

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
    const [, init] = mockApiFetch.mock.calls[1];
    const body = JSON.parse((init as { body: string }).body);
    expect(body.combatants[2].name).toBe('Goblin B');
    expect(body.combatants[2].hp).toBe(0);
  });

  it('toasts when a PATCH fails', async () => {
    mockApiFetch.mockResolvedValueOnce(makeEncounter());
    mockApiFetch.mockRejectedValueOnce(new Error('conflict'));
    const user = userEvent.setup();
    render(<InitiativeTrackerPage />);
    await screen.findByRole('button', { name: /next turn/i });
    await user.click(screen.getByRole('button', { name: /next turn/i }));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('conflict'));
  });

  it('toasts a generic message when the PATCH rejection is not an Error', async () => {
    mockApiFetch.mockResolvedValueOnce(makeEncounter());
    mockApiFetch.mockRejectedValueOnce('boom');
    const user = userEvent.setup();
    render(<InitiativeTrackerPage />);
    await screen.findByRole('button', { name: /next turn/i });
    await user.click(screen.getByRole('button', { name: /next turn/i }));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Failed to update encounter'));
  });

  it('renders the monster-lookup panel for anyone viewing the encounter', async () => {
    mockUseAuth.mockReturnValue({
      user: { userId: 'someone-else', username: 'p', role: 'player' },
      isDm: false,
    });
    mockApiFetch.mockResolvedValue(makeEncounter());
    render(<InitiativeTrackerPage />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /goblin ambush/i })).toBeInTheDocument()
    );
    expect(screen.getByText(/monster lookup/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search monsters/i)).toBeInTheDocument();
    // The panel is idle on mount: only the encounter GET ran, no monster search.
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });

  it('shows controller buttons for a non-DM creator', async () => {
    mockUseAuth.mockReturnValue({
      user: { userId: 'user-1', username: 'creator', role: 'player' },
      isDm: false,
    });
    mockApiFetch.mockResolvedValue(makeEncounter({ createdBy: 'user-1' }));
    render(<InitiativeTrackerPage />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /goblin ambush/i })).toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: /next turn/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start combat/i })).toBeInTheDocument();
  });
});
