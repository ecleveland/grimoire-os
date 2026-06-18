import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NewEncounterPage from '../page';

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

// The real lookup panel debounces a `/srd/monsters` search and renders its own
// modal — out of scope here. Stub it down to a single button that fires the
// `onAdd` contract the page wires up, so the page's monster-add path (build
// combatants → include monsterId in the POST) is what's under test.
vi.mock('@/components/MonsterLookupPanel', () => ({
  default: ({ onAdd }: { onAdd?: (monster: unknown, result: unknown) => void }) => (
    <button
      type="button"
      onClick={() =>
        onAdd?.(
          {
            id: 'mon-goblin',
            name: 'Goblin',
            armorClass: 15,
            hitPoints: 7,
            dex: 14,
            challengeRating: 0.25,
            experiencePoints: 50,
          },
          { quantity: 2, initiatives: [12, 8] }
        )
      }
    >
      mock-add-monster
    </button>
  ),
}));

const roster = [
  {
    id: 'pc-1',
    userId: 'u1',
    name: 'Aragorn',
    race: 'Human',
    class: 'Ranger',
    level: 5,
    armorClass: 16,
    initiative: 2,
    hitPoints: { current: 40, max: 45, temporary: 0 },
  },
  {
    id: 'pc-2',
    userId: 'u2',
    name: 'Legolas',
    race: 'Elf',
    class: 'Ranger',
    level: 5,
    armorClass: 15,
    initiative: 3,
    hitPoints: { current: 38, max: 38, temporary: 0 },
  },
];

beforeEach(() => {
  mockApiFetch.mockReset();
  mockToastError.mockReset();
  mockToastSuccess.mockReset();
  mockRouterPush.mockReset();
  mockRouterBack.mockReset();
});

function getCombatantCard(index: number) {
  return screen.getByText(`Combatant ${index + 1}`).closest('div.p-4') as HTMLElement;
}

function getCombatantFields(card: HTMLElement) {
  const name = within(card).getByRole('textbox') as HTMLInputElement;
  const [initiative, hp, maxHp, ac] = within(card).getAllByRole('spinbutton') as HTMLInputElement[];
  const npc = within(card).getByRole('checkbox') as HTMLInputElement;
  return { name, initiative, hp, maxHp, ac, npc };
}

async function fillManualRow(
  card: HTMLElement,
  values: { name: string; initiative: string; hp: string; maxHp: string; ac: string; npc?: boolean }
) {
  const user = userEvent.setup();
  const fields = getCombatantFields(card);
  await user.type(fields.name, values.name);
  await user.clear(fields.initiative);
  await user.type(fields.initiative, values.initiative);
  await user.clear(fields.hp);
  await user.type(fields.hp, values.hp);
  await user.clear(fields.maxHp);
  await user.type(fields.maxHp, values.maxHp);
  await user.clear(fields.ac);
  await user.type(fields.ac, values.ac);
  if (values.npc) await user.click(fields.npc);
}

// Resolve the campaign roster fetch + a successful encounter POST.
function mockHappyPath(roster_: unknown = roster) {
  mockApiFetch.mockImplementation((url: string) => {
    if (url === '/campaigns/camp-1/characters') return Promise.resolve(roster_);
    if (url === '/encounters') return Promise.resolve({ id: 'enc-1' });
    return Promise.resolve(null);
  });
}

function getPostBody() {
  const call = mockApiFetch.mock.calls.find(c => c[0] === '/encounters');
  if (!call) throw new Error('POST /encounters was not called');
  return JSON.parse((call[1] as { body: string }).body);
}

