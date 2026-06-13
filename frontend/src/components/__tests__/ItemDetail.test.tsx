import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ItemDetail from '../ItemDetail';
import type { SrdItem } from '@/lib/types';

function makeItem(over: Partial<SrdItem> = {}): SrdItem {
  return {
    id: 'i1',
    name: 'Chain Mail',
    category: 'Heavy Armor',
    properties: [],
    source: 'SRD 5.2.1',
    contentSource: 'srd',
    ...over,
  };
}

describe('ItemDetail', () => {
  it('renders the stat-line facts, joining damage with its type', () => {
    render(
      <ItemDetail
        item={makeItem({
          cost: '75 gp',
          weight: 55 as unknown as string,
          damage: '1d8',
          damageType: 'Slashing',
          armorClass: '16',
          strengthRequirement: 13,
        })}
      />
    );

    expect(screen.getByText('Cost: 75 gp')).toBeInTheDocument();
    expect(screen.getByText('Weight: 55')).toBeInTheDocument();
    expect(screen.getByText('Damage: 1d8 Slashing')).toBeInTheDocument();
    expect(screen.getByText('Armor Class: 16')).toBeInTheDocument();
    expect(screen.getByText('Strength Requirement: 13')).toBeInTheDocument();
  });

  it('renders damage without a trailing space when damageType is absent', () => {
    render(<ItemDetail item={makeItem({ damage: '1d6' })} />);

    expect(screen.getByText('Damage: 1d6')).toBeInTheDocument();
  });

  it('renders the stealth-disadvantage line only when the flag is set', () => {
    const { rerender } = render(<ItemDetail item={makeItem({ stealthDisadvantage: true })} />);
    expect(screen.getByText(/Disadvantage on Dexterity \(Stealth\) checks/)).toBeInTheDocument();

    rerender(<ItemDetail item={makeItem({ stealthDisadvantage: false })} />);
    expect(
      screen.queryByText(/Disadvantage on Dexterity \(Stealth\) checks/)
    ).not.toBeInTheDocument();
  });

  it('renders properties chips and the markdown description', () => {
    render(
      <ItemDetail
        item={makeItem({
          properties: ['Finesse', 'Light'],
          description: 'A **gleaming** blade.',
        })}
      />
    );

    expect(screen.getByText('Finesse')).toBeInTheDocument();
    expect(screen.getByText('Light')).toBeInTheDocument();
    expect(screen.getByText('gleaming')).toBeInTheDocument();
  });

  it('renders nothing fact-like for a bare item', () => {
    render(<ItemDetail item={makeItem()} />);

    expect(screen.queryByText(/Cost:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Damage:/)).not.toBeInTheDocument();
  });
});
