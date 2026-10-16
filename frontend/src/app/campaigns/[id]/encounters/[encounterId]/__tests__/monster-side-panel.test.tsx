import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithQueryClient } from '@/test-utils/query';
import userEvent from '@testing-library/user-event';
import InitiativeTrackerPage from '../page';
import type { SrdMonster } from '@/lib/types';
import { makeCombatant, makeEncounter, goblinMonster, stubWide } from '@/test-utils/encounter';

const mockApiFetch = vi.fn();
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();
const mockUseAuth = vi.fn();

// Preserve the real module (notably `ApiError`) and only stub `apiFetch`, so
// the page's `err instanceof ApiError` 409 branch resolves against the real class.
vi.mock('@/lib/api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'camp-1', encounterId: 'enc-1' }),
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

beforeEach(() => {
  mockApiFetch.mockReset();
  mockToastError.mockReset();
  mockToastSuccess.mockReset();
  mockUseAuth.mockReturnValue({
    user: { userId: 'user-1', username: 'dm', role: 'dungeon_master' },
    isDm: true,
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('InitiativeTrackerPage', () => {
  // ── Click combatant to view stat block (VEG-260) ─────────────────────────────

  it('opens the source stat block when an NPC combatant with a monsterId is clicked', async () => {
    mockApiFetch.mockImplementation((path: string) => {
      if (path === '/encounters/enc-1') {
        return Promise.resolve(
          makeEncounter({
            combatants: [
              makeCombatant({ name: 'Hero', isNpc: false }),
              makeCombatant({ name: 'Goblin A', monsterId: 'monster-1' }),
            ],
          })
        );
      }
      if (path === '/srd/monsters/monster-1') return Promise.resolve(goblinMonster);
      return Promise.reject(new Error(`unexpected path ${path}`));
    });
    const user = userEvent.setup();
    renderWithQueryClient(<InitiativeTrackerPage />);
    await screen.findByRole('heading', { name: /goblin ambush/i });

    // Linked combatant exposes a clickable affordance; the plain one does not.
    expect(screen.queryByRole('button', { name: /^hero$/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^goblin a$/i }));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/srd/monsters/monster-1'));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(await screen.findByText('Nimble Escape.')).toBeInTheDocument();
  });
  // ── Homebrew monsters in tracker flows (VEG-293) ─────────────────────────────
  // Same code paths as SRD monsters — these pin that a homebrew monster coming
  // back from the (now owner-aware) endpoints flows through lookup, add, and
  // click-to-view, flagged as homebrew in the stat block.

  describe('homebrew monsters in tracker flows', () => {
    const homebrewTroll: SrdMonster = {
      ...goblinMonster,
      id: 'hb-1',
      name: 'Cave Troll',
      armorClass: 14,
      hitPoints: 84,
      contentSource: 'homebrew',
      createdById: 'user-1',
      source: 'Homebrew',
      specialAbilities: [{ name: 'Regeneration', description: 'Regains 10 hp.' }],
    };

    it('resolves a homebrew monster on click-combatant-to-view, flagged as homebrew', async () => {
      mockApiFetch.mockImplementation((path: string) => {
        if (path === '/encounters/enc-1') {
          return Promise.resolve(
            makeEncounter({
              combatants: [makeCombatant({ name: 'Cave Troll 1', monsterId: 'hb-1' })],
            })
          );
        }
        if (path === '/srd/monsters/hb-1') return Promise.resolve(homebrewTroll);
        return Promise.reject(new Error(`unexpected path ${path}`));
      });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      await user.click(screen.getByRole('button', { name: /^cave troll 1$/i }));

      await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/srd/monsters/hb-1'));
      const statBlock = await screen.findByTestId('monster-stat-block');
      expect(within(statBlock).getByText('Homebrew')).toBeInTheDocument();
      expect(within(statBlock).getByText(/Regeneration/)).toBeInTheDocument();
    });

    it('toasts and closes instead of sticking on "Loading monster…" when the monster is not visible to the viewer', async () => {
      mockApiFetch.mockImplementation((path: string) => {
        if (path === '/encounters/enc-1') {
          return Promise.resolve(
            makeEncounter({
              combatants: [makeCombatant({ name: 'Cave Troll 1', monsterId: 'hb-1' })],
            })
          );
        }
        // A player clicking the DM's homebrew-linked combatant: the detail
        // endpoint resolves 200 null because the row isn't theirs.
        if (path === '/srd/monsters/hb-1') return Promise.resolve(null);
        return Promise.reject(new Error(`unexpected path ${path}`));
      });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      await user.click(screen.getByRole('button', { name: /^cave troll 1$/i }));

      await waitFor(() => expect(mockToastError).toHaveBeenCalled());
      expect(screen.queryByText(/loading monster/i)).not.toBeInTheDocument();
      expect(screen.queryByTestId('monster-stat-block')).not.toBeInTheDocument();
    });
  });
});

// ── Live-combat layout: sticky turn bar + auto-following stat panel (VEG-384) ──
// jsdom has no matchMedia, so the page's useMediaQuery defaults to "narrow"
// (modal viewer, single column). `stubWide` opts a test into the wide layout
// where the right-hand stat panel is live; afterEach removes it so the default
// narrow behaviour the rest of the suite relies on is restored.
describe('live-combat layout (VEG-384)', () => {
  afterEach(() => {
    delete (window as unknown as { matchMedia?: unknown }).matchMedia;
    delete (Element.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('shows an inline turn header on the active card with the round and whose turn it is', async () => {
    mockApiFetch.mockResolvedValue(makeEncounter({ currentTurn: 0, round: 1 }));
    renderWithQueryClient(<InitiativeTrackerPage />);
    await screen.findByRole('heading', { name: /goblin ambush/i });
    expect(screen.getByText(/round 1/i)).toBeInTheDocument();
    // currentTurn 0 → Hero (highest initiative) is up.
    expect(screen.getByText(/hero's turn/i)).toBeInTheDocument();
  });

  it('renders the turn header only on the active card', async () => {
    mockApiFetch.mockResolvedValue(makeEncounter({ currentTurn: 1, round: 1 }));
    renderWithQueryClient(<InitiativeTrackerPage />);
    await screen.findByRole('heading', { name: /goblin ambush/i });
    // currentTurn 1 → Goblin A is up; only its card carries the header.
    expect(screen.getByText(/goblin a's turn/i)).toBeInTheDocument();
    expect(screen.queryByText(/hero's turn/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/'s turn/i)).toHaveLength(1);
  });

  it('moves the inline turn header to the next card after advancing', async () => {
    mockApiFetch.mockResolvedValueOnce(makeEncounter({ currentTurn: 0, round: 1 }));
    mockApiFetch.mockResolvedValueOnce(makeEncounter({ currentTurn: 1, round: 1 }));
    const user = userEvent.setup();
    renderWithQueryClient(<InitiativeTrackerPage />);
    await screen.findByText(/hero's turn/i);
    await user.click(screen.getByRole('button', { name: /next turn/i }));
    expect(await screen.findByText(/goblin a's turn/i)).toBeInTheDocument();
    expect(screen.queryByText(/hero's turn/i)).not.toBeInTheDocument();
  });

  it('auto-scrolls the active card into view when the turn advances', async () => {
    const scrollSpy = vi.fn();
    // jsdom has no scrollIntoView; install a spy to assert the auto-scroll.
    (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = scrollSpy;
    mockApiFetch.mockResolvedValueOnce(makeEncounter({ currentTurn: 0, round: 1 }));
    mockApiFetch.mockResolvedValueOnce(makeEncounter({ currentTurn: 1, round: 1 }));
    const user = userEvent.setup();
    renderWithQueryClient(<InitiativeTrackerPage />);
    await screen.findByText(/hero's turn/i);
    scrollSpy.mockClear(); // ignore anything before the first real advance
    await user.click(screen.getByRole('button', { name: /next turn/i }));
    await screen.findByText(/goblin a's turn/i);
    expect(scrollSpy).toHaveBeenCalled();
  });

  it('does not auto-scroll on initial load', async () => {
    const scrollSpy = vi.fn();
    (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = scrollSpy;
    mockApiFetch.mockResolvedValue(makeEncounter({ currentTurn: 0, round: 1 }));
    renderWithQueryClient(<InitiativeTrackerPage />);
    await screen.findByText(/hero's turn/i);
    expect(scrollSpy).not.toHaveBeenCalled();
  });

  it('auto-follows the active combatant into the right-hand stat panel on wide screens', async () => {
    stubWide(true);
    mockApiFetch.mockImplementation((path: string) => {
      if (path === '/encounters/enc-1') {
        return Promise.resolve(
          makeEncounter({
            currentTurn: 0,
            combatants: [
              makeCombatant({ name: 'Goblin A', initiative: 18, monsterId: 'monster-1' }),
            ],
          })
        );
      }
      if (path === '/srd/monsters/monster-1') return Promise.resolve(goblinMonster);
      return Promise.reject(new Error(`unexpected path ${path}`));
    });
    renderWithQueryClient(<InitiativeTrackerPage />);
    // The stat block appears with no click — it follows whoever is up.
    expect(await screen.findByText('Nimble Escape.')).toBeInTheDocument();
    expect(mockApiFetch).toHaveBeenCalledWith('/srd/monsters/monster-1');
  });

  it('pins a clicked combatant into the panel instead of opening the modal on wide screens', async () => {
    stubWide(true);
    mockApiFetch.mockImplementation((path: string) => {
      if (path === '/encounters/enc-1') {
        return Promise.resolve(
          makeEncounter({
            currentTurn: 0,
            combatants: [
              makeCombatant({ name: 'Hero', initiative: 18, isNpc: false }), // active, no monster
              makeCombatant({ name: 'Goblin A', initiative: 12, monsterId: 'monster-1' }),
            ],
          })
        );
      }
      if (path === '/srd/monsters/monster-1') return Promise.resolve(goblinMonster);
      return Promise.reject(new Error(`unexpected path ${path}`));
    });
    const user = userEvent.setup();
    renderWithQueryClient(<InitiativeTrackerPage />);
    await screen.findByRole('heading', { name: /goblin ambush/i });
    // The active combatant (Hero) has no linked monster → panel prompts instead.
    expect(screen.getByText(/no stat block for hero/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^goblin a$/i }));
    // Loads into the panel, not a modal dialog.
    expect(await screen.findByText('Nimble Escape.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('falls back to a page-header round when there are no combatants', async () => {
    // No active card to host the inline turn header, so the round shows in the
    // page header instead — and is never duplicated when combatants exist.
    mockApiFetch.mockResolvedValue(makeEncounter({ combatants: [], currentTurn: 0, round: 3 }));
    renderWithQueryClient(<InitiativeTrackerPage />);
    await screen.findByRole('heading', { name: /goblin ambush/i });
    expect(screen.getByText(/round 3/i)).toBeInTheDocument();
    expect(screen.queryByText(/'s turn/i)).not.toBeInTheDocument();
  });

  it('keeps turn controls off the card header for non-controllers', async () => {
    mockUseAuth.mockReturnValue({
      user: { userId: 'someone-else', username: 'p', role: 'player' },
      isDm: false,
    });
    mockApiFetch.mockResolvedValue(makeEncounter({ currentTurn: 0 }));
    renderWithQueryClient(<InitiativeTrackerPage />);
    await screen.findByText(/hero's turn/i);
    expect(screen.queryByRole('button', { name: /next turn/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /previous turn/i })).not.toBeInTheDocument();
  });

  it('peeks a card as a quick reference without changing the turn, and returns on demand', async () => {
    stubWide(true);
    mockApiFetch.mockImplementation((path: string) => {
      if (path === '/encounters/enc-1') {
        return Promise.resolve(
          makeEncounter({
            currentTurn: 0,
            combatants: [
              makeCombatant({ name: 'Hero', initiative: 18, isNpc: false }), // active PC
              makeCombatant({ name: 'Goblin A', initiative: 12, monsterId: 'monster-1' }),
            ],
          })
        );
      }
      if (path === '/srd/monsters/monster-1') return Promise.resolve(goblinMonster);
      return Promise.reject(new Error(`unexpected path ${path}`));
    });
    const user = userEvent.setup();
    renderWithQueryClient(<InitiativeTrackerPage />);
    await screen.findByRole('heading', { name: /goblin ambush/i });
    // Active is Hero (a PC) → panel prompts, no quick-reference banner yet.
    expect(screen.queryByText(/quick reference/i)).not.toBeInTheDocument();

    // Peek the goblin's stat block.
    await user.click(screen.getByRole('button', { name: /^goblin a$/i }));
    expect(await screen.findByText('Nimble Escape.')).toBeInTheDocument();
    expect(screen.getByText(/quick reference/i)).toBeInTheDocument();
    expect(screen.getByText(/still hero's turn/i)).toBeInTheDocument();

    // Peeking is view-only: it never wrote a turn change.
    const patchCalls = mockApiFetch.mock.calls.filter(
      ([, init]) => (init as { method?: string } | undefined)?.method === 'PATCH'
    );
    expect(patchCalls).toHaveLength(0);

    // Snap back to the active creature.
    await user.click(screen.getByRole('button', { name: /back to current turn/i }));
    await waitFor(() => expect(screen.queryByText('Nimble Escape.')).not.toBeInTheDocument());
    expect(screen.queryByText(/quick reference/i)).not.toBeInTheDocument();
    expect(screen.getByText(/no stat block for hero/i)).toBeInTheDocument();
  });
});