describe('NewEncounterPage', () => {
  it('renders one empty combatant by default and hides the Remove button for it', () => {
    render(<NewEncounterPage />);
    expect(screen.getByRole('heading', { name: /create encounter/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/encounter name/i)).toHaveValue('');
    expect(screen.getByText('Combatant 1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^remove$/i })).not.toBeInTheDocument();
  });

  it('adds a combatant row when "Add Combatant" is clicked', async () => {
    const user = userEvent.setup();
    render(<NewEncounterPage />);
    await user.click(screen.getByRole('button', { name: /add combatant/i }));
    expect(screen.getByText('Combatant 1')).toBeInTheDocument();
    expect(screen.getByText('Combatant 2')).toBeInTheDocument();
    // Both rows should now have Remove buttons
    expect(screen.getAllByRole('button', { name: /^remove$/i })).toHaveLength(2);
  });

  it('removes a combatant row when its Remove button is clicked', async () => {
    const user = userEvent.setup();
    render(<NewEncounterPage />);
    await user.click(screen.getByRole('button', { name: /add combatant/i }));
    await user.click(screen.getByRole('button', { name: /add combatant/i }));
    expect(screen.getByText('Combatant 3')).toBeInTheDocument();

    // Remove the middle combatant
    const card2 = getCombatantCard(1);
    await user.click(within(card2).getByRole('button', { name: /^remove$/i }));

    expect(screen.queryByText('Combatant 3')).not.toBeInTheDocument();
    expect(screen.getByText('Combatant 1')).toBeInTheDocument();
    expect(screen.getByText('Combatant 2')).toBeInTheDocument();
  });

  it('submits the encounter with edited combatant fields and navigates to detail', async () => {
    mockApiFetch.mockResolvedValue({ id: 'enc-77' });
    const user = userEvent.setup();
    render(<NewEncounterPage />);

    await user.type(screen.getByLabelText(/encounter name/i), 'Goblin Ambush');
    await fillManualRow(getCombatantCard(0), {
      name: 'Goblin',
      initiative: '15',
      hp: '7',
      maxHp: '7',
      ac: '13',
      npc: true,
    });

    await user.click(screen.getByRole('button', { name: /create encounter/i }));

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Encounter created!'));
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/encounters',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          campaignId: 'camp-1',
          name: 'Goblin Ambush',
          combatants: [{ name: 'Goblin', initiative: 15, hp: 7, maxHp: 7, ac: 13, isNpc: true }],
        }),
      })
    );
    expect(mockRouterPush).toHaveBeenCalledWith('/campaigns/camp-1/encounters/enc-77');
  });

  it('shows the submitting label while in flight and re-enables on error', async () => {
    let reject: (err: unknown) => void = () => {};
    mockApiFetch.mockReturnValue(
      new Promise((_resolve, rej) => {
        reject = rej;
      })
    );
    const user = userEvent.setup();
    render(<NewEncounterPage />);
    await user.type(screen.getByLabelText(/encounter name/i), 'X');
    await user.type(getCombatantFields(getCombatantCard(0)).name, 'C');
    await user.click(screen.getByRole('button', { name: /create encounter/i }));

    const submitting = await screen.findByRole('button', { name: /creating\.\.\./i });
    expect(submitting).toBeDisabled();

    reject(new Error('server down'));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('server down'));
    expect(screen.getByRole('button', { name: /create encounter/i })).toBeEnabled();
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it('toasts a generic message when the rejection is not an Error', async () => {
    mockApiFetch.mockRejectedValue('boom');
    const user = userEvent.setup();
    render(<NewEncounterPage />);
    await user.type(screen.getByLabelText(/encounter name/i), 'X');
    await user.type(getCombatantFields(getCombatantCard(0)).name, 'C');
    await user.click(screen.getByRole('button', { name: /create encounter/i }));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Failed to create encounter'));
  });

  it('calls router.back when the cancel button is clicked', async () => {
    const user = userEvent.setup();
    render(<NewEncounterPage />);
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(mockRouterBack).toHaveBeenCalledTimes(1);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  describe('party + monster pickers', () => {
    it('adds the campaign party as PC combatants via the party picker', async () => {
      mockHappyPath();
      const user = userEvent.setup();
      render(<NewEncounterPage />);

      await user.click(screen.getByRole('button', { name: /add party/i }));

      // Only the campaign's characters appear, fetched from the roster endpoint.
      await waitFor(() => expect(screen.getByLabelText('Add Aragorn')).toBeInTheDocument());
      expect(mockApiFetch).toHaveBeenCalledWith('/campaigns/camp-1/characters');
      expect(screen.getByLabelText('Add Legolas')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /add selected/i }));

      // The picked PCs surface in the create form, ready to submit.
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /remove aragorn/i })).toBeInTheDocument()
      );
      expect(screen.getByRole('button', { name: /remove legolas/i })).toBeInTheDocument();
    });

    it('shows the no-party empty state when the campaign has no characters', async () => {
      mockHappyPath([]);
      const user = userEvent.setup();
      render(<NewEncounterPage />);

      await user.click(screen.getByRole('button', { name: /add party/i }));

      await waitFor(() =>
        expect(screen.getByText(/no characters are attached to this campaign/i)).toBeInTheDocument()
      );
    });

    it('toasts and closes the party picker when the roster fetch fails', async () => {
      mockApiFetch.mockImplementation((url: string) => {
        if (url === '/campaigns/camp-1/characters') return Promise.reject(new Error('nope'));
        return Promise.resolve(null);
      });
      const user = userEvent.setup();
      render(<NewEncounterPage />);

      await user.click(screen.getByRole('button', { name: /add party/i }));

      await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Failed to load party'));
      expect(screen.queryByTestId('add-party')).not.toBeInTheDocument();
    });

    it('adds monster-linked combatants from the lookup panel and lets them be removed', async () => {
      mockHappyPath();
      const user = userEvent.setup();
      render(<NewEncounterPage />);

      await user.click(screen.getByRole('button', { name: /mock-add-monster/i }));

      // Two NPCs auto-numbered against each other.
      expect(screen.getByRole('button', { name: /^remove goblin$/i })).toBeInTheDocument();
      const removeSecond = screen.getByRole('button', { name: /^remove goblin 2$/i });
      expect(removeSecond).toBeInTheDocument();

      await user.click(removeSecond);
      expect(screen.queryByRole('button', { name: /^remove goblin 2$/i })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^remove goblin$/i })).toBeInTheDocument();
    });

    it('POSTs manual + party + monster combatants together, monsters carrying monsterId', async () => {
      mockHappyPath();
      const user = userEvent.setup();
      render(<NewEncounterPage />);

      await user.type(screen.getByLabelText(/encounter name/i), 'Big Fight');
      await fillManualRow(getCombatantCard(0), {
        name: 'Bandit',
        initiative: '5',
        hp: '11',
        maxHp: '11',
        ac: '12',
        npc: true,
      });

      // Party
      await user.click(screen.getByRole('button', { name: /add party/i }));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /add selected/i })).toBeInTheDocument()
      );
      await user.click(screen.getByRole('button', { name: /add selected/i }));

      // Monsters
      await user.click(screen.getByRole('button', { name: /mock-add-monster/i }));

      await user.click(screen.getByRole('button', { name: /create encounter/i }));

      await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Encounter created!'));
      const body = getPostBody();
      expect(body.campaignId).toBe('camp-1');
      expect(body.name).toBe('Big Fight');
      expect(body.combatants).toEqual([
        { name: 'Bandit', initiative: 5, hp: 11, maxHp: 11, ac: 12, isNpc: true },
        {
          name: 'Aragorn',
          initiative: 10,
          hp: 40,
          maxHp: 45,
          ac: 16,
          isNpc: false,
          characterId: 'pc-1',
          level: 5,
        },
        {
          name: 'Legolas',
          initiative: 10,
          hp: 38,
          maxHp: 38,
          ac: 15,
          isNpc: false,
          characterId: 'pc-2',
          level: 5,
        },
        {
          name: 'Goblin',
          initiative: 12,
          hp: 7,
          maxHp: 7,
          ac: 15,
          isNpc: true,
          monsterId: 'mon-goblin',
          cr: 0.25,
          xp: 50,
          initiativeMod: 2, // dex 14 → +2
        },
        {
          name: 'Goblin 2',
          initiative: 8,
          hp: 7,
          maxHp: 7,
          ac: 15,
          isNpc: true,
          monsterId: 'mon-goblin',
          cr: 0.25,
          xp: 50,
          initiativeMod: 2,
        },
      ]);
      expect(mockRouterPush).toHaveBeenCalledWith('/campaigns/camp-1/encounters/enc-1');
    });

    it('creates a party-only encounter, dropping the blank manual row', async () => {
      mockHappyPath();
      const user = userEvent.setup();
      render(<NewEncounterPage />);

      await user.type(screen.getByLabelText(/encounter name/i), 'Just the party');

      await user.click(screen.getByRole('button', { name: /add party/i }));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /add selected/i })).toBeInTheDocument()
      );
      // Deselect Legolas so only Aragorn is added.
      await user.click(screen.getByLabelText('Add Legolas'));
      await user.click(screen.getByRole('button', { name: /add selected/i }));

      await user.click(screen.getByRole('button', { name: /create encounter/i }));

      await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Encounter created!'));
      const body = getPostBody();
      expect(body.combatants).toEqual([
        {
          name: 'Aragorn',
          initiative: 10,
          hp: 40,
          maxHp: 45,
          ac: 16,
          isNpc: false,
          characterId: 'pc-1',
          level: 5,
        },
      ]);
    });

    it('shows a live difficulty readout that reacts to picks', async () => {
      mockHappyPath();
      const user = userEvent.setup();
      render(<NewEncounterPage />);

      // No monsters yet.
      expect(screen.getByTestId('encounter-difficulty')).toHaveTextContent(/no monsters yet/i);

      // Add the party (levels) then the monsters (XP/CR) → band appears.
      await user.click(screen.getByRole('button', { name: /add party/i }));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /add selected/i })).toBeInTheDocument()
      );
      await user.click(screen.getByRole('button', { name: /add selected/i }));
      await user.click(screen.getByRole('button', { name: /mock-add-monster/i }));

      const readout = screen.getByTestId('encounter-difficulty');
      expect(readout).toHaveTextContent('2 monsters');
      expect(readout).toHaveTextContent('100 XP'); // 2 × CR 1/4 (50) = 100
      expect(within(readout).getByTestId('difficulty-band')).toBeInTheDocument();
    });
  });
});
