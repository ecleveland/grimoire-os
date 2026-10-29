import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
// The dialog has its own spec. This stand-in shows the props the banner passes.
vi.mock('../../../_components/PlayCopyDialog', () => ({
  default: ({
    characterId,
    characterName,
    snapshot,
    onClose,
  }: {
    characterId: string;
    characterName: string;
    snapshot: { id: string; level: number };
    onClose: () => void;
  }) => (
    <div
      data-testid="play-copy-dialog"
      data-character={characterId}
      data-name={characterName}
      data-level={snapshot.level}
      data-snapshot={snapshot.id}
    >
      <button type="button" onClick={onClose}>
        Close
      </button>
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

  it('opens the play-a-copy dialog for this snapshot from the banner (VEG-646)', async () => {
    mockApiFetch.mockResolvedValue(
      makeSnapshot({ level: 3, data: makeCharacter({ name: 'Vex', level: 3 }) })
    );
    const user = userEvent.setup();
    renderWithQueryClient(<CharacterSnapshotPage />);

    const banner = await screen.findByTestId('snapshot-banner');
    expect(screen.queryByTestId('play-copy-dialog')).toBeNull();
    await user.click(within(banner).getByRole('button', { name: 'Play a copy' }));

    const dialog = screen.getByTestId('play-copy-dialog');
    expect(dialog).toHaveAttribute('data-character', 'char-1');
    expect(dialog).toHaveAttribute('data-name', 'Vex');
    expect(dialog).toHaveAttribute('data-snapshot', 'snap-1');
    expect(dialog).toHaveAttribute('data-level', '3');

    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByTestId('play-copy-dialog')).toBeNull();
  });
});
