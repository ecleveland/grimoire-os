import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EditCharacterPage from '../page';
import type { Character } from '@/lib/types';

const mockApiFetch = vi.fn();
const mockPush = vi.fn();
const mockBack = vi.fn();
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'char-1' }),
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));

function makeCharacter(over: Partial<Character> = {}): Character {
  return {
    id: 'char-1',
    userId: 'user-1',
    name: 'Thora Ironfist',
    race: 'Dwarf',
    class: 'Fighter',
    level: 7,
    background: 'Soldier',
    alignment: 'Lawful Good',
    experiencePoints: 0,
    abilityScores: {
      strength: 16,
      dexterity: 12,
      constitution: 14,
      intelligence: 10,
      wisdom: 11,
      charisma: 9,
    },
    hitPoints: { max: 58, current: 41, temporary: 0 },
    deathSaves: { successes: 0, failures: 0 },
    armorClass: 18,
    speed: 25,
    initiative: 1,
    proficiencies: [],
    languages: [],
    savingThrows: [],
    skills: [],
    knownSpells: [],
    preparedSpells: [],
    spellSlots: [],
    inventory: [],
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    features: [],
    version: 1,
    createdAt: '',
    updatedAt: '',
    ...over,
  };
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockPush.mockReset();
  mockBack.mockReset();
  mockToastError.mockReset();
  mockToastSuccess.mockReset();
});

describe('EditCharacterPage', () => {
  it('shows the loading state before the fetch resolves', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    render(<EditCharacterPage />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('prefills the form with existing character values', async () => {
    mockApiFetch.mockResolvedValue(makeCharacter());
    render(<EditCharacterPage />);
    await waitFor(() => {
      expect((screen.getByLabelText(/^name/i) as HTMLInputElement).value).toBe('Thora Ironfist');
    });
    expect((screen.getByLabelText(/^race/i) as HTMLInputElement).value).toBe('Dwarf');
    expect((screen.getByLabelText(/^class/i) as HTMLInputElement).value).toBe('Fighter');
    expect((screen.getByLabelText(/^level/i) as HTMLInputElement).value).toBe('7');
    // Ability inputs use unwired inline labels — query by role. DOM order of
    // number inputs: Level, then STR/DEX/CON/INT/WIS/CHA, then combat stats.
    const spinbuttons = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    expect(spinbuttons.slice(1, 7).map(i => i.value)).toEqual(['16', '12', '14', '10', '11', '9']);
    expect((screen.getByLabelText(/max hp/i) as HTMLInputElement).value).toBe('58');
    expect((screen.getByLabelText(/armor class/i) as HTMLInputElement).value).toBe('18');
  });

  it('renders an error state instead of an editable form when the initial load fails', async () => {
    mockApiFetch.mockRejectedValue(new Error('boom'));
    render(<EditCharacterPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument());
    expect(mockToastError).toHaveBeenCalledWith('Failed to load character');
    // No form: a Save here would PATCH level-1/all-10s defaults over the real record.
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^name/i)).not.toBeInTheDocument();
  });

  it('Retry re-fetches and renders the form once the load succeeds', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('boom'));
    mockApiFetch.mockResolvedValueOnce(makeCharacter());
    const user = userEvent.setup();
    render(<EditCharacterPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => {
      expect((screen.getByLabelText(/^name/i) as HTMLInputElement).value).toBe('Thora Ironfist');
    });
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });

  it('PATCHes /characters/:id with edited values and redirects on save', async () => {
    mockApiFetch.mockResolvedValueOnce(makeCharacter());
    mockApiFetch.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<EditCharacterPage />);

    await waitFor(() =>
      expect((screen.getByLabelText(/^name/i) as HTMLInputElement).value).toBe('Thora Ironfist')
    );
    const nameInput = screen.getByLabelText(/^name/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Renamed Hero');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
    expect(mockApiFetch).toHaveBeenLastCalledWith(
      '/characters/char-1',
      expect.objectContaining({ method: 'PATCH' })
    );
    const body = JSON.parse((mockApiFetch.mock.calls[1][1] as RequestInit).body as string);
    expect(body).toMatchObject({
      name: 'Renamed Hero',
      race: 'Dwarf',
      class: 'Fighter',
      level: 7,
      abilityScores: makeCharacter().abilityScores,
      hitPoints: { max: 58, current: 41, temporary: 0 },
      armorClass: 18,
      speed: 25,
    });
    expect(mockToastSuccess).toHaveBeenCalledWith('Character updated!');
    expect(mockPush).toHaveBeenCalledWith('/characters/char-1');
  });

  it('toasts the error message and stays on the page if the PATCH fails', async () => {
    mockApiFetch.mockResolvedValueOnce(makeCharacter());
    mockApiFetch.mockRejectedValueOnce(new Error('version conflict'));
    const user = userEvent.setup();
    render(<EditCharacterPage />);

    await waitFor(() =>
      expect((screen.getByLabelText(/^name/i) as HTMLInputElement).value).toBe('Thora Ironfist')
    );
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('version conflict'));
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /save changes/i })).not.toBeDisabled();
  });

  it('falls back to a generic message when the PATCH rejects with a non-Error', async () => {
    mockApiFetch.mockResolvedValueOnce(makeCharacter());
    mockApiFetch.mockRejectedValueOnce('nope');
    const user = userEvent.setup();
    render(<EditCharacterPage />);

    await waitFor(() =>
      expect((screen.getByLabelText(/^name/i) as HTMLInputElement).value).toBe('Thora Ironfist')
    );
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Failed to update character'));
  });

  it('Cancel navigates back without saving', async () => {
    mockApiFetch.mockResolvedValueOnce(makeCharacter());
    const user = userEvent.setup();
    render(<EditCharacterPage />);
    await waitFor(() =>
      expect((screen.getByLabelText(/^name/i) as HTMLInputElement).value).toBe('Thora Ironfist')
    );
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(mockBack).toHaveBeenCalled();
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });

  it('Delete opens the confirm dialog and DELETEs on confirmation', async () => {
    mockApiFetch.mockResolvedValueOnce(makeCharacter());
    mockApiFetch.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<EditCharacterPage />);
    await waitFor(() =>
      expect((screen.getByLabelText(/^name/i) as HTMLInputElement).value).toBe('Thora Ironfist')
    );
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    const dialog = screen.getByRole('dialog');
    expect(screen.getByText(/delete character\?/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /delete/i }));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
    expect(mockApiFetch).toHaveBeenLastCalledWith(
      '/characters/char-1',
      expect.objectContaining({ method: 'DELETE' })
    );
    expect(mockToastSuccess).toHaveBeenCalledWith('Character deleted');
    expect(mockPush).toHaveBeenCalledWith('/characters');
  });

  it('toasts an error if the DELETE fails', async () => {
    mockApiFetch.mockResolvedValueOnce(makeCharacter());
    mockApiFetch.mockRejectedValueOnce(new Error('cannot delete'));
    const user = userEvent.setup();
    render(<EditCharacterPage />);
    await waitFor(() =>
      expect((screen.getByLabelText(/^name/i) as HTMLInputElement).value).toBe('Thora Ironfist')
    );
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /delete/i }));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('cannot delete'));
    expect(mockPush).not.toHaveBeenCalled();
  });
});
