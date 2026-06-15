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

// The editor also fetches SRD catalogs for its pickers; route those to empty
// arrays so they don't interfere with the character-load assertions.
const isSrd = (path: string) => path.startsWith('/srd');

// Route a GET to the loaded character; PATCH/DELETE resolve/reject per the
// supplied handler so each test controls only the write outcome.
function routeLoad(character: Character, onWrite?: (opts?: { method?: string }) => unknown) {
  mockApiFetch.mockImplementation((path: string, opts?: { method?: string }) => {
    if (isSrd(path)) return Promise.resolve([]);
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
    let charLoads = 0;
    mockApiFetch.mockImplementation((path: string, opts?: { method?: string }) => {
      if (isSrd(path)) return Promise.resolve([]);
      if (!opts || opts.method === 'GET' || opts.method === undefined) {
        charLoads += 1;
        return charLoads === 1
          ? Promise.reject(new Error('boom'))
          : Promise.resolve(makeCharacter());
      }
      return Promise.resolve(undefined);
    });
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

    // The save invalidates the shared `/characters/:id` cache (so the sheet
    // shows fresh data on return), which refetches the still-mounted query — a
    // second GET fires after the initial load + PATCH.
    const charGetCount = () =>
      mockApiFetch.mock.calls.filter(
        ([p, o]) => p === '/characters/char-1' && !(o as { method?: string } | undefined)?.method
      ).length;
    await waitFor(() => expect(charGetCount()).toBeGreaterThanOrEqual(2));
  });

  it('on a 409 conflict, reloads the latest version and the next save carries it', async () => {
    let loads = 0;
    let patches = 0;
    mockApiFetch.mockImplementation((path: string, opts?: { method?: string }) => {
      if (isSrd(path)) return Promise.resolve([]);
      if (!opts || opts.method === 'GET' || opts.method === undefined) {
        loads += 1;
        // First load is version 3; the post-conflict reload returns version 5.
        return Promise.resolve(makeCharacter({ version: loads === 1 ? 3 : 5 }));
      }
      patches += 1;
      // First save loses the optimistic-lock race; the retry (against the
      // reloaded version) succeeds.
      if (patches === 1) {
        return Promise.reject(
          new ApiError(409, 'Character was modified by another request', { currentVersion: 5 })
        );
      }
      return Promise.resolve(undefined);
    });
    const user = userEvent.setup();
    renderPage();

    await waitFor(() =>
      expect((screen.getByLabelText(/^name/i) as HTMLInputElement).value).toBe('Thora Ironfist')
    );
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    // Conflict toast + a reload GET; the user stays on the page.
    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(expect.stringMatching(/changed elsewhere/i))
    );
    await waitFor(() => expect(loads).toBe(2));
    expect(mockPush).not.toHaveBeenCalled();

    // Critical: the form must have re-seeded from the reloaded character, so the
    // retried save carries the NEW version (5), not the stale 3 — otherwise it
    // would 409 forever. (Removing the formKey remount would break this.)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /save changes/i })).toBeEnabled()
    );
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Character updated!'));
    expect(lastWriteBody()).toMatchObject({ expectedVersion: 5 });
    expect(mockPush).toHaveBeenCalledWith('/characters/char-1');
  });

  it('keeps the form (not the Retry screen) and warns when the post-409 reload fails', async () => {
    let loads = 0;
    mockApiFetch.mockImplementation((path: string, opts?: { method?: string }) => {
      if (isSrd(path)) return Promise.resolve([]);
      if (!opts || opts.method === 'GET' || opts.method === undefined) {
        loads += 1;
        // Initial load succeeds; the post-conflict reload fails.
        return loads === 1
          ? Promise.resolve(makeCharacter({ version: 3 }))
          : Promise.reject(new Error('network down'));
      }
      return Promise.reject(
        new ApiError(409, 'Character was modified by another request', { currentVersion: 5 })
      );
    });
    const user = userEvent.setup();
    renderPage();

    await waitFor(() =>
      expect((screen.getByLabelText(/^name/i) as HTMLInputElement).value).toBe('Thora Ironfist')
    );
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(
        expect.stringMatching(/reloading the latest version failed/i)
      )
    );
    // react-query keeps the last good data on a refetch error, so the form stays
    // mounted (with the user's edits) instead of collapsing to the Retry screen.
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
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
