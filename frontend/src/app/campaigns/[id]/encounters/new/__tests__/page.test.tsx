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

describe('NewEncounterPage', () => {
  it('renders one empty combatant by default and hides the Remove button for it', () => {
    render(<NewEncounterPage />);
    expect(screen.getByRole('heading', { name: /create encounter/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/encounter name/i)).toHaveValue('');
    expect(screen.getByText('Combatant 1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
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

    const fields = getCombatantFields(getCombatantCard(0));
    await user.type(fields.name, 'Goblin');
    await user.clear(fields.initiative);
    await user.type(fields.initiative, '15');
    await user.clear(fields.hp);
    await user.type(fields.hp, '7');
    await user.clear(fields.maxHp);
    await user.type(fields.maxHp, '7');
    await user.clear(fields.ac);
    await user.type(fields.ac, '13');
    await user.click(fields.npc);

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
});
