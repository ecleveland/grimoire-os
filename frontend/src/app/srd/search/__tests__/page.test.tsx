import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SrdSearchPage from '../page';
import type { PaginatedResponse, SrdSpell, SrdFeat } from '@/lib/types';
import type { UnifiedFeatureData, UnifiedSearchHit } from '@/lib/srd-search';

const mockApiFetch = vi.fn();

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}));

vi.mock('@/components/Pagination', () => ({
  default: () => <div data-testid="pagination" />,
}));

const fireballSpell: SrdSpell = {
  id: 'sp-1',
  name: 'Fireball',
  level: 3,
  school: 'Evocation',
  castingTime: '1 action',
  range: '150 feet',
  components: 'V, S, M',
  duration: 'Instantaneous',
  description: 'A bright streak flashes from your pointing finger.',
  classes: ['Sorcerer', 'Wizard'],
  ritual: false,
  concentration: false,
  material: 'A tiny ball of bat guano and sulfur',
  higherLevels: 'When cast with a higher slot, damage increases by 1d6.',
  source: 'SRD 5.2.1',
};

const sharpshooterFeat: SrdFeat = {
  id: 'feat-1',
  name: 'Sharpshooter',
  description: 'You have mastered ranged weapons.',
  prerequisite: undefined,
  benefits: ['No long-range disadvantage', 'Ignore half/three-quarters cover'],
  category: 'General',
  repeatable: false,
  source: 'SRD 5.2.1',
};

const sneakAttackFeature: UnifiedFeatureData = {
  id: 'cf-1',
  name: 'Sneak Attack',
  level: 1,
  description: 'Once per turn, deal extra damage to a creature you have advantage against.',
  parent: { kind: 'class', id: 'cls-1', name: 'Rogue' },
};

const fireball: UnifiedSearchHit = { kind: 'spell', data: fireballSpell };
const sharpshooter: UnifiedSearchHit = { kind: 'feat', data: sharpshooterFeat };
const sneakAttack: UnifiedSearchHit = { kind: 'feature', data: sneakAttackFeature };

function paginated(hits: UnifiedSearchHit[]): PaginatedResponse<UnifiedSearchHit> {
  return { data: hits, total: hits.length, page: 1, lastPage: 1 };
}

