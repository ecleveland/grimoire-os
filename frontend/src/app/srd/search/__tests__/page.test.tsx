import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SrdSearchPage from '../page';
import type { PaginatedResponse } from '@/lib/types';
import type { UnifiedSearchHit } from '@/lib/srd-search';

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

const fireball: UnifiedSearchHit = {
  kind: 'spell',
  id: 'sp-1',
  name: 'Fireball',
  level: 3,
  school: 'Evocation',
  description: 'A bright streak.',
};

const sharpshooter: UnifiedSearchHit = {
  kind: 'feat',
  id: 'feat-1',
  name: 'Sharpshooter',
  prerequisite: null,
  description: 'You have mastered ranged weapons.',
};

const sneakAttack: UnifiedSearchHit = {
  kind: 'feature',
  id: 'cf-1',
  name: 'Sneak Attack',
  level: 1,
  description: 'Once per turn, deal extra damage.',
  parent: { kind: 'class', id: 'cls-1', name: 'Rogue' },
};

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

  describe('result rendering', () => {
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

    it('tags each hit with its kind label (Spell / Feat / Feature)', async () => {
      render(<SrdSearchPage />);
      await waitFor(() => {
        expect(screen.getByText('Fireball')).toBeInTheDocument();
      });
      expect(screen.getByText('Spell')).toBeInTheDocument();
      expect(screen.getByText('Feat')).toBeInTheDocument();
      expect(screen.getByText('Feature')).toBeInTheDocument();
    });
  });

  describe('type filter', () => {
    it('hides spell sub-filters by default until Spells is the only enabled type', async () => {
      render(<SrdSearchPage />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Spells' })).toBeInTheDocument();
      });
      // With all types enabled, no spell-specific sub-filters
      expect(screen.queryByLabelText('Spell School')).not.toBeInTheDocument();
    });

    it('shows spell sub-filters when only Spells is enabled', async () => {
      const user = userEvent.setup();
      render(<SrdSearchPage />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Spells' })).toBeInTheDocument();
      });

      // Click Feats and Features to disable them — leaves only Spells enabled.
      await user.click(screen.getByRole('button', { name: 'Feats' }));
      await user.click(screen.getByRole('button', { name: 'Features' }));

      expect(screen.getByLabelText('Spell School')).toBeInTheDocument();
      expect(screen.getByLabelText('Spell Level')).toBeInTheDocument();
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
