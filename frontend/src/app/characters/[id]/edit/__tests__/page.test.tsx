import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import EditCharacterPage from '../page';
import { ApiError } from '@/lib/api';
import type { Character } from '@/lib/types';

const mockApiFetch = vi.fn();
const mockPush = vi.fn();
const mockBack = vi.fn();
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();

// Keep the real ApiError class so the page's `err instanceof ApiError` 409
// branch fires; only the network call is stubbed.
vi.mock('@/lib/api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});
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

function makeTestClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderPage() {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={makeTestClient()}>{children}</QueryClientProvider>
  );
  return render(<EditCharacterPage />, { wrapper });
}

function makeCharacter(over: Partial<Character> = {}): Character {
  return {
    id: 'char-1',
    userId: 'user-1',
    name: 'Thora Ironfist',
    race: 'Dwarf',
    class: 'Fighter',
    subclass: 'Champion',
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
    size: 'Medium',
    hitDice: { dieType: 'd10', total: 7, spent: 2 },
    proficiencies: [],
    languages: [],
    savingThrows: [],
    skills: [],
    spells: [],
    spellSlots: [],
    inventory: [],
    attunedItems: [],
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    features: [],
    version: 3,
    createdAt: '',
    updatedAt: '',
    ...over,
  };
}

// Route a GET to the loaded character; PATCH/DELETE resolve/reject per the
// supplied handler so each test controls only the write outcome.
function routeLoad(character: Character, onWrite?: (opts?: { method?: string }) => unknown) {
  mockApiFetch.mockImplementation((path: string, opts?: { method?: string }) => {
    if (!opts || opts.method === undefined || opts.method === 'GET') {
      return Promise.resolve(character);
    }
    return onWrite ? onWrite(opts) : Promise.resolve(undefined);
  });
}