describe('SrdSearchPage', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue(paginated([fireball, sharpshooter, sneakAttack]));
  });

  describe('rendering', () => {
    it('renders the heading "Search SRD"', async () => {
      render(<SrdSearchPage />);
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Search SRD/i })).toBeInTheDocument();
      });
    });

    it('shows a search input', async () => {
      render(<SrdSearchPage />);
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Search spells, feats/i)).toBeInTheDocument();
      });
    });

    it('shows type-filter chips for Spells, Feats, and Features', async () => {
      render(<SrdSearchPage />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Spells' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Feats' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Features' })).toBeInTheDocument();
      });
    });
  });

  describe('result rendering (collapsed)', () => {
    it('renders the spell hit with level and school', async () => {
      render(<SrdSearchPage />);
      await waitFor(() => {
        expect(screen.getByText('Fireball')).toBeInTheDocument();
      });
      expect(screen.getByText(/Level 3/)).toBeInTheDocument();
      expect(screen.getByText(/Evocation/)).toBeInTheDocument();
    });

    it('renders the feat hit', async () => {
      render(<SrdSearchPage />);
      await waitFor(() => {
        expect(screen.getByText('Sharpshooter')).toBeInTheDocument();
      });
    });

    it('renders the feature hit with parent breadcrumb', async () => {
      render(<SrdSearchPage />);
      await waitFor(() => {
        expect(screen.getByText('Sneak Attack')).toBeInTheDocument();
      });
      expect(screen.getByText(/Rogue/)).toBeInTheDocument();
    });

    it('does not show spell description before expanding', async () => {
      render(<SrdSearchPage />);
      await waitFor(() => {
        expect(screen.getByText('Fireball')).toBeInTheDocument();
      });
      expect(screen.queryByText(/A bright streak flashes/)).not.toBeInTheDocument();
    });
  });

  describe('expand on click — spell', () => {
    it('shows spell description, range, components, duration when expanded', async () => {
      const user = userEvent.setup();
      render(<SrdSearchPage />);
      await waitFor(() => expect(screen.getByText('Fireball')).toBeInTheDocument());

      await user.click(screen.getByText('Fireball'));

      expect(screen.getByText(/A bright streak flashes/)).toBeInTheDocument();
      expect(screen.getByText('150 feet')).toBeInTheDocument();
      expect(screen.getByText('V, S, M')).toBeInTheDocument();
      expect(screen.getByText('Instantaneous')).toBeInTheDocument();
    });

    it('shows higherLevels and material when present', async () => {
      const user = userEvent.setup();
      render(<SrdSearchPage />);
      await waitFor(() => expect(screen.getByText('Fireball')).toBeInTheDocument());

      await user.click(screen.getByText('Fireball'));

      expect(screen.getByText('At Higher Levels')).toBeInTheDocument();
      expect(screen.getByText(/damage increases by 1d6/)).toBeInTheDocument();
      expect(screen.getByText(/A tiny ball of bat guano/)).toBeInTheDocument();
    });

    it('shows class badges when expanded', async () => {
      const user = userEvent.setup();
      render(<SrdSearchPage />);
      await waitFor(() => expect(screen.getByText('Fireball')).toBeInTheDocument());

      await user.click(screen.getByText('Fireball'));

      const heading = screen.getByText('Classes');
      const section = heading.closest('div')!;
      expect(section.textContent).toContain('Sorcerer');
      expect(section.textContent).toContain('Wizard');
    });
  });

  describe('expand on click — feat', () => {
    it('shows feat description and benefits as bullets', async () => {
      const user = userEvent.setup();
      render(<SrdSearchPage />);
      await waitFor(() => expect(screen.getByText('Sharpshooter')).toBeInTheDocument());

      await user.click(screen.getByText('Sharpshooter'));

      expect(screen.getByText('You have mastered ranged weapons.')).toBeInTheDocument();
      expect(screen.getByText('No long-range disadvantage')).toBeInTheDocument();
      expect(screen.getByText('Ignore half/three-quarters cover')).toBeInTheDocument();
    });

    it('shows feat category in collapsed metadata', async () => {
      render(<SrdSearchPage />);
      await waitFor(() => expect(screen.getByText('Sharpshooter')).toBeInTheDocument());
      expect(screen.getByText(/General/)).toBeInTheDocument();
    });
  });

  describe('expand on click — feature', () => {
    it('shows feature description and a parent drilldown link when expanded', async () => {
      const user = userEvent.setup();
      render(<SrdSearchPage />);
      await waitFor(() => expect(screen.getByText('Sneak Attack')).toBeInTheDocument());

      await user.click(screen.getByText('Sneak Attack'));

      expect(screen.getByText(/Once per turn, deal extra damage/)).toBeInTheDocument();
      const drilldown = screen.getByRole('link', { name: /Open Rogue/i });
      expect(drilldown).toHaveAttribute('href', '/srd/classes/cls-1');
    });
  });

  describe('expand/collapse toggle', () => {
    it('hides detail when clicking an expanded card again', async () => {
      const user = userEvent.setup();
      render(<SrdSearchPage />);
      await waitFor(() => expect(screen.getByText('Fireball')).toBeInTheDocument());

      await user.click(screen.getByText('Fireball'));
      expect(screen.getByText(/A bright streak flashes/)).toBeInTheDocument();

      await user.click(screen.getByText('Fireball'));
      expect(screen.queryByText(/A bright streak flashes/)).not.toBeInTheDocument();
    });

    it('allows multiple cards across kinds to be expanded simultaneously', async () => {
      const user = userEvent.setup();
      render(<SrdSearchPage />);
      await waitFor(() => expect(screen.getByText('Fireball')).toBeInTheDocument());

      await user.click(screen.getByText('Fireball'));
      await user.click(screen.getByText('Sharpshooter'));

      expect(screen.getByText(/A bright streak flashes/)).toBeInTheDocument();
      expect(screen.getByText('You have mastered ranged weapons.')).toBeInTheDocument();
    });
  });

  describe('type filter', () => {
    it('hides spell sub-filters by default until Spells is the only enabled type', async () => {
      render(<SrdSearchPage />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Spells' })).toBeInTheDocument();
      });
      expect(screen.queryByLabelText('Spell School')).not.toBeInTheDocument();
    });

    it('shows spell sub-filters (class, level, school) when only Spells is enabled', async () => {
      const user = userEvent.setup();
      render(<SrdSearchPage />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Spells' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Feats' }));
      await user.click(screen.getByRole('button', { name: 'Features' }));

      expect(screen.getByLabelText('Spell Class')).toBeInTheDocument();
      expect(screen.getByLabelText('Spell School')).toBeInTheDocument();
      expect(screen.getByLabelText('Spell Level')).toBeInTheDocument();
    });

    it('shows feat sub-filters (category, prerequisite, repeatable) when only Feats is enabled', async () => {
      const user = userEvent.setup();
      render(<SrdSearchPage />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Feats' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Spells' }));
      await user.click(screen.getByRole('button', { name: 'Features' }));

      expect(screen.getByLabelText('Feat Category')).toBeInTheDocument();
      expect(screen.getByLabelText('Prerequisite')).toBeInTheDocument();
      expect(screen.getByLabelText('Repeatable')).toBeInTheDocument();
    });

    it('shows feature sub-filters when only Features is enabled', async () => {
      const user = userEvent.setup();
      render(<SrdSearchPage />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Features' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Spells' }));
      await user.click(screen.getByRole('button', { name: 'Feats' }));

      expect(screen.getByLabelText('Parent Type')).toBeInTheDocument();
    });
  });

  describe('api interaction', () => {
    it('calls /srd/search on mount', async () => {
      render(<SrdSearchPage />);
      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalled();
      });
      expect(mockApiFetch.mock.calls[0][0]).toMatch(/^\/srd\/search\?/);
    });

    it('passes selected types to the API when not all enabled', async () => {
      const user = userEvent.setup();
      render(<SrdSearchPage />);
      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalled();
      });

      mockApiFetch.mockClear();
      await user.click(screen.getByRole('button', { name: 'Feats' }));
      await user.click(screen.getByRole('button', { name: 'Features' }));

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalled();
      });
      const url = mockApiFetch.mock.calls.at(-1)?.[0] as string;
      expect(url).toContain('types=spell');
    });
  });
});
