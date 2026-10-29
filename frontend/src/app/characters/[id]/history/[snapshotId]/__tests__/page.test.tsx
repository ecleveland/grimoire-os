import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import CharacterSnapshotPage from '../page';
import type { Character, CharacterSnapshot } from '@/lib/types';
import { makeCharacter } from '@/test-utils/character';
import { renderWithQueryClient } from '@/test-utils/query';

const mockApiFetch = vi.fn();

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'char-1', snapshotId: 'snap-1' }),
}));
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
// Render a lightweight stand-in so we can assert the props the page passes.
vi.mock('../../../_components/CharacterSheet', () => ({
  default: ({ character, isOwner }: { character: Character; isOwner: boolean }) => (
    <div data-testid="character-sheet" data-owner={isOwner}>
      {character.name}
    </div>
  ),
}));

function makeSnapshot(over: Partial<CharacterSnapshot> = {}): CharacterSnapshot {
  return {
    id: 'snap-1',
    level: 4,
    label: 'Before the dragon fight',
    takenAt: '2026-10-12T12:00:00Z',
    data: makeCharacter({ level: 4, version: 0 }),
    ...over,
  };
}

beforeEach(() => {
  mockApiFetch.mockReset();
  vi.mocked(toast.error).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CharacterSnapshotPage (VEG-645)', () => {
  it('shows the loading state before the snapshot resolves', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    renderWithQueryClient(<CharacterSnapshotPage />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByTestId('snapshot-banner')).toBeNull();
  });

  it('fetches the snapshot once and renders its stored sheet as a non-owner', async () => {
    mockApiFetch.mockResolvedValue(
      makeSnapshot({ data: makeCharacter({ name: 'Vex', level: 4 }) })
    );
    renderWithQueryClient(<CharacterSnapshotPage />);

    const sheet = await screen.findByTestId('character-sheet');
    expect(sheet).toHaveAttribute('data-owner', 'false');
    expect(sheet).toHaveTextContent('Vex');
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockApiFetch).toHaveBeenCalledWith('/characters/char-1/snapshots/snap-1');
  });

  it('shows a not-found message and toasts when the snapshot fails to load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockApiFetch.mockRejectedValue(new Error('Snapshot not found'));
    renderWithQueryClient(<CharacterSnapshotPage />);

    expect(await screen.findByText('Snapshot not found.')).toBeInTheDocument();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to load snapshot'));
    expect(screen.queryByTestId('character-sheet')).toBeNull();
    expect(screen.queryByTestId('snapshot-banner')).toBeNull();
  });

  it('names the level, date and label in the banner', async () => {
    mockApiFetch.mockResolvedValue(makeSnapshot());
    renderWithQueryClient(<CharacterSnapshotPage />);

    expect(await screen.findByTestId('snapshot-banner')).toHaveTextContent(
      'Thorin Ironforge at level 4, saved 12 Oct 2026 as "Before the dragon fight". Read only.'
    );
  });

  it('leaves the label out of the banner when the snapshot has none', async () => {
    mockApiFetch.mockResolvedValue(makeSnapshot({ label: null }));
    renderWithQueryClient(<CharacterSnapshotPage />);

    const banner = await screen.findByTestId('snapshot-banner');
    expect(banner).toHaveTextContent('Thorin Ironforge at level 4, saved 12 Oct 2026. Read only.');
    expect(banner).not.toHaveTextContent(' as "');
  });

  it('takes the banner level from the snapshot and the name from its stored sheet', async () => {
    mockApiFetch.mockResolvedValue(
      makeSnapshot({ level: 3, label: null, data: makeCharacter({ name: 'Vex', level: 3 }) })
    );
    renderWithQueryClient(<CharacterSnapshotPage />);

    expect(await screen.findByTestId('snapshot-banner')).toHaveTextContent(
      'Vex at level 3, saved 12 Oct 2026. Read only.'
    );
  });

  it('links back to the live sheet', async () => {
    mockApiFetch.mockResolvedValue(makeSnapshot());
    renderWithQueryClient(<CharacterSnapshotPage />);

    expect(await screen.findByRole('link', { name: 'Back to the current sheet' })).toHaveAttribute(
      'href',
      '/characters/char-1'
    );
  });

  it('offers no way to play a copy yet', async () => {
    mockApiFetch.mockResolvedValue(makeSnapshot());
    renderWithQueryClient(<CharacterSnapshotPage />);

    await screen.findByTestId('snapshot-banner');
    expect(screen.queryByRole('link', { name: /play a copy/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /play a copy/i })).toBeNull();
  });
});
