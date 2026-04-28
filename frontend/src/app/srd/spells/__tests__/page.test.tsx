import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SpellListPage from '../page';
import type { SrdSpell, PaginatedResponse } from '@/lib/types';

// ── Mocks ────────────────────────────────────────────────────────────────────

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

// ── Fixtures ─────────────────────────────────────────────────────────────────

const fireball: SrdSpell = {
  id: 'spell-1',
  name: 'Fireball',
  level: 3,
  school: 'Evocation',
  castingTime: '1 action',
  range: '150 feet',
  components: 'V, S, M',
  duration: 'Instantaneous',
  description:
    'A bright streak flashes from your pointing finger to a point you choose within range and then blossoms with a low roar into an explosion of flame.',
  classes: ['Sorcerer', 'Wizard'],
  ritual: false,
  concentration: false,
  material: 'A tiny ball of bat guano and sulfur',
  higherLevels:
    'When you cast this spell using a spell slot of 4th level or higher, the damage increases by 1d6 for each slot level above 3rd.',
  source: 'SRD 5.2.1',
};

const bless: SrdSpell = {
  id: 'spell-2',
  name: 'Bless',
  level: 1,
  school: 'Enchantment',
  castingTime: '1 action',
  range: '30 feet',
  components: 'V, S, M',
  duration: 'Up to 1 minute',
  description:
    'You bless up to three creatures of your choice within range.',
  classes: ['Cleric', 'Paladin'],
  ritual: false,
  concentration: true,
  material: 'A sprinkling of holy water',
  source: 'SRD 5.2.1',
};

const prestidigitation: SrdSpell = {
  id: 'spell-3',
  name: 'Prestidigitation',
  level: 0,
  school: 'Transmutation',
  castingTime: '1 action',
  range: 'Self',
  components: 'V, S',
  duration: 'Up to 1 hour',
  description: 'This spell is a minor magical trick.',
  classes: ['Bard', 'Sorcerer', 'Warlock', 'Wizard'],
  ritual: true,
  concentration: false,
  source: 'SRD 5.2.1',
};

