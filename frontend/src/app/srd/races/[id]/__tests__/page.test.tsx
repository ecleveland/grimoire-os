import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RaceDetailPage from '../page';
import { PrintTrayProvider } from '@/lib/print-tray-context';
import type { SrdRace, SrdSubrace } from '@/lib/types';

// ── Mocks ────────────────────────────────────────────────────────────────────

// The options are recorded too, so tests can check the error toast.
const mockUseApiQuery = vi.fn();
vi.mock('@/lib/query', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/query')>()),
  useApiQuery: (path: string, options?: unknown) => mockUseApiQuery(path, options),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'race-1' }),
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

const HIGH_ELF: SrdSubrace = {
  id: 'subrace-high',
  name: 'High Elf',
  raceId: 'race-1',
  description: 'A scholarly elf with a knack for cantrips.',
  source: 'SRD 5.2.1',
};

function makeRace(over: Partial<SrdRace> = {}): SrdRace {
  return {
    id: 'race-1',
    name: 'Elf',
    speed: 30,
    size: 'Medium',
    abilityBonuses: { DEX: 2 },
    languages: ['Common', 'Elvish'],
    description: 'A graceful people of the ancient woods.',
    traits: [
      {
        id: 'trait-darkvision',
        name: 'Darkvision',
        description: 'You can see in dim light within 60 feet.',
      },
    ],
    age: 'Elves reach adulthood around 100.',
    alignment: 'Elves lean toward chaotic good.',
    sizeDescription: 'Elves stand between 5 and 6 feet tall.',
    subraces: [HIGH_ELF],
    source: 'SRD 5.2.1',
    ...over,
  };
}

const mockRefetch = vi.fn();

function queryResult(over: Record<string, unknown> = {}) {
  return {
    data: makeRace(),
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: mockRefetch,
    ...over,
  };
}

function renderPage() {
  return render(
    <PrintTrayProvider>
      <RaceDetailPage />
    </PrintTrayProvider>
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('RaceDetailPage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockUseApiQuery.mockReturnValue(queryResult());
  });

  describe('loading and errors', () => {
    it('fetches /srd/races/race-1 with the load-failure toast', () => {
      renderPage();

      expect(mockUseApiQuery).toHaveBeenCalledWith(
        '/srd/races/race-1',
        expect.objectContaining({
          errorToast: { message: 'Failed to load race', id: 'load-race' },
        })
      );
    });

    it('renders a loading state while the race is in flight', () => {
      mockUseApiQuery.mockReturnValue(queryResult({ data: undefined, isLoading: true }));

      renderPage();

      expect(screen.getByText('Loading race…')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: '← Races' })).toHaveAttribute('href', '/srd/races');
    });

    it('shows the load-failure state with Retry when the fetch fails before a race loads', async () => {
      mockUseApiQuery.mockReturnValue(queryResult({ data: undefined, isError: true }));
      const user = userEvent.setup();

      renderPage();

      expect(screen.getByText('Failed to load race.')).toBeInTheDocument();
      expect(screen.queryByText('Race not found.')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Retry' }));
      expect(mockRefetch).toHaveBeenCalledTimes(1);
    });

    it('disables Retry while a refetch is in flight', () => {
      mockUseApiQuery.mockReturnValue(
        queryResult({ data: undefined, isError: true, isFetching: true })
      );

      renderPage();

      expect(screen.getByRole('button', { name: 'Retry' })).toBeDisabled();
    });

    it('shows the not-found state without Retry when the race is null', () => {
      mockUseApiQuery.mockReturnValue(queryResult({ data: null }));

      renderPage();

      expect(screen.getByText('Race not found.')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Back to races' })).toHaveAttribute(
        'href',
        '/srd/races'
      );
      expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
      expect(screen.queryByText('Failed to load race.')).not.toBeInTheDocument();
    });

    it('keeps a loaded race on screen when a background refetch fails', () => {
      mockUseApiQuery.mockReturnValue(queryResult({ data: makeRace(), isError: true }));

      renderPage();

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Elf');
      expect(screen.queryByText('Race not found.')).not.toBeInTheDocument();
      expect(screen.queryByText('Failed to load race.')).not.toBeInTheDocument();
    });
  });

  describe('loaded race', () => {
    it('renders the back link, the header and the race body', () => {
      renderPage();

      expect(screen.getByRole('link', { name: '← Races' })).toHaveAttribute('href', '/srd/races');
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Elf');
      expect(screen.getByText('Speed: 30 ft · Size: Medium')).toBeInTheDocument();
      // One body section stands in for the rest; RaceDetail's own spec covers them.
      // It sits at level 2, directly under the page h1 and level with Subraces.
      expect(screen.getByRole('heading', { level: 2, name: 'Languages' })).toBeInTheDocument();
      expect(screen.getByText('Common, Elvish')).toBeInTheDocument();
    });

    it('offers print toggles for the race and for each trait', () => {
      renderPage();

      expect(screen.getByRole('button', { name: 'Add Elf to print set' })).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Add Darkvision to print set' })
      ).toBeInTheDocument();
    });

    it('shows no manage controls, since races have no homebrew tier', () => {
      renderPage();

      expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    });
  });

  describe('subraces', () => {
    it('renders the subraces with their descriptions', () => {
      renderPage();

      expect(screen.getByRole('heading', { level: 2, name: 'Subraces' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 3, name: 'High Elf' })).toBeInTheDocument();
      expect(screen.getByText('A scholarly elf with a knack for cantrips.')).toBeInTheDocument();
    });

    it('omits the Subraces section when the race has an empty list', () => {
      mockUseApiQuery.mockReturnValue(queryResult({ data: makeRace({ subraces: [] }) }));

      renderPage();

      expect(screen.queryByRole('heading', { name: 'Subraces' })).not.toBeInTheDocument();
    });

    it('omits the Subraces section when subraces are absent', () => {
      mockUseApiQuery.mockReturnValue(queryResult({ data: makeRace({ subraces: undefined }) }));

      renderPage();

      expect(screen.queryByRole('heading', { name: 'Subraces' })).not.toBeInTheDocument();
    });

    it('omits a missing subrace description', () => {
      mockUseApiQuery.mockReturnValue(
        queryResult({
          data: makeRace({ subraces: [{ ...HIGH_ELF, description: undefined }] }),
        })
      );

      renderPage();

      expect(screen.getByRole('heading', { level: 3, name: 'High Elf' })).toBeInTheDocument();
      expect(
        screen.queryByText('A scholarly elf with a knack for cantrips.')
      ).not.toBeInTheDocument();
    });
  });
});
