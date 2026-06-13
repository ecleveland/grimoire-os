import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SrdSearchPage from '../page';
import { PrintTrayProvider, PRINT_TRAY_STORAGE_KEY } from '@/lib/print-tray-context';
import type { PaginatedResponse, SrdSpell, SrdFeat, SrdItem } from '@/lib/types';
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

const blessSpell: SrdSpell = {
  id: 'sp-2',
  name: 'Bless',
  level: 1,
  school: 'Enchantment',
  castingTime: '1 action',
  range: '30 feet',
  components: 'V, S, M',
  duration: 'Up to 1 minute',
  description: 'You bless up to three creatures.',
  classes: ['Cleric', 'Paladin'],
  ritual: false,
  concentration: true,
  material: 'A sprinkling of holy water',
  source: 'SRD 5.2.1',
};

const detectMagicSpell: SrdSpell = {
  id: 'sp-3',
  name: 'Detect Magic',
  level: 1,
  school: 'Divination',
  castingTime: '1 action',
  range: 'Self',
  components: 'V, S',
  duration: 'Up to 10 minutes',
  description: 'You sense the presence of magic.',
  classes: ['Bard', 'Cleric'],
  ritual: true,
  concentration: false,
  source: 'SRD 5.2.1',
};

const toughFeat: SrdFeat = {
  id: 'feat-2',
  name: 'Tough',
  description: 'Your hit point maximum increases.',
  prerequisite: undefined,
  benefits: undefined,
  category: 'General',
  repeatable: false,
  source: 'SRD 5.2.1',
};

const bagOfTricksItem: SrdItem = {
  id: 'item-1',
  name: 'Bag of Tricks',
  category: 'Wondrous Item',
  rarity: 'Uncommon',
  cost: '500 gp',
  description: 'This bag appears empty.',
  properties: ['Mysterious'],
  requiresAttunement: true,
  isMagic: true,
  source: 'SRD 5.2.1',
};

const fireball: UnifiedSearchHit = { kind: 'spell', data: fireballSpell };
const bagOfTricks: UnifiedSearchHit = { kind: 'item', data: bagOfTricksItem };
const bless: UnifiedSearchHit = { kind: 'spell', data: blessSpell };
const detectMagic: UnifiedSearchHit = { kind: 'spell', data: detectMagicSpell };
const sharpshooter: UnifiedSearchHit = { kind: 'feat', data: sharpshooterFeat };
const tough: UnifiedSearchHit = { kind: 'feat', data: toughFeat };
const sneakAttack: UnifiedSearchHit = { kind: 'feature', data: sneakAttackFeature };

function paginated(hits: UnifiedSearchHit[]): PaginatedResponse<UnifiedSearchHit> {
  return { data: hits, total: hits.length, page: 1, lastPage: 1 };
}

function renderPage() {
  return render(
    <PrintTrayProvider>
      <SrdSearchPage />
    </PrintTrayProvider>
  );
}

/** The persisted tray contents, for asserting tray state after a toggle. */
function storedTray(): unknown {
  return JSON.parse(localStorage.getItem(PRINT_TRAY_STORAGE_KEY) ?? '[]');
}

