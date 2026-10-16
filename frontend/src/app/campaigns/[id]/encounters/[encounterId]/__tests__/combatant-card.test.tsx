import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithQueryClient } from '@/test-utils/query';
import userEvent from '@testing-library/user-event';
import InitiativeTrackerPage from '../page';
import { ApiError } from '@/lib/api';
import type { Encounter, Combatant } from '@/lib/types';
import {
  makeCombatant,
  makeEncounter,
  routeAddFlow as routeAddFlowFor,
  routeHpControls as routeHpControlsFor,
} from '@/test-utils/encounter';

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

const routeAddFlow = (opts: Parameters<typeof routeAddFlowFor>[1]) =>
  routeAddFlowFor(mockApiFetch, opts);
const routeHpControls = (opts: Parameters<typeof routeHpControlsFor>[1]) =>
  routeHpControlsFor(mockApiFetch, opts);

describe('InitiativeTrackerPage', () => {
  describe('combatant notes (VEG-289)', () => {
    function patchBody() {
      const call = mockApiFetch.mock.calls.find(
        ([p, o]) =>
          p === '/encounters/enc-1' && (o as { method?: string } | undefined)?.method === 'PATCH'
      );
      return call ? JSON.parse((call[1] as { body: string }).body) : undefined;
    }

    it('shows a controller an editable notes field pre-filled from the combatant', async () => {
      mockApiFetch.mockResolvedValue(
        makeEncounter({
          combatants: [makeCombatant({ name: 'Spy', notes: 'secretly a doppelganger' })],
        })
      );
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });
      expect(screen.getByLabelText('Notes for Spy')).toHaveValue('secretly a doppelganger');
    });

    it('shows non-controllers the notes read-only (no edit field)', async () => {
      mockUseAuth.mockReturnValue({
        user: { userId: 'someone-else', username: 'p', role: 'player' },
        isDm: false,
      });
      mockApiFetch.mockResolvedValue(
        makeEncounter({
          createdBy: 'user-1',
          combatants: [makeCombatant({ name: 'Spy', notes: 'lair hazard' })],
        })
      );
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });
      expect(screen.getByText(/lair hazard/)).toBeInTheDocument();
      expect(screen.queryByLabelText('Notes for Spy')).not.toBeInTheDocument();
    });

    it('persists an edited note via a version-guarded PATCH', async () => {
      routeAddFlow({
        encounter: makeEncounter({ version: 4, combatants: [makeCombatant({ name: 'Spy' })] }),
      });
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });
      const input = screen.getByLabelText('Notes for Spy');
      fireEvent.change(input, { target: { value: 'bloodied at half HP' } });
      fireEvent.blur(input);
      await waitFor(() => expect(patchBody()).toBeDefined());
      const body = patchBody()!;
      expect(body.expectedVersion).toBe(4);
      expect(body.combatants[0].notes).toBe('bloodied at half HP');
    });

    it('clears the notes key when the field is emptied', async () => {
      routeAddFlow({
        encounter: makeEncounter({
          version: 4,
          combatants: [makeCombatant({ name: 'Spy', notes: 'temp' })],
        }),
      });
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });
      const input = screen.getByLabelText('Notes for Spy');
      fireEvent.change(input, { target: { value: '   ' } });
      fireEvent.blur(input);
      await waitFor(() => expect(patchBody()).toBeDefined());
      expect(patchBody()!.combatants[0]).not.toHaveProperty('notes');
    });
  });
  // ── HP edits commit once, on blur/Enter, version-guarded (VEG-315) ──────────

  it('does not PATCH while typing — only one guarded PATCH on blur, clamped to maxHp', async () => {
    // Goblin A is wounded (5/7) so the clamp to maxHp is a real change.
    const wounded = makeEncounter({
      version: 4,
      combatants: [
        makeCombatant({ name: 'Hero', initiative: 18, hp: 24, maxHp: 24, isNpc: false }),
        makeCombatant({ name: 'Goblin A', initiative: 12, hp: 5, maxHp: 7 }),
        makeCombatant({ name: 'Goblin B', initiative: 8, hp: 7, maxHp: 7 }),
      ],
    });
    mockApiFetch.mockResolvedValueOnce(wounded);
    mockApiFetch.mockResolvedValueOnce(makeEncounter({ version: 5 }));
    renderWithQueryClient(<InitiativeTrackerPage />);
    await screen.findByRole('button', { name: /next turn/i });

    const hpInputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    // Sorted order: Hero (idx 0), Goblin A (1), Goblin B (2).
    // Two change events simulate typing "9" then "99" — neither may fire a PATCH.
    fireEvent.change(hpInputs[1], { target: { value: '9' } });
    fireEvent.change(hpInputs[1], { target: { value: '99' } });
    expect(mockApiFetch).toHaveBeenCalledTimes(1); // initial GET only
    expect(hpInputs[1].value).toBe('99'); // draft shown while editing

    fireEvent.blur(hpInputs[1]);
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
    const [, init] = mockApiFetch.mock.calls[1];
    const body = JSON.parse((init as { body: string }).body);
    expect(body.combatants[1].name).toBe('Goblin A');
    expect(body.combatants[1].hp).toBe(7); // clamped to maxHp
    expect(body.expectedVersion).toBe(4); // optimistic-lock guard
  });

  it('commits the HP edit on Enter, clamping negative entries to 0', async () => {
    mockApiFetch.mockResolvedValueOnce(makeEncounter());
    mockApiFetch.mockResolvedValueOnce(makeEncounter());
    renderWithQueryClient(<InitiativeTrackerPage />);
    await screen.findByRole('button', { name: /next turn/i });

    const hpInputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    // Focus first so the Enter handler's blur() actually dispatches the blur
    // event in jsdom (blur on an unfocused element is a no-op).
    hpInputs[2].focus();
    fireEvent.change(hpInputs[2], { target: { value: '-5' } });
    fireEvent.keyDown(hpInputs[2], { key: 'Enter' });

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
    const [, init] = mockApiFetch.mock.calls[1];
    const body = JSON.parse((init as { body: string }).body);
    expect(body.combatants[2].name).toBe('Goblin B');
    expect(body.combatants[2].hp).toBe(0);
    expect(body.expectedVersion).toBe(1);
  });

  it('skips the PATCH when the committed HP is unchanged', async () => {
    mockApiFetch.mockResolvedValueOnce(makeEncounter());
    renderWithQueryClient(<InitiativeTrackerPage />);
    await screen.findByRole('button', { name: /next turn/i });

    const hpInputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    fireEvent.change(hpInputs[1], { target: { value: '7' } }); // same as current hp
    fireEvent.blur(hpInputs[1]);
    expect(mockApiFetch).toHaveBeenCalledTimes(1); // GET only
  });

  it('floors fractional raw HP edits to whole numbers', async () => {
    mockApiFetch.mockResolvedValueOnce(makeEncounter());
    mockApiFetch.mockResolvedValueOnce(makeEncounter());
    renderWithQueryClient(<InitiativeTrackerPage />);
    await screen.findByRole('button', { name: /next turn/i });

    const hpInputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    fireEvent.change(hpInputs[1], { target: { value: '3.5' } });
    fireEvent.blur(hpInputs[1]);

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
    const [, init] = mockApiFetch.mock.calls[1];
    const body = JSON.parse((init as { body: string }).body);
    expect(body.combatants[1].hp).toBe(3); // never persists fractional HP
  });

  it('reverts to the server value when an empty HP edit is committed', async () => {
    mockApiFetch.mockResolvedValueOnce(makeEncounter());
    renderWithQueryClient(<InitiativeTrackerPage />);
    await screen.findByRole('button', { name: /next turn/i });

    const hpInputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    fireEvent.change(hpInputs[1], { target: { value: '' } });
    fireEvent.blur(hpInputs[1]);
    expect(mockApiFetch).toHaveBeenCalledTimes(1); // no PATCH
    expect((screen.getAllByRole('spinbutton')[1] as HTMLInputElement).value).toBe('7');
  });

  it('commits the draft to the same combatant even when the list reorders mid-edit', async () => {
    const initial = makeEncounter();
    // An Ogre (init 15) lands above Goblin A while the draft is open —
    // Goblin A shifts from sorted index 1 to index 2.
    const reordered = makeEncounter({
      version: 2,
      isActive: true,
      combatants: [
        makeCombatant({ name: 'Hero', initiative: 18, hp: 24, maxHp: 24, isNpc: false }),
        makeCombatant({ name: 'Ogre', initiative: 15, hp: 30, maxHp: 30 }),
        makeCombatant({ name: 'Goblin A', initiative: 12, hp: 7, maxHp: 7 }),
        makeCombatant({ name: 'Goblin B', initiative: 8, hp: 7, maxHp: 7 }),
      ],
    });
    mockApiFetch.mockResolvedValueOnce(initial); // GET
    mockApiFetch.mockResolvedValueOnce(reordered); // PATCH (toggleActive) → reordered list
    mockApiFetch.mockResolvedValueOnce(reordered); // PATCH (hp commit)
    const user = userEvent.setup();
    renderWithQueryClient(<InitiativeTrackerPage />);
    await screen.findByRole('button', { name: /next turn/i });

    // Open a draft on Goblin A (index 1 pre-reorder)...
    fireEvent.change((screen.getAllByRole('spinbutton') as HTMLInputElement[])[1], {
      target: { value: '3' },
    });
    // ...then the encounter updates underneath it (here via Start Combat).
    await user.click(screen.getByRole('button', { name: /start combat/i }));
    await screen.findByText('Active');

    // The draft followed Goblin A to its new row (index 2), not index 1 (Ogre).
    const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    expect(inputs[2].value).toBe('3');
    expect(inputs[1].value).toBe('30');

    fireEvent.blur(inputs[2]);
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(3));
    const [, init] = mockApiFetch.mock.calls[2];
    const body = JSON.parse((init as { body: string }).body);
    const byName = Object.fromEntries((body.combatants as Combatant[]).map(c => [c.name, c.hp]));
    expect(byName['Goblin A']).toBe(3); // the edit landed on the right combatant
    expect(byName['Ogre']).toBe(30); // the interloper is untouched
    expect(body.expectedVersion).toBe(2);
  });

  it('keys a unique "Goblin#1" apart from duplicated Goblins, so a draft stays on its row', async () => {
    // Sorted rows: Goblin (row 0), Goblin (row 1), Goblin#1 (row 2). A key of
    // name#row for duplicates would give the second Goblin the unique
    // combatant's key.
    mockApiFetch.mockResolvedValue(
      makeEncounter({
        combatants: [
          makeCombatant({ name: 'Goblin', initiative: 15 }),
          makeCombatant({ name: 'Goblin', initiative: 12 }),
          makeCombatant({ name: 'Goblin#1', initiative: 8 }),
        ],
      })
    );
    vi.mocked(console.error).mockClear();
    renderWithQueryClient(<InitiativeTrackerPage />);
    await screen.findByRole('heading', { name: /goblin ambush/i });

    const goblins = screen.getAllByRole('spinbutton', { name: /^hp for goblin$/i });
    fireEvent.change(goblins[1], { target: { value: '3' } });

    expect((goblins[0] as HTMLInputElement).value).toBe('7');
    expect((goblins[1] as HTMLInputElement).value).toBe('3');
    expect(
      (screen.getByRole('spinbutton', { name: /^hp for goblin#1$/i }) as HTMLInputElement).value
    ).toBe('7');
    const keyWarnings = vi
      .mocked(console.error)
      .mock.calls.filter(args => args.some(a => String(a).includes('same key')));
    expect(keyWarnings).toEqual([]);
  });

  it('targets the edited row, not the first name match, when combatant names collide', async () => {
    // Duplicate names are legal — nothing unique-ifies hand-entered combatants.
    const twins = makeEncounter({
      combatants: [
        makeCombatant({ name: 'Hero', initiative: 18, hp: 24, maxHp: 24, isNpc: false }),
        makeCombatant({ name: 'Goblin', initiative: 12, hp: 5, maxHp: 7 }),
        makeCombatant({ name: 'Goblin', initiative: 8, hp: 7, maxHp: 7 }),
      ],
    });
    mockApiFetch.mockResolvedValueOnce(twins);
    mockApiFetch.mockResolvedValueOnce(twins);
    renderWithQueryClient(<InitiativeTrackerPage />);
    await screen.findByRole('button', { name: /next turn/i });

    const hpInputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    // Edit the SECOND Goblin (sorted index 2).
    fireEvent.change(hpInputs[2], { target: { value: '2' } });
    // The draft renders only on the edited row, not on its twin.
    expect(hpInputs[2].value).toBe('2');
    expect(hpInputs[1].value).toBe('5');

    fireEvent.blur(hpInputs[2]);
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
    const [, init] = mockApiFetch.mock.calls[1];
    const body = JSON.parse((init as { body: string }).body);
    expect(body.combatants[2].hp).toBe(2); // the edited twin
    expect(body.combatants[1].hp).toBe(5); // the first name match is untouched
  });

  it('refetches and warns on a 409 conflict instead of clobbering', async () => {
    const initial = makeEncounter({ version: 4 });
    let patched = false;
    mockApiFetch.mockImplementation((path: string, init?: { method?: string }) => {
      if (init?.method === 'PATCH') {
        patched = true;
        return Promise.reject(
          new ApiError(409, 'Encounter was modified by another request; re-fetch and retry.', {
            currentVersion: 9,
          })
        );
      }
      return Promise.resolve(initial);
    });
    renderWithQueryClient(<InitiativeTrackerPage />);
    await screen.findByRole('button', { name: /next turn/i });

    const hpInputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    fireEvent.change(hpInputs[1], { target: { value: '3' } });
    fireEvent.blur(hpInputs[1]);

    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    expect(patched).toBe(true);
    const warning = String(mockToastError.mock.calls.at(-1)?.[0] ?? '');
    expect(warning).toMatch(/chang|refresh|again/i);
    // Re-fetched rather than trusting local state: GET on mount + GET after 409.
    const getCalls = mockApiFetch.mock.calls.filter(
      ([p, o]) => p === '/encounters/enc-1' && !(o as { method?: string } | undefined)?.method
    );
    expect(getCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('toasts when a PATCH fails', async () => {
    mockApiFetch.mockResolvedValueOnce(makeEncounter());
    mockApiFetch.mockRejectedValueOnce(new Error('conflict'));
    const user = userEvent.setup();
    renderWithQueryClient(<InitiativeTrackerPage />);
    await screen.findByRole('button', { name: /next turn/i });
    await user.click(screen.getByRole('button', { name: /next turn/i }));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('conflict'));
  });

  it('toasts a generic message when the PATCH rejection is not an Error', async () => {
    mockApiFetch.mockResolvedValueOnce(makeEncounter());
    mockApiFetch.mockRejectedValueOnce('boom');
    const user = userEvent.setup();
    renderWithQueryClient(<InitiativeTrackerPage />);
    await screen.findByRole('button', { name: /next turn/i });
    await user.click(screen.getByRole('button', { name: /next turn/i }));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Failed to update encounter'));
  });
  // ── Damage / heal controls + temporary HP (VEG-286) ──────────────────────────

  describe('damage, heal & temporary HP', () => {
    const amountInput = (name: string) =>
      screen.getByRole('textbox', {
        name: new RegExp(`damage or heal amount for ${name}`, 'i'),
      }) as HTMLInputElement;

    const lastPatchBody = () => {
      const call = mockApiFetch.mock.calls
        .filter(
          ([p, o]) =>
            p === '/encounters/enc-1' && (o as { method?: string } | undefined)?.method === 'PATCH'
        )
        .at(-1);
      expect(call).toBeDefined();
      return JSON.parse((call![1] as { body: string }).body) as {
        combatants: Combatant[];
        expectedVersion: number;
      };
    };

    it('shows the temp HP badge to controllers and non-controllers alike', async () => {
      const enc = makeEncounter({
        combatants: [
          makeCombatant({ name: 'Hero', initiative: 18, hp: 24, maxHp: 24, isNpc: false }),
          makeCombatant({ name: 'Goblin A', initiative: 12, tempHp: 5 }),
        ],
      });
      routeHpControls({ encounter: enc });
      const { unmount } = renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });
      expect(screen.getByText('+5 temp')).toBeInTheDocument();
      unmount();

      mockUseAuth.mockReturnValue({
        user: { userId: 'someone-else', username: 'p', role: 'player' },
        isDm: false,
      });
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });
      expect(screen.getByText('+5 temp')).toBeInTheDocument();
    });

    it('hides the damage/heal controls from non-controllers', async () => {
      mockUseAuth.mockReturnValue({
        user: { userId: 'someone-else', username: 'p', role: 'player' },
        isDm: false,
      });
      routeHpControls({
        encounter: makeEncounter({
          createdBy: 'user-1',
          combatants: [makeCombatant({ name: 'Goblin A', initiative: 12, tempHp: 5 })],
        }),
      });
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });
      expect(screen.queryByRole('button', { name: /damage goblin a/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /heal goblin a/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /grant temp hp/i })).not.toBeInTheDocument();
      expect(
        screen.queryByRole('textbox', { name: /damage or heal amount/i })
      ).not.toBeInTheDocument();
    });

    it('damage spends temp HP first, spills into real HP, and PATCHes the result', async () => {
      const enc = makeEncounter({
        version: 4,
        combatants: [
          makeCombatant({ name: 'Hero', initiative: 18, hp: 24, maxHp: 24, isNpc: false }),
          makeCombatant({ name: 'Goblin A', initiative: 12, hp: 7, maxHp: 7, tempHp: 5 }),
        ],
      });
      routeHpControls({ encounter: enc });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      fireEvent.change(amountInput('Goblin A'), { target: { value: '8' } });
      // Typing alone never PATCHes — the buttons commit.
      expect(
        mockApiFetch.mock.calls.find(
          ([, o]) => (o as { method?: string } | undefined)?.method === 'PATCH'
        )
      ).toBeUndefined();
      await user.click(screen.getByRole('button', { name: /damage goblin a/i }));

      await waitFor(() => {
        const body = lastPatchBody();
        expect(body.expectedVersion).toBe(4);
        expect(body.combatants[1]).toMatchObject({ name: 'Goblin A', hp: 4, tempHp: 0 });
        // The untouched combatant is echoed back unchanged.
        expect(body.combatants[0]).toMatchObject({ name: 'Hero', hp: 24 });
      });
      // The amount draft clears once the write lands.
      await waitFor(() => expect(amountInput('Goblin A').value).toBe(''));
    });

    it('damage that only eats temp HP leaves real HP untouched', async () => {
      routeHpControls({
        encounter: makeEncounter({
          combatants: [makeCombatant({ name: 'Goblin A', initiative: 12, hp: 7, tempHp: 5 })],
        }),
      });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      fireEvent.change(amountInput('Goblin A'), { target: { value: '3' } });
      await user.click(screen.getByRole('button', { name: /damage goblin a/i }));

      await waitFor(() => {
        expect(lastPatchBody().combatants[0]).toMatchObject({ hp: 7, tempHp: 2 });
      });
    });

    it('overkill damage clamps real HP at 0', async () => {
      routeHpControls({
        encounter: makeEncounter({
          combatants: [makeCombatant({ name: 'Goblin A', initiative: 12, hp: 3, tempHp: 2 })],
        }),
      });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      fireEvent.change(amountInput('Goblin A'), { target: { value: '99' } });
      await user.click(screen.getByRole('button', { name: /damage goblin a/i }));

      await waitFor(() => {
        expect(lastPatchBody().combatants[0]).toMatchObject({ hp: 0, tempHp: 0 });
      });
    });

    it('heal clamps to maxHp and never touches temp HP', async () => {
      routeHpControls({
        encounter: makeEncounter({
          combatants: [
            makeCombatant({ name: 'Goblin A', initiative: 12, hp: 5, maxHp: 7, tempHp: 4 }),
          ],
        }),
      });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      fireEvent.change(amountInput('Goblin A'), { target: { value: '10' } });
      await user.click(screen.getByRole('button', { name: /heal goblin a/i }));

      await waitFor(() => {
        expect(lastPatchBody().combatants[0]).toMatchObject({ hp: 7, tempHp: 4 });
      });
    });

    it('a temp HP grant takes the higher value', async () => {
      routeHpControls({
        encounter: makeEncounter({
          combatants: [makeCombatant({ name: 'Goblin A', initiative: 12, hp: 7, tempHp: 5 })],
        }),
      });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      fireEvent.change(amountInput('Goblin A'), { target: { value: '8' } });
      await user.click(screen.getByRole('button', { name: /grant temp hp to goblin a/i }));

      await waitFor(() => {
        expect(lastPatchBody().combatants[0]).toMatchObject({ hp: 7, tempHp: 8 });
      });
    });

    it('a lower temp HP grant is a no-op — no PATCH is sent', async () => {
      routeHpControls({
        encounter: makeEncounter({
          combatants: [makeCombatant({ name: 'Goblin A', initiative: 12, hp: 7, tempHp: 5 })],
        }),
      });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      fireEvent.change(amountInput('Goblin A'), { target: { value: '3' } });
      await user.click(screen.getByRole('button', { name: /grant temp hp to goblin a/i }));

      expect(
        mockApiFetch.mock.calls.find(
          ([, o]) => (o as { method?: string } | undefined)?.method === 'PATCH'
        )
      ).toBeUndefined();
      // The draft clears so it's obvious the action was consumed.
      expect(amountInput('Goblin A').value).toBe('');
    });

    it('disables the action buttons until a positive whole number is entered', async () => {
      routeHpControls({
        encounter: makeEncounter({
          combatants: [makeCombatant({ name: 'Goblin A', initiative: 12, hp: 7 })],
        }),
      });
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      const damageBtn = screen.getByRole('button', { name: /damage goblin a/i });
      const healBtn = screen.getByRole('button', { name: /heal goblin a/i });
      const tempBtn = screen.getByRole('button', { name: /grant temp hp to goblin a/i });
      expect(damageBtn).toBeDisabled(); // empty
      expect(healBtn).toBeDisabled();
      expect(tempBtn).toBeDisabled();

      fireEvent.change(amountInput('Goblin A'), { target: { value: '0' } });
      expect(damageBtn).toBeDisabled();
      fireEvent.change(amountInput('Goblin A'), { target: { value: '2.5' } });
      expect(damageBtn).toBeDisabled();
      fireEvent.change(amountInput('Goblin A'), { target: { value: 'abc' } });
      expect(damageBtn).toBeDisabled();

      fireEvent.change(amountInput('Goblin A'), { target: { value: '5' } });
      expect(damageBtn).toBeEnabled();
      expect(healBtn).toBeEnabled();
      expect(tempBtn).toBeEnabled();
    });

    it('targets the edited row, not the first name match, when names collide', async () => {
      // Two goblins named "Goblin": damaging the second (sorted row 2) must
      // not bleed onto its twin at row 1.
      routeHpControls({
        encounter: makeEncounter({
          combatants: [
            makeCombatant({ name: 'Hero', initiative: 18, hp: 24, maxHp: 24, isNpc: false }),
            makeCombatant({ name: 'Goblin', initiative: 12, hp: 5, maxHp: 7 }),
            makeCombatant({ name: 'Goblin', initiative: 8, hp: 7, maxHp: 7 }),
          ],
        }),
      });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      const amounts = screen.getAllByRole('textbox', {
        name: /damage or heal amount for goblin/i,
      }) as HTMLInputElement[];
      fireEvent.change(amounts[1], { target: { value: '4' } });
      // The draft renders only on the edited row.
      expect(amounts[0].value).toBe('');
      await user.click(screen.getAllByRole('button', { name: /^damage goblin$/i })[1]);

      await waitFor(() => {
        const body = lastPatchBody();
        expect(body.combatants[2].hp).toBe(3); // the edited twin
        expect(body.combatants[1].hp).toBe(5); // the first name match is untouched
      });
    });

    it('damage that drops a monster to 0 funnels through auto-roll-on-death', async () => {
      const enc = makeEncounter({
        version: 1,
        combatants: [
          makeCombatant({ name: 'Hero', initiative: 18, hp: 24, maxHp: 24, isNpc: false }),
          makeCombatant({
            name: 'Goblin A',
            initiative: 12,
            hp: 3,
            tempHp: 2,
            monsterId: 'monster-1',
          }),
        ],
      });
      let rollBody: { combatantIndex?: number; expectedVersion?: number } | undefined;
      routeHpControls({
        encounter: enc,
        // PATCH lands at version 5 — the follow-up roll must guard on THAT
        // version, not the stale pre-patch one.
        onPatch: body => Promise.resolve({ ...enc, ...body, version: 5 }),
        onRoll: body => {
          rollBody = body;
          return Promise.resolve({
            encounter: { ...enc, version: 6 },
            lootTotal: null,
          });
        },
      });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      await user.click(screen.getByRole('checkbox', { name: /auto-roll loot on death/i }));
      fireEvent.change(amountInput('Goblin A'), { target: { value: '5' } });
      await user.click(screen.getByRole('button', { name: /damage goblin a/i }));

      await waitFor(() => {
        expect(rollBody).toEqual({ combatantIndex: 1, expectedVersion: 5 });
      });
    });

    it('damage that leaves real HP above 0 does not auto-roll', async () => {
      const enc = makeEncounter({
        combatants: [
          makeCombatant({
            name: 'Goblin A',
            initiative: 12,
            hp: 7,
            tempHp: 5,
            monsterId: 'monster-1',
          }),
        ],
      });
      routeHpControls({ encounter: enc });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      await user.click(screen.getByRole('checkbox', { name: /auto-roll loot on death/i }));
      fireEvent.change(amountInput('Goblin A'), { target: { value: '5' } }); // eats temp only
      await user.click(screen.getByRole('button', { name: /damage goblin a/i }));

      await waitFor(() => {
        expect(lastPatchBody().combatants[0]).toMatchObject({ hp: 7, tempHp: 0 });
      });
      expect(mockApiFetch.mock.calls.find(([p]) => p === '/encounters/enc-1/loot')).toBeUndefined();
    });

    it('toasts the message when the damage PATCH fails with an Error', async () => {
      routeHpControls({
        encounter: makeEncounter({
          combatants: [makeCombatant({ name: 'Goblin A', initiative: 12, hp: 7 })],
        }),
        onPatch: () => Promise.reject(new Error('save failed')),
      });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      fireEvent.change(amountInput('Goblin A'), { target: { value: '4' } });
      await user.click(screen.getByRole('button', { name: /damage goblin a/i }));
      await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('save failed'));
    });

    it('toasts a generic message when the heal PATCH rejection is not an Error', async () => {
      routeHpControls({
        encounter: makeEncounter({
          combatants: [makeCombatant({ name: 'Goblin A', initiative: 12, hp: 5, maxHp: 7 })],
        }),
        onPatch: () => Promise.reject('boom'),
      });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      fireEvent.change(amountInput('Goblin A'), { target: { value: '2' } });
      await user.click(screen.getByRole('button', { name: /heal goblin a/i }));
      await waitFor(() =>
        expect(mockToastError).toHaveBeenCalledWith('Failed to update encounter')
      );
    });

    it('sends a single PATCH when an action button is double-clicked mid-write', async () => {
      let resolvePatch!: (v: unknown) => void;
      const enc = makeEncounter({
        combatants: [
          makeCombatant({ name: 'Hero', initiative: 18, hp: 24, maxHp: 24, isNpc: false }),
          makeCombatant({ name: 'Goblin A', initiative: 12, hp: 7 }),
        ],
      });
      routeHpControls({
        encounter: enc,
        onPatch: () =>
          new Promise(res => {
            resolvePatch = res;
          }),
      });
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      fireEvent.change(amountInput('Goblin A'), { target: { value: '4' } });
      const damageBtn = screen.getByRole('button', { name: /damage goblin a/i });
      fireEvent.click(damageBtn); // PATCH now pending
      // While the write is in flight every action button is disabled, so the
      // second click is swallowed instead of racing the version guard.
      expect(damageBtn).toBeDisabled();
      expect(screen.getByRole('button', { name: /heal goblin a/i })).toBeDisabled();
      fireEvent.click(damageBtn);
      const patches = mockApiFetch.mock.calls.filter(
        ([, o]) => (o as { method?: string } | undefined)?.method === 'PATCH'
      );
      expect(patches).toHaveLength(1);

      resolvePatch({ ...enc, version: 2 });
      // The draft clears once the write lands.
      await waitFor(() => expect(amountInput('Goblin A').value).toBe(''));
    });
  });
  describe('inline initiative editing & tie reorder (VEG-285)', () => {
    it('renders an initiative input per row for controllers, sorted top-down', async () => {
      routeAddFlow({ encounter: makeEncounter() });
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      const inits = screen.getAllByRole('textbox', {
        name: /^initiative for/i,
      }) as HTMLInputElement[];
      expect(inits.map(i => i.value)).toEqual(['18', '12', '8']);
    });

    it('hides the initiative input and reorder controls from non-controllers', async () => {
      mockUseAuth.mockReturnValue({
        user: { userId: 'someone-else', username: 'p', role: 'player' },
        isDm: false,
      });
      // A tie pair, so reorder buttons WOULD render for a controller.
      routeAddFlow({
        encounter: makeEncounter({
          combatants: [
            makeCombatant({ name: 'Hero', initiative: 18, hp: 24, maxHp: 24, isNpc: false }),
            makeCombatant({ name: 'Goblin A', initiative: 12 }),
            makeCombatant({ name: 'Goblin B', initiative: 12 }),
          ],
        }),
      });
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      expect(screen.queryByRole('textbox', { name: /^initiative for/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^move /i })).not.toBeInTheDocument();
      // Initiative still displays as static text.
      expect(screen.getByText('18')).toBeInTheDocument();
    });

    it('does not PATCH while typing — one re-sorted, version-guarded PATCH on blur', async () => {
      routeAddFlow({ encounter: makeEncounter({ version: 4 }) });
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      const init = screen.getByRole('textbox', {
        name: 'Initiative for Goblin B',
      }) as HTMLInputElement;
      fireEvent.change(init, { target: { value: '2' } });
      fireEvent.change(init, { target: { value: '20' } });
      expect(mockApiFetch).toHaveBeenCalledTimes(1); // initial GET only
      expect(init.value).toBe('20'); // draft shown while editing

      fireEvent.blur(init);
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
      const [, reqInit] = mockApiFetch.mock.calls[1];
      const body = JSON.parse((reqInit as { body: string }).body);
      // Goblin B (20) now sorts above Hero (18); the list persists re-sorted.
      expect(body.combatants.map((c: Combatant) => c.name)).toEqual([
        'Goblin B',
        'Hero',
        'Goblin A',
      ]);
      expect(body.combatants[0].initiative).toBe(20);
      // Hero held the turn at sorted index 0 — the pointer follows him to index 1.
      expect(body.currentTurn).toBe(1);
      expect(body.expectedVersion).toBe(4);
    });

    it('commits on Enter and omits currentTurn when the active combatant keeps its row', async () => {
      routeAddFlow({ encounter: makeEncounter() });
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      const init = screen.getByRole('textbox', { name: 'Initiative for Goblin A' });
      // Focus first so the Enter handler's blur() actually dispatches in jsdom.
      init.focus();
      fireEvent.change(init, { target: { value: '1' } });
      fireEvent.keyDown(init, { key: 'Enter' });

      await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
      const [, reqInit] = mockApiFetch.mock.calls[1];
      const body = JSON.parse((reqInit as { body: string }).body);
      expect(body.combatants.map((c: Combatant) => c.name)).toEqual([
        'Hero',
        'Goblin B',
        'Goblin A',
      ]);
      expect(body.combatants[2].initiative).toBe(1);
      // Hero (the active combatant) is still sorted index 0 — no pointer write.
      expect(body.currentTurn).toBeUndefined();
    });

    it('keeps the turn marker on the active combatant when its own initiative moves it', async () => {
      routeAddFlow({ encounter: makeEncounter({ currentTurn: 1 }) }); // Goblin A's turn
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      const init = screen.getByRole('textbox', { name: 'Initiative for Goblin A' });
      init.focus();
      fireEvent.change(init, { target: { value: '30' } });
      fireEvent.keyDown(init, { key: 'Enter' });

      await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
      const [, reqInit] = mockApiFetch.mock.calls[1];
      const body = JSON.parse((reqInit as { body: string }).body);
      expect(body.combatants.map((c: Combatant) => c.name)).toEqual([
        'Goblin A',
        'Hero',
        'Goblin B',
      ]);
      expect(body.currentTurn).toBe(0);

      // The UI re-renders from the PATCH response: rows re-sorted, marker still
      // on Goblin A.
      await waitFor(() => {
        const names = screen.getAllByText(/^(Hero|Goblin A|Goblin B)$/).map(n => n.textContent);
        expect(names).toEqual(['Goblin A', 'Hero', 'Goblin B']);
      });
      expect(screen.getByText('»').closest('div.p-4')).toHaveTextContent('Goblin A');
    });

    it('truncates fractional entries and accepts negative initiative', async () => {
      routeAddFlow({ encounter: makeEncounter() });
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      const init = screen.getByRole('textbox', { name: 'Initiative for Goblin B' });
      fireEvent.change(init, { target: { value: '-2.7' } });
      fireEvent.blur(init);

      await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
      const [, reqInit] = mockApiFetch.mock.calls[1];
      const body = JSON.parse((reqInit as { body: string }).body);
      expect(body.combatants[2].name).toBe('Goblin B');
      expect(body.combatants[2].initiative).toBe(-2);
    });

    it('skips the PATCH when the committed initiative is unchanged, empty, or non-numeric', async () => {
      routeAddFlow({ encounter: makeEncounter() });
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      const init = screen.getByRole('textbox', {
        name: 'Initiative for Goblin B',
      }) as HTMLInputElement;
      fireEvent.change(init, { target: { value: '8' } }); // unchanged
      fireEvent.blur(init);
      fireEvent.change(init, { target: { value: '' } }); // empty
      fireEvent.blur(init);
      fireEvent.change(init, { target: { value: 'abc' } }); // non-numeric
      fireEvent.blur(init);

      expect(mockApiFetch).toHaveBeenCalledTimes(1); // initial GET only
      expect(init.value).toBe('8'); // draft reverted to the server value
    });

    it('a new tie keeps the existing relative order instead of reshuffling', async () => {
      routeAddFlow({ encounter: makeEncounter() });
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      // Hero 18 → 12 ties Goblin A; the stable tiebreak keeps Hero above A.
      const init = screen.getByRole('textbox', { name: 'Initiative for Hero' });
      fireEvent.change(init, { target: { value: '12' } });
      fireEvent.blur(init);

      await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
      const [, reqInit] = mockApiFetch.mock.calls[1];
      const body = JSON.parse((reqInit as { body: string }).body);
      expect(body.combatants.map((c: Combatant) => c.name)).toEqual([
        'Hero',
        'Goblin A',
        'Goblin B',
      ]);
      expect(body.combatants[0].initiative).toBe(12);

      // Once the update lands, the tie pair grows reorder affordances — and
      // only the tie pair.
      await screen.findByRole('button', { name: 'Move Hero down' });
      expect(screen.getByRole('button', { name: 'Move Goblin A up' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Move Hero up' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Move Goblin A down' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Move Goblin B up' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Move Goblin B down' })).not.toBeInTheDocument();
    });

    it('targets the edited row, not the first name match, when names collide', async () => {
      routeAddFlow({
        encounter: makeEncounter({
          combatants: [
            makeCombatant({ name: 'Hero', initiative: 18, hp: 24, maxHp: 24, isNpc: false }),
            makeCombatant({ name: 'Goblin', initiative: 12 }),
            makeCombatant({ name: 'Goblin', initiative: 8 }),
          ],
        }),
      });
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      const inits = screen.getAllByRole('textbox', { name: 'Initiative for Goblin' });
      fireEvent.change(inits[1], { target: { value: '15' } });
      fireEvent.blur(inits[1]);

      await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
      const [, reqInit] = mockApiFetch.mock.calls[1];
      const body = JSON.parse((reqInit as { body: string }).body);
      // The SECOND Goblin (init 8) was edited to 15 and re-sorted between Hero
      // and its twin — the first Goblin keeps its 12.
      expect(body.combatants.map((c: Combatant) => c.initiative)).toEqual([18, 15, 12]);
    });

    it('toasts the message when the initiative PATCH fails', async () => {
      routeAddFlow({
        encounter: makeEncounter(),
        onPatch: () => Promise.reject(new Error('boom')),
      });
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      const init = screen.getByRole('textbox', { name: 'Initiative for Goblin B' });
      fireEvent.change(init, { target: { value: '20' } });
      fireEvent.blur(init);

      await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('boom'));
      expect(mockToastSuccess).not.toHaveBeenCalled();
    });

    it('refetches and warns when the initiative edit hits a 409 conflict', async () => {
      routeAddFlow({
        encounter: makeEncounter(),
        onPatch: () =>
          Promise.reject(
            new ApiError(409, 'Encounter was modified by another request; re-fetch and retry.', {
              statusCode: 409,
            })
          ),
      });
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      const init = screen.getByRole('textbox', { name: 'Initiative for Goblin B' });
      fireEvent.change(init, { target: { value: '20' } });
      fireEvent.blur(init);

      await waitFor(() =>
        expect(mockToastError).toHaveBeenCalledWith(
          'This encounter changed since you opened it — refreshed, please try again.'
        )
      );
      await waitFor(() => {
        const gets = mockApiFetch.mock.calls.filter(
          ([p, o]) => p === '/encounters/enc-1' && !(o as { method?: string } | undefined)?.method
        );
        expect(gets).toHaveLength(2);
      });
    });

    // Four combatants with a tie in the middle — the shared fixture for the
    // reorder tests. Sorted: Hero(18), Goblin A(12), Goblin B(12), Wolf(8).
    const tieEncounter = (over: Partial<Encounter> = {}) =>
      makeEncounter({
        combatants: [
          makeCombatant({ name: 'Hero', initiative: 18, hp: 24, maxHp: 24, isNpc: false }),
          makeCombatant({ name: 'Goblin A', initiative: 12 }),
          makeCombatant({ name: 'Goblin B', initiative: 12 }),
          makeCombatant({ name: 'Wolf', initiative: 8 }),
        ],
        ...over,
      });

    it('offers up/down only inside a tie group', async () => {
      routeAddFlow({ encounter: tieEncounter() });
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      expect(screen.getByRole('button', { name: 'Move Goblin A down' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Move Goblin B up' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Move Goblin A up' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Move Goblin B down' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^move hero/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^move wolf/i })).not.toBeInTheDocument();
    });

    it('swaps a tied pair and keeps the turn marker on the moved combatant', async () => {
      routeAddFlow({ encounter: tieEncounter({ currentTurn: 1, version: 7 }) }); // Goblin A's turn
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      await user.click(screen.getByRole('button', { name: 'Move Goblin A down' }));

      await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
      const [, reqInit] = mockApiFetch.mock.calls[1];
      const body = JSON.parse((reqInit as { body: string }).body);
      expect(body.combatants.map((c: Combatant) => c.name)).toEqual([
        'Hero',
        'Goblin B',
        'Goblin A',
        'Wolf',
      ]);
      expect(body.currentTurn).toBe(2); // pointer follows Goblin A's identity
      expect(body.expectedVersion).toBe(7);

      await waitFor(() =>
        expect(screen.getByText('»').closest('div.p-4')).toHaveTextContent('Goblin A')
      );
    });

    it('moves a combatant up without touching an unaffected turn pointer', async () => {
      routeAddFlow({ encounter: tieEncounter() }); // Hero's turn (index 0)
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      await user.click(screen.getByRole('button', { name: 'Move Goblin B up' }));

      await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
      const [, reqInit] = mockApiFetch.mock.calls[1];
      const body = JSON.parse((reqInit as { body: string }).body);
      expect(body.combatants.map((c: Combatant) => c.name)).toEqual([
        'Hero',
        'Goblin B',
        'Goblin A',
        'Wolf',
      ]);
      expect(body.currentTurn).toBeUndefined(); // Hero stays at sorted index 0
    });

    it('toasts a generic message when the reorder PATCH rejection is not an Error', async () => {
      routeAddFlow({
        encounter: tieEncounter(),
        onPatch: () => Promise.reject('nope'),
      });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      await user.click(screen.getByRole('button', { name: 'Move Goblin A down' }));

      await waitFor(() =>
        expect(mockToastError).toHaveBeenCalledWith('Failed to update encounter')
      );
      expect(mockToastSuccess).not.toHaveBeenCalled();
    });
  });
  // VEG-287: per-combatant conditions, concentration, and exhaustion. A
  // single-combatant encounter keeps row resolution unambiguous.
  describe('conditions / concentration / exhaustion (VEG-287)', () => {
    const soloEncounter = (over: Partial<Combatant> = {}) =>
      makeEncounter({
        combatants: [makeCombatant({ name: 'Goblin', ...over })],
        version: 4,
      });

    // GET returns the encounter; PATCH echoes the new combatants back.
    function route(encounter: Encounter) {
      mockApiFetch.mockImplementation((path: string, init?: { method?: string; body?: string }) => {
        if (path === '/encounters/enc-1' && init?.method === 'PATCH') {
          const body = JSON.parse(init.body ?? '{}');
          return Promise.resolve({ ...encounter, ...body, version: encounter.version + 1 });
        }
        if (path === '/encounters/enc-1') return Promise.resolve(encounter);
        return Promise.reject(new Error(`unexpected path ${path}`));
      });
    }

    const lastPatch = () => {
      const calls = mockApiFetch.mock.calls.filter(
        c => (c[1] as { method?: string } | undefined)?.method === 'PATCH'
      );
      const last = calls[calls.length - 1];
      return last ? JSON.parse((last[1] as { body: string }).body) : undefined;
    };

    it('adds a condition and persists it with expectedVersion', async () => {
      route(soloEncounter());
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      await user.selectOptions(screen.getByLabelText('Add condition to Goblin'), 'Poisoned');

      await waitFor(() => expect(lastPatch()).toBeDefined());
      const body = lastPatch();
      expect(body.combatants[0].conditions).toEqual(['Poisoned']);
      expect(body.expectedVersion).toBe(4);
    });

    it('removes a condition via the chip ×, keeping the others', async () => {
      route(soloEncounter({ conditions: ['Poisoned', 'Prone'] }));
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      await user.click(screen.getByRole('button', { name: 'Remove Poisoned from Goblin' }));

      await waitFor(() => expect(lastPatch()).toBeDefined());
      expect(lastPatch().combatants[0].conditions).toEqual(['Prone']);
    });

    it('drops the conditions key when the last condition is removed', async () => {
      route(soloEncounter({ conditions: ['Stunned'] }));
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      await user.click(screen.getByRole('button', { name: 'Remove Stunned from Goblin' }));

      await waitFor(() => expect(lastPatch()).toBeDefined());
      expect(lastPatch().combatants[0]).not.toHaveProperty('conditions');
    });

    it('toggles concentration on, then names the spell', async () => {
      route(soloEncounter());
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      await user.click(screen.getByRole('button', { name: 'Toggle concentration for Goblin' }));
      await waitFor(() => expect(lastPatch()?.combatants[0].concentration).toEqual({}));

      // The spell input appears once concentrating; commit on blur.
      const spell = await screen.findByLabelText('Concentration spell for Goblin');
      fireEvent.change(spell, { target: { value: 'Bless' } });
      fireEvent.blur(spell);

      await waitFor(() =>
        expect(lastPatch().combatants[0].concentration).toEqual({ spell: 'Bless' })
      );
    });

    it('renders a concentration chip with the spell name', async () => {
      route(soloEncounter({ concentration: { spell: 'Bless' } }));
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });
      expect(screen.getByText('Concentrating: Bless')).toBeInTheDocument();
    });

    it('sets an exhaustion level, then clears it back to none', async () => {
      route(soloEncounter({ exhaustion: 2 }));
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });
      // Scope to the chip span — the <option> labels collide with the chip text.
      expect(screen.getByText('Exhaustion 2', { selector: 'span' })).toBeInTheDocument();

      await user.selectOptions(screen.getByLabelText('Exhaustion for Goblin'), 'Exhaustion 5');
      await waitFor(() => expect(lastPatch()?.combatants[0].exhaustion).toBe(5));

      await user.selectOptions(screen.getByLabelText('Exhaustion for Goblin'), 'Exhaustion: none');
      await waitFor(() => expect(lastPatch().combatants[0]).not.toHaveProperty('exhaustion'));
    });

    it('shows condition chips read-only to non-controllers (no edit controls)', async () => {
      mockUseAuth.mockReturnValue({
        user: { userId: 'someone-else', username: 'p', role: 'player' },
        isDm: false,
      });
      route(soloEncounter({ conditions: ['Poisoned'], concentration: { spell: 'Bless' } }));
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      expect(screen.getByText('Poisoned')).toBeInTheDocument();
      expect(screen.getByText('Concentrating: Bless')).toBeInTheDocument();
      expect(screen.queryByLabelText('Add condition to Goblin')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Remove Poisoned from Goblin' })
      ).not.toBeInTheDocument();
    });
  });
  // VEG-288: death saves for downed PCs.
  describe('death saves (VEG-288)', () => {
    const downedPc = (over: Partial<Combatant> = {}) =>
      makeEncounter({
        combatants: [makeCombatant({ name: 'Hero', isNpc: false, hp: 0, maxHp: 20, ...over })],
        version: 4,
      });

    function route(encounter: Encounter) {
      mockApiFetch.mockImplementation((path: string, init?: { method?: string; body?: string }) => {
        if (path === '/encounters/enc-1' && init?.method === 'PATCH') {
          const body = JSON.parse(init.body ?? '{}');
          return Promise.resolve({ ...encounter, ...body, version: encounter.version + 1 });
        }
        if (path === '/encounters/enc-1') return Promise.resolve(encounter);
        return Promise.reject(new Error(`unexpected path ${path}`));
      });
    }

    const lastPatch = () => {
      const calls = mockApiFetch.mock.calls.filter(
        c => (c[1] as { method?: string } | undefined)?.method === 'PATCH'
      );
      const last = calls[calls.length - 1];
      return last ? JSON.parse((last[1] as { body: string }).body) : undefined;
    };

    it('shows the tracker only for a downed PC', async () => {
      route(downedPc());
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });
      expect(screen.getByText('Death Saves')).toBeInTheDocument();
    });

    it('hides the tracker for an NPC at 0 HP', async () => {
      route(
        makeEncounter({
          combatants: [makeCombatant({ name: 'Goblin', isNpc: true, hp: 0 })],
          version: 4,
        })
      );
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });
      expect(screen.queryByText('Death Saves')).not.toBeInTheDocument();
    });

    it('hides the tracker for a PC above 0 HP', async () => {
      route(downedPc({ hp: 5 }));
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });
      expect(screen.queryByText('Death Saves')).not.toBeInTheDocument();
    });

    it('marks a success and persists it with expectedVersion', async () => {
      route(downedPc());
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      await user.click(screen.getByRole('button', { name: 'Mark death save success for Hero' }));

      await waitFor(() => expect(lastPatch()).toBeDefined());
      expect(lastPatch().combatants[0].deathSaves).toEqual({ successes: 1, failures: 0 });
      expect(lastPatch().expectedVersion).toBe(4);
    });

    it('marks a failure', async () => {
      route(downedPc({ deathSaves: { successes: 1, failures: 1 } }));
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      await user.click(screen.getByRole('button', { name: 'Mark death save failure for Hero' }));

      await waitFor(() => expect(lastPatch()).toBeDefined());
      expect(lastPatch().combatants[0].deathSaves).toEqual({ successes: 1, failures: 2 });
    });

    it('shows Stable at three successes but keeps the mark buttons available', async () => {
      // The DM keeps manual control: a stabilized PC that is hit again must
      // still be markable (the counts stay capped at 3 by the pure helper).
      route(downedPc({ deathSaves: { successes: 3, failures: 0 } }));
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });
      expect(screen.getByText('Stable')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Mark death save failure for Hero' })
      ).toBeEnabled();

      await user.click(screen.getByRole('button', { name: 'Mark death save failure for Hero' }));
      await waitFor(() => expect(lastPatch()).toBeDefined());
      expect(lastPatch().combatants[0].deathSaves).toEqual({ successes: 3, failures: 1 });
    });

    it('shows Dead at three failures', async () => {
      route(downedPc({ deathSaves: { successes: 0, failures: 3 } }));
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });
      expect(screen.getByText('Dead')).toBeInTheDocument();
    });

    it('clears death saves when the PC is healed above 0', async () => {
      route(downedPc({ deathSaves: { successes: 1, failures: 2 } }));
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      fireEvent.change(screen.getByLabelText('Damage or heal amount for Hero'), {
        target: { value: '6' },
      });
      await user.click(screen.getByRole('button', { name: 'Heal Hero' }));

      await waitFor(() => expect(lastPatch()).toBeDefined());
      const combatant = lastPatch().combatants[0];
      expect(combatant.hp).toBe(6);
      expect(combatant).not.toHaveProperty('deathSaves');
    });

    it('resets death saves via the Reset button', async () => {
      route(downedPc({ deathSaves: { successes: 2, failures: 1 } }));
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      await user.click(screen.getByRole('button', { name: 'Reset death saves for Hero' }));

      await waitFor(() => expect(lastPatch()).toBeDefined());
      expect(lastPatch().combatants[0]).not.toHaveProperty('deathSaves');
    });

    it('shows pips read-only to non-controllers (no mark/reset controls)', async () => {
      mockUseAuth.mockReturnValue({
        user: { userId: 'someone-else', username: 'p', role: 'player' },
        isDm: false,
      });
      route(downedPc({ deathSaves: { successes: 1, failures: 0 } }));
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      expect(screen.getByText('Death Saves')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Mark death save success for Hero' })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Reset death saves for Hero' })
      ).not.toBeInTheDocument();
    });
  });
});
