import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});