describe('SrdSearchPage', () => {
  beforeEach(() => {
    localStorage.clear();
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue(paginated([fireball, sharpshooter, sneakAttack]));
  });

  describe('print set selection', () => {
    it('toggles a spell hit into the tray', async () => {
      const user = userEvent.setup();
      renderPage();
      await waitFor(() => expect(screen.getByText('Fireball')).toBeInTheDocument());

      await user.click(screen.getByRole('button', { name: 'Add Fireball to print set' }));

      expect(storedTray()).toEqual([{ type: 'spell', id: 'sp-1' }]);
      expect(
        screen.getByRole('button', { name: 'Remove Fireball from print set' })
      ).toHaveAttribute('aria-pressed', 'true');
    });

    it('toggles a feature hit into the tray', async () => {
      const user = userEvent.setup();
      renderPage();
      await waitFor(() => expect(screen.getByText('Sneak Attack')).toBeInTheDocument());

      await user.click(screen.getByRole('button', { name: 'Add Sneak Attack to print set' }));

      expect(storedTray()).toEqual([{ type: 'feature', id: 'cf-1' }]);
    });

    it('renders no toggle on feat hits (feats are not printable)', async () => {
      renderPage();
      await waitFor(() => expect(screen.getByText('Sharpshooter')).toBeInTheDocument());

      expect(
        screen.queryByRole('button', { name: 'Add Sharpshooter to print set' })
      ).not.toBeInTheDocument();
    });

    it('toggling the affordance does not expand the result card', async () => {
      const user = userEvent.setup();
      renderPage();
      await waitFor(() => expect(screen.getByText('Fireball')).toBeInTheDocument());

      await user.click(screen.getByRole('button', { name: 'Add Fireball to print set' }));

      expect(screen.queryByText(/A bright streak flashes/)).not.toBeInTheDocument();
    });
  });

  describe('rendering', () => {
    it('renders the heading "Search SRD"', async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Search SRD/i })).toBeInTheDocument();
      });
    });

    it('shows a search input', async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Search spells, feats/i)).toBeInTheDocument();
      });
    });

    it('shows type-filter chips for Spells, Feats, Items, and Features', async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Spells' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Feats' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Items' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Features' })).toBeInTheDocument();
      });
    });
  });

  describe('result rendering (collapsed)', () => {
    it('renders the spell hit with level and school', async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Fireball')).toBeInTheDocument();
      });
      expect(screen.getByText(/Level 3/)).toBeInTheDocument();
      expect(screen.getByText(/Evocation/)).toBeInTheDocument();
    });

    it('renders the feat hit', async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Sharpshooter')).toBeInTheDocument();
      });
    });

    it('renders the feature hit with parent breadcrumb', async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Sneak Attack')).toBeInTheDocument();
      });
      expect(screen.getByText(/Rogue/)).toBeInTheDocument();
    });

    it('does not show spell description before expanding', async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Fireball')).toBeInTheDocument();
      });
      expect(screen.queryByText(/A bright streak flashes/)).not.toBeInTheDocument();
    });
  });

  describe('expand on click — spell', () => {
    it('shows spell description, range, components, duration when expanded', async () => {
      const user = userEvent.setup();
      renderPage();
      await waitFor(() => expect(screen.getByText('Fireball')).toBeInTheDocument());

      await user.click(screen.getByText('Fireball'));

      expect(screen.getByText(/A bright streak flashes/)).toBeInTheDocument();
      expect(screen.getByText('150 feet')).toBeInTheDocument();
      expect(screen.getByText('V, S, M')).toBeInTheDocument();
      expect(screen.getByText('Instantaneous')).toBeInTheDocument();
    });

    it('shows higherLevels and material when present', async () => {
      const user = userEvent.setup();
      renderPage();
      await waitFor(() => expect(screen.getByText('Fireball')).toBeInTheDocument());

      await user.click(screen.getByText('Fireball'));

      expect(screen.getByText('At Higher Levels')).toBeInTheDocument();
      expect(screen.getByText(/damage increases by 1d6/)).toBeInTheDocument();
      expect(screen.getByText(/A tiny ball of bat guano/)).toBeInTheDocument();
    });

    it('shows class badges when expanded', async () => {
      const user = userEvent.setup();
      renderPage();
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
      renderPage();
      await waitFor(() => expect(screen.getByText('Sharpshooter')).toBeInTheDocument());

      await user.click(screen.getByText('Sharpshooter'));

      expect(screen.getByText('You have mastered ranged weapons.')).toBeInTheDocument();
      expect(screen.getByText('No long-range disadvantage')).toBeInTheDocument();
      expect(screen.getByText('Ignore half/three-quarters cover')).toBeInTheDocument();
    });

    it('shows feat category in collapsed metadata', async () => {
      renderPage();
      await waitFor(() => expect(screen.getByText('Sharpshooter')).toBeInTheDocument());
      expect(screen.getByText(/General/)).toBeInTheDocument();
    });
  });

  describe('expand on click — feature', () => {
    it('shows feature description and a parent drilldown link when expanded', async () => {
      const user = userEvent.setup();
      renderPage();
      await waitFor(() => expect(screen.getByText('Sneak Attack')).toBeInTheDocument());

      await user.click(screen.getByText('Sneak Attack'));

      expect(screen.getByText(/Once per turn, deal extra damage/)).toBeInTheDocument();
      const drilldown = screen.getByRole('link', { name: /Open Rogue/i });
      expect(drilldown).toHaveAttribute('href', '/srd/classes/cls-1');
    });
  });

  describe('conditional rendering — spell badges', () => {
    it('shows the Concentration badge when spell.concentration is true', async () => {
      mockApiFetch.mockResolvedValue(paginated([bless]));
      renderPage();
      await waitFor(() => expect(screen.getByText('Bless')).toBeInTheDocument());
      expect(screen.getByText('Concentration')).toBeInTheDocument();
    });

    it('shows the Ritual badge when spell.ritual is true', async () => {
      mockApiFetch.mockResolvedValue(paginated([detectMagic]));
      renderPage();
      await waitFor(() => expect(screen.getByText('Detect Magic')).toBeInTheDocument());
      expect(screen.getByText('Ritual')).toBeInTheDocument();
    });

    it('does not show Concentration or Ritual badges when both flags are false', async () => {
      // fireballSpell has both flags false
      renderPage();
      await waitFor(() => expect(screen.getByText('Fireball')).toBeInTheDocument());
      expect(screen.queryByText('Concentration')).not.toBeInTheDocument();
      expect(screen.queryByText('Ritual')).not.toBeInTheDocument();
    });
  });

  describe('homebrew spell badge (VEG-294)', () => {
    const homebrewSpell: UnifiedSearchHit = {
      kind: 'spell',
      data: {
        ...fireballSpell,
        id: 'sp-hb',
        name: 'Soul Bonfire',
        contentSource: 'homebrew',
        createdById: 'u1',
        source: 'Homebrew',
      },
    };

    it('shows the Homebrew badge on a homebrew spell hit', async () => {
      mockApiFetch.mockResolvedValue(paginated([homebrewSpell]));
      renderPage();

      const heading = await screen.findByText('Soul Bonfire');
      expect(within(heading.closest('h2')!).getByText('Homebrew')).toBeInTheDocument();
    });

    it('does not show the Homebrew badge on an SRD spell hit', async () => {
      mockApiFetch.mockResolvedValue(paginated([fireball]));
      renderPage();

      const heading = await screen.findByText('Fireball');
      expect(within(heading.closest('h2')!).queryByText('Homebrew')).not.toBeInTheDocument();
    });
  });

  describe('homebrew feat badge (VEG-295)', () => {
    const homebrewFeat: UnifiedSearchHit = {
      kind: 'feat',
      data: {
        ...sharpshooterFeat,
        id: 'feat-hb',
        name: 'Lucky Dodge',
        contentSource: 'homebrew',
        createdById: 'u1',
        source: 'Homebrew',
      },
    };

    it('shows the Homebrew badge on a homebrew feat hit', async () => {
      mockApiFetch.mockResolvedValue(paginated([homebrewFeat]));
      renderPage();

      const heading = await screen.findByText('Lucky Dodge');
      expect(within(heading.closest('h2')!).getByText('Homebrew')).toBeInTheDocument();
    });

    it('does not show the Homebrew badge on an SRD feat hit', async () => {
      mockApiFetch.mockResolvedValue(paginated([sharpshooter]));
      renderPage();

      const heading = await screen.findByText('Sharpshooter');
      expect(within(heading.closest('h2')!).queryByText('Homebrew')).not.toBeInTheDocument();
    });
  });

  describe('item hits (VEG-296)', () => {
    it('renders the item hit with category, rarity, and attunement badge', async () => {
      mockApiFetch.mockResolvedValue(paginated([bagOfTricks]));
      renderPage();

      expect(await screen.findByText('Bag of Tricks')).toBeInTheDocument();
      expect(screen.getByText(/Wondrous Item · Uncommon/)).toBeInTheDocument();
      expect(screen.getByText('Requires Attunement')).toBeInTheDocument();
    });

    it('shows the item facts, properties, and description when expanded', async () => {
      const user = userEvent.setup();
      mockApiFetch.mockResolvedValue(paginated([bagOfTricks]));
      renderPage();
      await waitFor(() => expect(screen.getByText('Bag of Tricks')).toBeInTheDocument());

      await user.click(screen.getByText('Bag of Tricks'));

      expect(screen.getByText(/Cost: 500 gp/)).toBeInTheDocument();
      expect(screen.getByText('Mysterious')).toBeInTheDocument();
      expect(screen.getByText('This bag appears empty.')).toBeInTheDocument();
    });

    it('offers a print toggle on item hits (items are printable)', async () => {
      const user = userEvent.setup();
      mockApiFetch.mockResolvedValue(paginated([bagOfTricks]));
      renderPage();
      await waitFor(() => expect(screen.getByText('Bag of Tricks')).toBeInTheDocument());

      await user.click(screen.getByRole('button', { name: 'Add Bag of Tricks to print set' }));

      expect(storedTray()).toEqual([{ type: 'item', id: 'item-1' }]);
    });

    it('shows the Homebrew badge on a homebrew item hit', async () => {
      const homebrewItem: UnifiedSearchHit = {
        kind: 'item',
        data: {
          ...bagOfTricksItem,
          id: 'item-hb',
          name: 'Cloak of Whispers',
          contentSource: 'homebrew',
          createdById: 'u1',
          source: 'Homebrew',
        },
      };
      mockApiFetch.mockResolvedValue(paginated([homebrewItem]));
      renderPage();

      const heading = await screen.findByText('Cloak of Whispers');
      expect(within(heading.closest('h2')!).getByText('Homebrew')).toBeInTheDocument();
    });

    it('does not show the Homebrew badge on an SRD item hit', async () => {
      mockApiFetch.mockResolvedValue(paginated([bagOfTricks]));
      renderPage();

      const heading = await screen.findByText('Bag of Tricks');
      expect(within(heading.closest('h2')!).queryByText('Homebrew')).not.toBeInTheDocument();
    });

    it('passes item sub-filters to the API when only Items is enabled', async () => {
      const user = userEvent.setup();
      renderPage();
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());

      await user.click(screen.getByRole('button', { name: 'Spells' }));
      await user.click(screen.getByRole('button', { name: 'Feats' }));
      await user.click(screen.getByRole('button', { name: 'Features' }));

      mockApiFetch.mockClear();
      await user.selectOptions(screen.getByLabelText('Rarity'), 'Rare');
      await user.selectOptions(screen.getByLabelText('Magic'), 'true');

      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
      const url = mockApiFetch.mock.calls.at(-1)?.[0] as string;
      expect(url).toContain('types=item');
      expect(url).toContain('rarity=Rare');
      expect(url).toContain('isMagic=true');
    });
  });

  describe('conditional rendering — spell expanded fields', () => {
    it('does not render the Material section when spell.material is absent', async () => {
      const user = userEvent.setup();
      mockApiFetch.mockResolvedValue(paginated([detectMagic]));
      renderPage();
      await waitFor(() => expect(screen.getByText('Detect Magic')).toBeInTheDocument());

      await user.click(screen.getByText('Detect Magic'));

      expect(screen.queryByText('Material')).not.toBeInTheDocument();
    });

    it('does not render the At Higher Levels section when spell.higherLevels is absent', async () => {
      const user = userEvent.setup();
      mockApiFetch.mockResolvedValue(paginated([detectMagic]));
      renderPage();
      await waitFor(() => expect(screen.getByText('Detect Magic')).toBeInTheDocument());

      await user.click(screen.getByText('Detect Magic'));

      expect(screen.queryByText('At Higher Levels')).not.toBeInTheDocument();
    });
  });

  describe('conditional rendering — feat benefits', () => {
    it('does not render the Benefits section when feat.benefits is undefined', async () => {
      const user = userEvent.setup();
      mockApiFetch.mockResolvedValue(paginated([tough]));
      renderPage();
      await waitFor(() => expect(screen.getByText('Tough')).toBeInTheDocument());

      await user.click(screen.getByText('Tough'));

      expect(screen.queryByText('Benefits')).not.toBeInTheDocument();
      expect(screen.getByText('Your hit point maximum increases.')).toBeInTheDocument();
    });

    it('does not render the Benefits section when feat.benefits is an empty array', async () => {
      const user = userEvent.setup();
      const featWithEmptyBenefits: UnifiedSearchHit = {
        kind: 'feat',
        data: { ...toughFeat, id: 'feat-3', name: 'Resilient', benefits: [] },
      };
      mockApiFetch.mockResolvedValue(paginated([featWithEmptyBenefits]));
      renderPage();
      await waitFor(() => expect(screen.getByText('Resilient')).toBeInTheDocument());

      await user.click(screen.getByText('Resilient'));

      expect(screen.queryByText('Benefits')).not.toBeInTheDocument();
    });
  });

  describe('expand/collapse toggle', () => {
    it('hides detail when clicking an expanded card again', async () => {
      const user = userEvent.setup();
      renderPage();
      await waitFor(() => expect(screen.getByText('Fireball')).toBeInTheDocument());

      await user.click(screen.getByText('Fireball'));
      expect(screen.getByText(/A bright streak flashes/)).toBeInTheDocument();

      await user.click(screen.getByText('Fireball'));
      expect(screen.queryByText(/A bright streak flashes/)).not.toBeInTheDocument();
    });

    it('allows multiple cards across kinds to be expanded simultaneously', async () => {
      const user = userEvent.setup();
      renderPage();
      await waitFor(() => expect(screen.getByText('Fireball')).toBeInTheDocument());

      await user.click(screen.getByText('Fireball'));
      await user.click(screen.getByText('Sharpshooter'));

      expect(screen.getByText(/A bright streak flashes/)).toBeInTheDocument();
      expect(screen.getByText('You have mastered ranged weapons.')).toBeInTheDocument();
    });
  });

  describe('type filter', () => {
    it('hides spell sub-filters by default until Spells is the only enabled type', async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Spells' })).toBeInTheDocument();
      });
      expect(screen.queryByLabelText('Spell School')).not.toBeInTheDocument();
    });

    it('shows spell sub-filters (class, level, school) when only Spells is enabled', async () => {
      const user = userEvent.setup();
      renderPage();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Spells' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Feats' }));
      await user.click(screen.getByRole('button', { name: 'Items' }));
      await user.click(screen.getByRole('button', { name: 'Features' }));

      expect(screen.getByLabelText('Spell Class')).toBeInTheDocument();
      expect(screen.getByLabelText('Spell School')).toBeInTheDocument();
      expect(screen.getByLabelText('Spell Level')).toBeInTheDocument();
    });

    it('shows feat sub-filters (category, prerequisite, repeatable) when only Feats is enabled', async () => {
      const user = userEvent.setup();
      renderPage();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Feats' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Spells' }));
      await user.click(screen.getByRole('button', { name: 'Items' }));
      await user.click(screen.getByRole('button', { name: 'Features' }));

      expect(screen.getByLabelText('Feat Category')).toBeInTheDocument();
      expect(screen.getByLabelText('Prerequisite')).toBeInTheDocument();
      expect(screen.getByLabelText('Repeatable')).toBeInTheDocument();
    });

    it('shows item sub-filters (category, rarity, magic) when only Items is enabled', async () => {
      const user = userEvent.setup();
      renderPage();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Items' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Spells' }));
      await user.click(screen.getByRole('button', { name: 'Feats' }));
      await user.click(screen.getByRole('button', { name: 'Features' }));

      expect(screen.getByLabelText('Item Category')).toBeInTheDocument();
      expect(screen.getByLabelText('Rarity')).toBeInTheDocument();
      expect(screen.getByLabelText('Magic')).toBeInTheDocument();
    });

    it('shows feature sub-filters when only Features is enabled', async () => {
      const user = userEvent.setup();
      renderPage();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Features' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Spells' }));
      await user.click(screen.getByRole('button', { name: 'Feats' }));
      await user.click(screen.getByRole('button', { name: 'Items' }));

      expect(screen.getByLabelText('Parent Type')).toBeInTheDocument();
    });
  });

  describe('api interaction', () => {
    it('calls /srd/search on mount', async () => {
      renderPage();
      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalled();
      });
      expect(mockApiFetch.mock.calls[0][0]).toMatch(/^\/srd\/search\?/);
    });

    it('passes selected types to the API when not all enabled', async () => {
      const user = userEvent.setup();
      renderPage();
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
