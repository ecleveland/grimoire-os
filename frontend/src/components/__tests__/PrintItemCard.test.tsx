import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PrintItemCard from '../PrintItemCard';
import type { PrintableItemCard } from '@grimoire-os/shared';

function makeCard(over: Partial<PrintableItemCard> = {}): PrintableItemCard {
  return {
    type: 'item',
    id: 'item-1',
    name: 'Bag of Holding',
    category: 'Wondrous Item',
    rarity: 'Uncommon',
    requiresAttunement: false,
    properties: [],
    description: 'This bag has an interior space considerably larger than its outside dimensions.',
    ...over,
  };
}

describe('PrintItemCard', () => {
  it('renders the curated header fields: name and category tag', () => {
    render(<PrintItemCard card={makeCard()} />);

    expect(screen.getByText('Bag of Holding')).toBeInTheDocument();
    expect(screen.getByText('Wondrous Item')).toBeInTheDocument();
  });

  it('renders the rarity and an attunement badge when required', () => {
    render(<PrintItemCard card={makeCard({ requiresAttunement: true })} />);

    expect(screen.getByText('Uncommon')).toBeInTheDocument();
    expect(screen.getByText('Requires Attunement')).toBeInTheDocument();
  });

  it('omits rarity and attunement when absent', () => {
    render(<PrintItemCard card={makeCard({ rarity: undefined, requiresAttunement: false })} />);

    expect(screen.queryByText('Uncommon')).not.toBeInTheDocument();
    expect(screen.queryByText('Requires Attunement')).not.toBeInTheDocument();
  });

  it('renders properties when present', () => {
    render(<PrintItemCard card={makeCard({ properties: ['Versatile', 'Finesse'] })} />);

    expect(screen.getByText('Versatile')).toBeInTheDocument();
    expect(screen.getByText('Finesse')).toBeInTheDocument();
  });

  it('renders the description with a line clamp, and omits it when absent', () => {
    const { rerender } = render(<PrintItemCard card={makeCard()} />);
    const description = screen.getByText(/interior space considerably larger/);
    expect(description.className).toContain('line-clamp');

    rerender(<PrintItemCard card={makeCard({ description: undefined })} />);
    expect(screen.queryByText(/interior space/)).not.toBeInTheDocument();
  });

  it('renders inside the shared PrintCard chrome (fixed footprint)', () => {
    render(<PrintItemCard card={makeCard()} />);

    const card = screen.getByTestId('print-card');
    expect(card.className).toContain('w-[5in]');
    expect(card.className).toContain('h-[3in]');
  });
});