function lastWriteBody(): Record<string, unknown> {
  const call = [...mockApiFetch.mock.calls]
    .reverse()
    .find(([, opts]) => (opts as { method?: string } | undefined)?.method === 'PATCH');
  return JSON.parse((call![1] as { body: string }).body);
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
    renderPage();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('prefills the form with existing character values, including new slice-1 fields', async () => {
    routeLoad(makeCharacter());
    renderPage();
    await waitFor(() =>
      expect((screen.getByLabelText(/^name/i) as HTMLInputElement).value).toBe('Thora Ironfist')
    );
    expect((screen.getByLabelText(/^subclass/i) as HTMLInputElement).value).toBe('Champion');
    expect((screen.getByLabelText(/^size/i) as HTMLSelectElement).value).toBe('Medium');
    expect((screen.getByLabelText('STR') as HTMLInputElement).value).toBe('16');
    expect((screen.getByLabelText(/initiative/i) as HTMLInputElement).value).toBe('1');
    expect((screen.getByLabelText(/hit die$/i) as HTMLSelectElement).value).toBe('d10');
    expect((screen.getByLabelText(/hit dice spent/i) as HTMLInputElement).value).toBe('2');
  });

  it('renders an error state instead of an editable form when the initial load fails', async () => {
    mockApiFetch.mockRejectedValue(new Error('boom'));
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument());
    expect(mockToastError).toHaveBeenCalledWith('Failed to load character');
    // No form: a Save here would PATCH defaults over the real record (VEG-317).
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^name/i)).not.toBeInTheDocument();
  });

  it('Retry re-fetches and renders the form once the load succeeds', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('boom'));
    mockApiFetch.mockResolvedValueOnce(makeCharacter());
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() =>
      expect((screen.getByLabelText(/^name/i) as HTMLInputElement).value).toBe('Thora Ironfist')
    );
  });

  it('PATCHes with edited values + expectedVersion and redirects on save', async () => {
    routeLoad(makeCharacter());
    const user = userEvent.setup();
    renderPage();

    await waitFor(() =>
      expect((screen.getByLabelText(/^name/i) as HTMLInputElement).value).toBe('Thora Ironfist')
    );
    const nameInput = screen.getByLabelText(/^name/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Renamed Hero');
    fireEvent.change(screen.getByLabelText(/initiative/i), { target: { value: '4' } });
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Character updated!'));
    // A PATCH fired (a cache-invalidation refetch may follow it, so don't assert
    // it was the *last* call).
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/characters/char-1',
      expect.objectContaining({ method: 'PATCH' })
    );
    expect(lastWriteBody()).toMatchObject({
      name: 'Renamed Hero',
      subclass: 'Champion',
      size: 'Medium',
      initiative: 4,
      hitDice: { dieType: 'd10', total: 7, spent: 2 },
      // The loaded version is sent so the backend can guard the write.
      expectedVersion: 3,
    });
    expect(mockPush).toHaveBeenCalledWith('/characters/char-1');
  });

  it('on a 409 conflict, toasts and reloads the latest version into the form', async () => {
    let loads = 0;
    mockApiFetch.mockImplementation((path: string, opts?: { method?: string }) => {
      if (!opts || opts.method === 'GET' || opts.method === undefined) {
        loads += 1;
        // First load is version 3; the post-conflict reload returns version 5.
        return Promise.resolve(
          makeCharacter({ version: loads === 1 ? 3 : 5, name: 'Server Name' })
        );
      }
      return Promise.reject(
        new ApiError(409, 'Character was modified by another request', { currentVersion: 5 })
      );
    });
    const user = userEvent.setup();
    renderPage();

    await waitFor(() =>
      expect((screen.getByLabelText(/^name/i) as HTMLInputElement).value).toBe('Server Name')
    );
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(expect.stringMatching(/changed elsewhere/i))
    );
    // A reload GET fired after the conflict; the user stays on the page.
    await waitFor(() => expect(loads).toBe(2));
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /save changes/i })).not.toBeDisabled();
  });

  it('toasts the message and stays on the page for a non-409 PATCH failure', async () => {
    routeLoad(makeCharacter(), () => Promise.reject(new Error('validation failed')));
    const user = userEvent.setup();
    renderPage();

    await waitFor(() =>
      expect((screen.getByLabelText(/^name/i) as HTMLInputElement).value).toBe('Thora Ironfist')
    );
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('validation failed'));
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /save changes/i })).not.toBeDisabled();
  });

  it('falls back to a generic message when the PATCH rejects with a non-Error', async () => {
    routeLoad(makeCharacter(), () => Promise.reject('nope'));
    const user = userEvent.setup();
    renderPage();

    await waitFor(() =>
      expect((screen.getByLabelText(/^name/i) as HTMLInputElement).value).toBe('Thora Ironfist')
    );
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Failed to update character'));
  });

  it('Cancel navigates back without saving', async () => {
    routeLoad(makeCharacter());
    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect((screen.getByLabelText(/^name/i) as HTMLInputElement).value).toBe('Thora Ironfist')
    );
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(mockBack).toHaveBeenCalled();
    // Only the load GET ran — no write.
    expect(
      mockApiFetch.mock.calls.some(([, o]) => (o as { method?: string })?.method === 'PATCH')
    ).toBe(false);
  });

  it('Delete opens the confirm dialog and DELETEs on confirmation', async () => {
    routeLoad(makeCharacter());
    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect((screen.getByLabelText(/^name/i) as HTMLInputElement).value).toBe('Thora Ironfist')
    );
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    const dialog = screen.getByRole('dialog');
    expect(screen.getByText(/delete character\?/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /delete/i }));

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Character deleted'));
    expect(mockApiFetch).toHaveBeenLastCalledWith(
      '/characters/char-1',
      expect.objectContaining({ method: 'DELETE' })
    );
    expect(mockPush).toHaveBeenCalledWith('/characters');
  });

  it('toasts an error if the DELETE fails', async () => {
    routeLoad(makeCharacter(), opts =>
      opts?.method === 'DELETE'
        ? Promise.reject(new Error('cannot delete'))
        : Promise.resolve(undefined)
    );
    const user = userEvent.setup();
    renderPage();
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
