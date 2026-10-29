import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PrintFeatureOptionCard from '../PrintFeatureOptionCard';
import type { PrintableFeatureOptionCard } from '@grimoire-os/shared';

function makeCard(over: Partial<PrintableFeatureOptionCard> = {}): PrintableFeatureOptionCard {
  return {
    type: 'feature-option',
    id: 'cf-ei::Agonizing Blast',
    name: 'Agonizing Blast',
    feature: { id: 'cf-ei', name: 'Eldritch Invocations' },
    parent: { kind: 'class', id: 'cls-wl', name: 'Warlock' },
    meta: 'Prerequisite: Level 2+ Warlock, a Warlock Cantrip That Deals Damage',
    description: 'Choose one of your known Warlock cantrips that deals damage.',
    ...over,
  };
}

describe('PrintFeatureOptionCard', () => {
  it('heads the card with the option name and tags it with the parent', () => {
    render(<PrintFeatureOptionCard card={makeCard()} />);

    expect(screen.getByRole('heading', { name: 'Agonizing Blast' })).toBeInTheDocument();
    expect(screen.getByText('Class · Warlock')).toBeInTheDocument();
  });

  it('labels a subclass parent', () => {
    render(
      <PrintFeatureOptionCard
        card={makeCard({ parent: { kind: 'subclass', id: 'sc-1', name: 'Battle Master' } })}
      />
    );

    expect(screen.getByText('Subclass · Battle Master')).toBeInTheDocument();
  });

  it('names the feature the option belongs to', () => {
    render(<PrintFeatureOptionCard card={makeCard()} />);

    expect(screen.getByText('Eldritch Invocations')).toBeInTheDocument();
  });

  it('prints the Prerequisite line when the option has one', () => {
    render(<PrintFeatureOptionCard card={makeCard()} />);

    expect(
      screen.getByText('Prerequisite: Level 2+ Warlock, a Warlock Cantrip That Deals Damage')
    ).toBeInTheDocument();
  });

  it('prints no meta line when the option has none', () => {
    render(<PrintFeatureOptionCard card={makeCard({ meta: undefined })} />);

    expect(screen.queryByText(/^Prerequisite:/)).not.toBeInTheDocument();
    expect(screen.getByTestId('print-card').querySelectorAll('p')).toHaveLength(2);
  });

  it('renders the description with a line clamp', () => {
    render(<PrintFeatureOptionCard card={makeCard()} />);

    const description = screen.getByText(/Choose one of your known Warlock cantrips/);
    expect(description.className).toContain('line-clamp');
  });
});
