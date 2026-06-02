import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import CharactersPage from '../page';
import type { CharacterListItem, PaginatedResponse } from '@/lib/types';

const mockApiFetch = vi.fn();
const mockToastError = vi.fn();
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: vi.fn(),
  },
}));

function makeCharacter(over: Partial<CharacterListItem> = {}): CharacterListItem {
  return {
    id: 'char-1',
    userId: 'user-1',
    name: 'Thora Ironfist',
    race: 'Dwarf',
    class: 'Fighter',
    level: 3,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

function makeResponse(
  data: CharacterListItem[],
  over: Partial<PaginatedResponse<CharacterListItem>> = {}
) {
  return {
    data,
    total: data.length,
    page: 1,
    lastPage: 1,
    limit: 20,
    ...over,
  } as PaginatedResponse<CharacterListItem>;
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockToastError.mockReset();
});

describe('CharactersPage', () => {
  it('shows the loading state before the fetch resolves', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    render(<CharactersPage />);
    expect(screen.getByText(/loading characters/i)).toBeInTheDocument();
  });

  it('fetches characters with pagination params on mount', async () => {
    mockApiFetch.mockResolvedValue(makeResponse([]));
    render(<CharactersPage />);
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/characters?page=1&limit=20');
    });
  });

  it('renders the heading and a link to create a new character', async () => {
    mockApiFetch.mockResolvedValue(makeResponse([makeCharacter()]));
    render(<CharactersPage />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /characters/i })).toBeInTheDocument()
    );
    const newLink = screen.getByRole('link', { name: /new character/i });
    expect(newLink).toHaveAttribute('href', '/characters/new');
  });

  it('renders a card per character with name, race, class, and level', async () => {
    mockApiFetch.mockResolvedValue(
      makeResponse([
        makeCharacter({
          id: 'a',
          name: 'Thora Ironfist',
          race: 'Dwarf',
          class: 'Fighter',
          level: 3,
        }),
        makeCharacter({
          id: 'b',
          name: 'Lyra Moonwhisper',
          race: 'Elf',
          class: 'Wizard',
          level: 5,
        }),
      ])
    );
    render(<CharactersPage />);
    await waitFor(() => expect(screen.getByText('Thora Ironfist')).toBeInTheDocument());
    expect(screen.getByText('Dwarf Fighter')).toBeInTheDocument();
    expect(screen.getByText('Lyra Moonwhisper')).toBeInTheDocument();
    expect(screen.getByText('Elf Wizard')).toBeInTheDocument();
    expect(screen.getByText('Level 3')).toBeInTheDocument();
    expect(screen.getByText('Level 5')).toBeInTheDocument();
    const detailLink = screen.getByRole('link', { name: /thora ironfist/i });
    expect(detailLink).toHaveAttribute('href', '/characters/a');
  });

  it('shows the empty state when no characters are returned', async () => {
    mockApiFetch.mockResolvedValue(makeResponse([]));
    render(<CharactersPage />);
    await waitFor(() => expect(screen.getByText(/no characters yet/i)).toBeInTheDocument());
  });

  it('toasts an error when the characters request fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockApiFetch.mockRejectedValue(new Error('boom'));
    render(<CharactersPage />);
    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(
        'Failed to load characters',
        expect.objectContaining({ id: 'load-characters' })
      )
    );
    consoleError.mockRestore();
  });

  it('renders pagination controls when there is more than one page', async () => {
    mockApiFetch.mockResolvedValue(
      makeResponse([makeCharacter({ id: 'a' })], { total: 25, lastPage: 2 })
    );
    render(<CharactersPage />);
    await waitFor(() => expect(screen.getByText('Thora Ironfist')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
    expect(screen.getByText(/page 1 of 2/i)).toBeInTheDocument();
  });
});
