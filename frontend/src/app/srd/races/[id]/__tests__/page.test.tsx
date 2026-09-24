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

type RaceWithSubraces = SrdRace & { subraces?: SrdSubrace[] };

const HIGH_ELF: SrdSubrace = {
  id: 'subrace-high',
  name: 'High Elf',
  raceId: 'race-1',
  description: 'A scholarly elf with a knack for cantrips.',
  source: 'SRD 5.2.1',
};

function makeRace(over: Partial<RaceWithSubraces> = {}): RaceWithSubraces {
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
        description: [
          'You can see in dim light within 60 feet.',
          '',
          '| Range | Effect |',
          '| --- | --- |',
          '| 60 feet | Dim light counts as bright light. |',
        ].join('\n'),
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
    it('renders the back link, the header and the race sections', () => {
      renderPage();

      expect(screen.getByRole('link', { name: '← Races' })).toHaveAttribute('href', '/srd/races');
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Elf');
      expect(screen.getByText('Speed: 30 ft · Size: Medium')).toBeInTheDocument();
      expect(screen.getByText('A graceful people of the ancient woods.')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Ability Bonuses' })).toBeInTheDocument();
      expect(screen.getByText('DEX +2')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Traits' })).toBeInTheDocument();
      expect(screen.getByText('Darkvision.')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Languages' })).toBeInTheDocument();
      expect(screen.getByText('Common, Elvish')).toBeInTheDocument();
    });

    it('renders the flavour paragraphs under their own headings', () => {
      renderPage();

      expect(screen.getByRole('heading', { name: 'Age' })).toBeInTheDocument();
      expect(screen.getByText('Elves reach adulthood around 100.')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Alignment' })).toBeInTheDocument();
      expect(screen.getByText('Elves lean toward chaotic good.')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Size' })).toBeInTheDocument();
      expect(screen.getByText('Elves stand between 5 and 6 feet tall.')).toBeInTheDocument();
    });

    it('renders a trait description as markdown', () => {
      renderPage();

      expect(screen.getByText(/You can see in dim light within 60 feet\./)).toBeInTheDocument();
      expect(screen.getByRole('table')).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Effect' })).toBeInTheDocument();
      expect(
        screen.getByRole('cell', { name: 'Dim light counts as bright light.' })
      ).toBeInTheDocument();
    });

    it('offers print toggles for the race and for each trait', () => {
      renderPage();

      expect(screen.getByRole('button', { name: 'Add Elf to print set' })).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Add Darkvision to print set' })
      ).toBeInTheDocument();
    });

    it('renders the subraces with their descriptions', () => {
      renderPage();

      expect(screen.getByRole('heading', { level: 2, name: 'Subraces' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 3, name: 'High Elf' })).toBeInTheDocument();
      expect(screen.getByText('A scholarly elf with a knack for cantrips.')).toBeInTheDocument();
    });

    it('shows no manage controls, since races have no homebrew tier', () => {
      renderPage();

      expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    });
  });

  describe('empty and absent fields', () => {
    it('omits the Ability Bonuses section when the race grants none', () => {
      mockUseApiQuery.mockReturnValue(queryResult({ data: makeRace({ abilityBonuses: {} }) }));

      renderPage();

      expect(screen.queryByRole('heading', { name: 'Ability Bonuses' })).not.toBeInTheDocument();
    });

    it('omits the Ability Bonuses section when bonuses are null', () => {
      // Seeded SRD 5.2.1 species persist abilityBonuses as a SQL NULL, so the page
      // must not throw on Object.entries(null).
      mockUseApiQuery.mockReturnValue(
        queryResult({
          data: makeRace({ abilityBonuses: null as unknown as SrdRace['abilityBonuses'] }),
        })
      );

      renderPage();

      expect(screen.queryByRole('heading', { name: 'Ability Bonuses' })).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Elf');
    });

    it('omits the description when the race has none', () => {
      mockUseApiQuery.mockReturnValue(queryResult({ data: makeRace({ description: undefined }) }));

      renderPage();

      expect(screen.queryByText('A graceful people of the ancient woods.')).not.toBeInTheDocument();
    });

    it('omits the Traits section when the race has none', () => {
      mockUseApiQuery.mockReturnValue(queryResult({ data: makeRace({ traits: [] }) }));

      renderPage();

      expect(screen.queryByRole('heading', { name: 'Traits' })).not.toBeInTheDocument();
    });

    it('renders a trait without a print toggle when it carries no id', () => {
      mockUseApiQuery.mockReturnValue(
        queryResult({
          data: makeRace({
            traits: [{ name: 'Keen Senses', description: 'Proficiency in Perception.' }],
          }),
        })
      );

      renderPage();

      expect(screen.getByText('Keen Senses.')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Add Keen Senses to print set' })
      ).not.toBeInTheDocument();
    });

    it('renders a trait with no description', () => {
      mockUseApiQuery.mockReturnValue(
        queryResult({
          data: makeRace({ traits: [{ id: 'trait-bare', name: 'Trance' }] }),
        })
      );

      renderPage();

      expect(screen.getByText('Trance.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Add Trance to print set' })).toBeInTheDocument();
    });

    it('omits the Age, Alignment and Size headings when those fields are absent', () => {
      mockUseApiQuery.mockReturnValue(
        queryResult({
          data: makeRace({ age: undefined, alignment: undefined, sizeDescription: undefined }),
        })
      );

      renderPage();

      expect(screen.queryByRole('heading', { name: 'Age' })).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Alignment' })).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Size' })).not.toBeInTheDocument();
      // The size still shows in the subtitle.
      expect(screen.getByText('Speed: 30 ft · Size: Medium')).toBeInTheDocument();
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
