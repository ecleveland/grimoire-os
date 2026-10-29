import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import CharacterSheetPage from '../page';
import type { Character } from '@/lib/types';

const mockApiFetch = vi.fn();
const mockUseAuth = vi.fn();

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'char-1' }),
}));
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
// Render a lightweight stand-in so we can assert the props the page derives.
vi.mock('../_components/CharacterSheet', () => ({
  default: ({ character, isOwner }: { character: Character; isOwner: boolean }) => (
    <div data-testid="character-sheet" data-owner={isOwner}>
      {character.name}
    </div>
  ),
}));

function makeTestClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
}

function renderPage(client: QueryClient = makeTestClient()) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<CharacterSheetPage />, { wrapper });
}

const character = { id: 'char-1', userId: 'user-1', name: 'Thorin' } as Character;

beforeEach(() => {
  mockApiFetch.mockReset();
  mockUseAuth.mockReset();
  mockUseAuth.mockReturnValue({ user: { userId: 'user-1' } });
  sessionStorage.clear();
});

describe('CharacterSheetPage', () => {
  it('shows the loading state before the character resolves', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('fetches the character by id and renders the sheet', async () => {
    mockApiFetch.mockResolvedValue(character);
    renderPage();
    await waitFor(() => expect(screen.getByTestId('character-sheet')).toBeInTheDocument());
    expect(mockApiFetch).toHaveBeenCalledWith('/characters/char-1');
    expect(screen.getByText('Thorin')).toBeInTheDocument();
  });

  it('marks the viewer as owner when the character belongs to them', async () => {
    mockApiFetch.mockResolvedValue(character);
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('character-sheet')).toHaveAttribute('data-owner', 'true')
    );
  });

  it('marks the viewer as non-owner for someone else’s character', async () => {
    mockUseAuth.mockReturnValue({ user: { userId: 'someone-else' } });
    mockApiFetch.mockResolvedValue(character);
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('character-sheet')).toHaveAttribute('data-owner', 'false')
    );
  });

  it('notes once where a copied character came from (VEG-646)', async () => {
    sessionStorage.setItem('copied-from:char-1', JSON.stringify({ name: 'Vex', level: 5 }));
    mockApiFetch.mockResolvedValue(character);
    renderPage();

    await screen.findByTestId('character-sheet');
    expect(screen.getByTestId('copied-from-note')).toHaveTextContent('Copied from Vex at level 5.');
    expect(screen.getByRole('status')).toBe(screen.getByTestId('copied-from-note'));
    expect(sessionStorage.getItem('copied-from:char-1')).toBeNull();
  });

  it('shows no copied-from note without a session note for this id (VEG-646)', async () => {
    sessionStorage.setItem('copied-from:char-2', JSON.stringify({ name: 'Vex', level: 5 }));
    mockApiFetch.mockResolvedValue(character);
    renderPage();

    await screen.findByTestId('character-sheet');
    expect(screen.queryByTestId('copied-from-note')).toBeNull();
    expect(sessionStorage.getItem('copied-from:char-2')).not.toBeNull();
  });

  it('shows a not-found message when the character fails to load', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockApiFetch.mockRejectedValue(new Error('boom'));
    renderPage();
    await waitFor(() => expect(screen.getByText(/character not found/i)).toBeInTheDocument());
    consoleError.mockRestore();
  });
});