function makePaginatedResponse(spells: SrdSpell[]): PaginatedResponse<SrdSpell> {
  return {
    data: spells,
    total: spells.length,
    page: 1,
    lastPage: 1,
    limit: 20,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('SpellListPage', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue(makePaginatedResponse([fireball, bless, prestidigitation]));
  });

  describe('rendering', () => {
    it('renders the heading "Spells"', async () => {
      render(<SpellListPage />);
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /^Spells$/i })).toBeInTheDocument();
      });
    });

    it('renders spell count', async () => {
      render(<SpellListPage />);
      await waitFor(() => {
        expect(screen.getByText('3 spells found')).toBeInTheDocument();
      });
    });

    it('renders spell names', async () => {
      render(<SpellListPage />);
      await waitFor(() => {
        expect(screen.getByText('Fireball')).toBeInTheDocument();
        expect(screen.getByText('Bless')).toBeInTheDocument();
        expect(screen.getByText('Prestidigitation')).toBeInTheDocument();
      });
    });

    it('renders filter inputs', async () => {
      render(<SpellListPage />);
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search spells...')).toBeInTheDocument();
      });
    });
  });

  describe('collapsed state', () => {
    it('shows level, school, and casting time in collapsed state', async () => {
      render(<SpellListPage />);
      await waitFor(() => {
        expect(screen.getByText('Level 3')).toBeInTheDocument();
        expect(screen.getByText('Evocation')).toBeInTheDocument();
      });
    });

    it('shows cantrip label for level 0 spells', async () => {
      render(<SpellListPage />);
      await waitFor(() => {
        expect(screen.getByText('Cantrip')).toBeInTheDocument();
      });
    });

    it('shows concentration badge when true', async () => {
      render(<SpellListPage />);
      await waitFor(() => {
        expect(screen.getByText('Concentration')).toBeInTheDocument();
      });
    });

    it('shows ritual badge when true', async () => {
      render(<SpellListPage />);
      await waitFor(() => {
        expect(screen.getByText('Ritual')).toBeInTheDocument();
      });
    });

    it('does not show description in collapsed state', async () => {
      render(<SpellListPage />);
      await waitFor(() => {
        expect(screen.getByText('Fireball')).toBeInTheDocument();
      });
      expect(screen.queryByText(/A bright streak flashes/)).not.toBeInTheDocument();
    });

    it('does not show range in collapsed state', async () => {
      render(<SpellListPage />);
      await waitFor(() => {
        expect(screen.getByText('Fireball')).toBeInTheDocument();
      });
      expect(screen.queryByText('150 feet')).not.toBeInTheDocument();
    });
  });

  describe('expand on click', () => {
    it('shows description when spell is expanded', async () => {
      const user = userEvent.setup();
      render(<SpellListPage />);
      await waitFor(() => {
        expect(screen.getByText('Fireball')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Fireball'));

      expect(screen.getByText(/A bright streak flashes/)).toBeInTheDocument();
    });

    it('shows range when spell is expanded', async () => {
      const user = userEvent.setup();
      render(<SpellListPage />);
      await waitFor(() => {
        expect(screen.getByText('Fireball')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Fireball'));

      expect(screen.getByText('150 feet')).toBeInTheDocument();
    });

    it('shows components when spell is expanded', async () => {
      const user = userEvent.setup();
      render(<SpellListPage />);
      await waitFor(() => {
        expect(screen.getByText('Fireball')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Fireball'));

      expect(screen.getByText(/V, S, M/)).toBeInTheDocument();
    });

    it('shows duration when spell is expanded', async () => {
      const user = userEvent.setup();
      render(<SpellListPage />);
      await waitFor(() => {
        expect(screen.getByText('Fireball')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Fireball'));

      expect(screen.getByText('Instantaneous')).toBeInTheDocument();
    });

    it('shows class badges when spell is expanded', async () => {
      const user = userEvent.setup();
      render(<SpellListPage />);
      await waitFor(() => {
        expect(screen.getByText('Fireball')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Fireball'));

      const classesHeading = screen.getByText('Classes');
      const classesSection = classesHeading.closest('div')!;
      expect(classesSection.textContent).toContain('Sorcerer');
      expect(classesSection.textContent).toContain('Wizard');
    });
  });

  describe('collapse on click', () => {
    it('hides detail section when clicking an expanded spell again', async () => {
      const user = userEvent.setup();
      render(<SpellListPage />);
      await waitFor(() => {
        expect(screen.getByText('Fireball')).toBeInTheDocument();
      });

      // Expand
      await user.click(screen.getByText('Fireball'));
      expect(screen.getByText(/A bright streak flashes/)).toBeInTheDocument();

      // Collapse
      await user.click(screen.getByText('Fireball'));
      expect(screen.queryByText(/A bright streak flashes/)).not.toBeInTheDocument();
    });
  });

  describe('multiple expand', () => {
    it('allows multiple spells to be expanded simultaneously', async () => {
      const user = userEvent.setup();
      render(<SpellListPage />);
      await waitFor(() => {
        expect(screen.getByText('Fireball')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Fireball'));
      await user.click(screen.getByText('Bless'));

      expect(screen.getByText(/A bright streak flashes/)).toBeInTheDocument();
      expect(screen.getByText(/You bless up to three creatures/)).toBeInTheDocument();
    });
  });

  describe('conditional fields', () => {
    it('shows higherLevels when present', async () => {
      const user = userEvent.setup();
      render(<SpellListPage />);
      await waitFor(() => {
        expect(screen.getByText('Fireball')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Fireball'));

      expect(screen.getByText('At Higher Levels')).toBeInTheDocument();
      expect(screen.getByText(/the damage increases by 1d6/)).toBeInTheDocument();
    });

    it('does not show higherLevels section when not present', async () => {
      const user = userEvent.setup();
      render(<SpellListPage />);
      await waitFor(() => {
        expect(screen.getByText('Prestidigitation')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Prestidigitation'));

      expect(screen.queryByText('At Higher Levels')).not.toBeInTheDocument();
    });

    it('shows material details when present', async () => {
      const user = userEvent.setup();
      render(<SpellListPage />);
      await waitFor(() => {
        expect(screen.getByText('Fireball')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Fireball'));

      expect(screen.getByText(/A tiny ball of bat guano and sulfur/)).toBeInTheDocument();
    });

    it('does not show material when not present', async () => {
      const user = userEvent.setup();
      render(<SpellListPage />);
      await waitFor(() => {
        expect(screen.getByText('Prestidigitation')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Prestidigitation'));

      expect(screen.queryByText('Material')).not.toBeInTheDocument();
    });
  });
});
