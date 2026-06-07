import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import PrintMonsterCard from '../PrintMonsterCard';
import { PRINTABLE_MONSTER_ACTION_CAP, PRINTABLE_MONSTER_TRAIT_CAP } from '@grimoire-os/shared';
import type { PrintableMonsterCard } from '@grimoire-os/shared';

function makeCard(over: Partial<PrintableMonsterCard> = {}): PrintableMonsterCard {
  return {
    type: 'monster',
    id: 'monster-1',
    name: 'Ancient Red Dragon',
    size: 'Gargantuan',
    creatureType: 'dragon',
    alignment: 'Chaotic Evil',
    challengeRating: 24,
    experiencePoints: 62000,
    armorClass: 22,
    hitPoints: 546,
    speed: '40 ft., climb 40 ft., fly 80 ft.',
    abilities: { str: 30, dex: 10, con: 29, int: 18, wis: 15, cha: 27 },
    actions: [
      { name: 'Multiattack', description: 'The dragon makes three Rend attacks.' },
      { name: 'Rend', description: 'Melee Attack Roll: +17, reach 15 ft.' },
    ],
    ...over,
  };
}

describe('PrintMonsterCard', () => {
  it('renders the curated header fields: name, CR/XP tag, and the kind line', () => {
    render(<PrintMonsterCard card={makeCard()} />);

    expect(screen.getByText('Ancient Red Dragon')).toBeInTheDocument();
    expect(screen.getByText('CR 24 · 62000 XP')).toBeInTheDocument();
    expect(screen.getByText('Gargantuan dragon · Chaotic Evil')).toBeInTheDocument();
  });

  it('omits XP from the tag when experiencePoints is absent', () => {
    render(<PrintMonsterCard card={makeCard({ experiencePoints: undefined })} />);
    expect(screen.getByText('CR 24')).toBeInTheDocument();
  });

  it('formats fractional CR the 5e way', () => {
    render(
      <PrintMonsterCard card={makeCard({ challengeRating: 0.25, experiencePoints: undefined })} />
    );
    expect(screen.getByText('CR 1/4')).toBeInTheDocument();
  });

  it('renders AC, HP, and speed', () => {
    render(<PrintMonsterCard card={makeCard()} />);

    expect(screen.getByText('AC')).toBeInTheDocument();
    expect(screen.getByText('22')).toBeInTheDocument();
    expect(screen.getByText('HP')).toBeInTheDocument();
    expect(screen.getByText('546')).toBeInTheDocument();
    expect(screen.getByText('Speed')).toBeInTheDocument();
    expect(screen.getByText('40 ft., climb 40 ft., fly 80 ft.')).toBeInTheDocument();
  });

  it('renders the six-ability row with scores and derived modifiers', () => {
    render(<PrintMonsterCard card={makeCard()} />);

    expect(screen.getByText('STR')).toBeInTheDocument();
    expect(screen.getByText('30 (+10)')).toBeInTheDocument();
    expect(screen.getByText('DEX')).toBeInTheDocument();
    expect(screen.getByText('10 (+0)')).toBeInTheDocument();
    expect(screen.getByText('CHA')).toBeInTheDocument();
    expect(screen.getByText('27 (+8)')).toBeInTheDocument();
  });

  it('renders action names and descriptions', () => {
    render(<PrintMonsterCard card={makeCard()} />);

    expect(screen.getByText('Multiattack.')).toBeInTheDocument();
    expect(screen.getByText(/three Rend attacks/)).toBeInTheDocument();
  });

  it('renders traits when present and omits the section when absent', () => {
    const { rerender } = render(
      <PrintMonsterCard
        card={makeCard({
          traits: [{ name: 'Legendary Resistance', description: 'If the dragon fails a save…' }],
        })}
      />
    );
    expect(screen.getByText('Legendary Resistance.')).toBeInTheDocument();

    rerender(<PrintMonsterCard card={makeCard()} />);
    expect(screen.queryByText('Legendary Resistance.')).not.toBeInTheDocument();
  });

  it('defensively trims an over-cap payload to the shared caps', () => {
    const manyActions = Array.from({ length: PRINTABLE_MONSTER_ACTION_CAP + 3 }, (_, i) => ({
      name: `Action ${i + 1}`,
      description: `Description ${i + 1}`,
    }));
    const manyTraits = Array.from({ length: PRINTABLE_MONSTER_TRAIT_CAP + 2 }, (_, i) => ({
      name: `Trait ${i + 1}`,
      description: `Trait description ${i + 1}`,
    }));
    render(<PrintMonsterCard card={makeCard({ actions: manyActions, traits: manyTraits })} />);

    expect(screen.getByText(`Action ${PRINTABLE_MONSTER_ACTION_CAP}.`)).toBeInTheDocument();
    expect(
      screen.queryByText(`Action ${PRINTABLE_MONSTER_ACTION_CAP + 1}.`)
    ).not.toBeInTheDocument();
    expect(screen.getByText(`Trait ${PRINTABLE_MONSTER_TRAIT_CAP}.`)).toBeInTheDocument();
    expect(screen.queryByText(`Trait ${PRINTABLE_MONSTER_TRAIT_CAP + 1}.`)).not.toBeInTheDocument();
  });

  it('renders inside the shared PrintCard chrome (fixed footprint)', () => {
    render(<PrintMonsterCard card={makeCard()} />);

    const card = screen.getByTestId('print-card');
    expect(card.className).toContain('w-[5in]');
    expect(card.className).toContain('h-[3in]');
  });

  // ── Overflow pagination (VEG-275) ─────────────────────────────────────────
  //
  // jsdom has no layout, so geometry is stubbed at the prototype level: the
  // card body reports a fixed capacity and each measured node a fixed height,
  // mimicking a verbose monster (the Aboleth) whose 4th action falls below
  // the card's overflow-hidden fold.
  describe('overflow pagination', () => {
    const GEOMETRY = {
      body: 150, // PrintCard body clientHeight
      chrome: 50, // subtitle + AC/HP/Speed + ability grid block
      heading: 10, // section h4
      entry: 40, // each trait/action <li>
    };

    function stubGeometry() {
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
        configurable: true,
        get(this: HTMLElement) {
          if (this.dataset.measure === 'chrome') return GEOMETRY.chrome;
          if (this.dataset.measure === 'heading') return GEOMETRY.heading;
          if (this.dataset.measure === 'entry') return GEOMETRY.entry;
          return 0;
        },
      });
      Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
        configurable: true,
        get(this: HTMLElement) {
          return this.hasAttribute('data-print-card-body') ? GEOMETRY.body : 0;
        },
      });
    }

    afterEach(() => {
      // The original jsdom getters live on Element.prototype; deleting the
      // HTMLElement.prototype overrides restores them.
      delete (HTMLElement.prototype as { offsetHeight?: unknown }).offsetHeight;
      delete (HTMLElement.prototype as { clientHeight?: unknown }).clientHeight;
    });

    // With the geometry above the usable body is 150 − 4 (pt-1) = 146, so the
    // first card fits the chrome (50) + Actions heading (4 gap + 10) + two
    // 40px entries with their 2px gap — exactly 146 — and the 3rd and 4th
    // actions flow to a continuation card. The exact packing arithmetic is
    // the pure function's concern (see print-card-pagination tests); here we
    // assert that a 4-action monster paginates and the pieces land on the
    // right cards.
    const fourActions = [
      { name: 'Multiattack', description: 'The aboleth makes two Tentacle attacks.' },
      { name: 'Tentacle', description: 'Melee Attack Roll: +9, reach 15 ft.' },
      { name: 'Consume Memories', description: 'Targets one creature charmed or grappled.' },
      { name: 'Dominate Mind', description: 'The aboleth casts Dominate Monster.' },
    ];

    it('renders a single card with no part label when content fits (default jsdom geometry)', () => {
      render(<PrintMonsterCard card={makeCard({ actions: fourActions })} />);

      expect(screen.getAllByTestId('print-card')).toHaveLength(1);
      expect(screen.getByText('Ancient Red Dragon')).toBeInTheDocument();
      expect(screen.queryByText(/1 of/)).not.toBeInTheDocument();
    });

    it('flows overflowing actions onto continuation cards labelled (n of m)', () => {
      stubGeometry();
      render(<PrintMonsterCard card={makeCard({ actions: fourActions })} />);

      const cards = screen.getAllByTestId('print-card');
      expect(cards.length).toBeGreaterThan(1);

      expect(screen.getByText(`Ancient Red Dragon (1 of ${cards.length})`)).toBeInTheDocument();
      expect(screen.getByText(`Ancient Red Dragon (2 of ${cards.length})`)).toBeInTheDocument();

      // Every action is visible somewhere across the card set — nothing is
      // silently clipped (the VEG-275 regression).
      for (const action of fourActions) {
        expect(screen.getByText(`${action.name}.`)).toBeInTheDocument();
      }

      // The stat block renders only on the first card.
      expect(within(cards[0]).getByText('AC')).toBeInTheDocument();
      expect(within(cards[1]).queryByText('AC')).not.toBeInTheDocument();

      // The split section's heading repeats with a continuation marker.
      expect(within(cards[1]).getByText('Actions (cont.)')).toBeInTheDocument();

      // The CR tag repeats on every card so a cut card stays identifiable.
      for (const card of cards) {
        expect(within(card).getByText('CR 24 · 62000 XP')).toBeInTheDocument();
      }
    });

    it('keeps the 4th action visible across the card set instead of clipping it', () => {
      stubGeometry();
      render(<PrintMonsterCard card={makeCard({ actions: fourActions })} />);

      expect(screen.getByText('Dominate Mind.')).toBeInTheDocument();
    });
  });
});
