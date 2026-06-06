import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PrintTraitsCard from '../PrintTraitsCard';
import { PRINTABLE_TRAIT_SUMMARY_CAP } from '@grimoire-os/shared';
import type { PrintableRaceCard } from '@grimoire-os/shared';

function makeRaceCard(over: Partial<PrintableRaceCard> = {}): PrintableRaceCard {
  return {
    type: 'race',
    id: 'race-1',
    name: 'Elf',
    traits: [
      { name: 'Darkvision', description: 'You can see in dim light within 60 feet.' },
      { name: 'Fey Ancestry', description: 'Advantage on saves against the Charmed condition.' },
    ],
    ...over,
  };
}

describe('PrintTraitsCard', () => {
  it('renders the name and a capitalized type tag', () => {
    render(<PrintTraitsCard card={makeRaceCard()} />);

    expect(screen.getByText('Elf')).toBeInTheDocument();
    expect(screen.getByText('Race')).toBeInTheDocument();
  });

  it.each([
    ['species', 'Species'],
    ['background', 'Background'],
  ] as const)('tags a %s card as %s', (type, expected) => {
    render(<PrintTraitsCard card={{ type, id: 'x-1', name: 'Aasimar', traits: [] }} />);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('renders the trait summary entries', () => {
    render(<PrintTraitsCard card={makeRaceCard()} />);

    expect(screen.getByText('Darkvision.')).toBeInTheDocument();
    expect(screen.getByText(/dim light within 60 feet/)).toBeInTheDocument();
    expect(screen.getByText('Fey Ancestry.')).toBeInTheDocument();
  });

  it('defensively trims an over-cap trait list to the shared cap', () => {
    const manyTraits = Array.from({ length: PRINTABLE_TRAIT_SUMMARY_CAP + 2 }, (_, i) => ({
      name: `Trait ${i + 1}`,
      description: `Description ${i + 1}`,
    }));
    render(<PrintTraitsCard card={makeRaceCard({ traits: manyTraits })} />);

    expect(screen.getByText(`Trait ${PRINTABLE_TRAIT_SUMMARY_CAP}.`)).toBeInTheDocument();
    expect(screen.queryByText(`Trait ${PRINTABLE_TRAIT_SUMMARY_CAP + 1}.`)).not.toBeInTheDocument();
  });

  it('renders inside the shared PrintCard chrome (fixed footprint)', () => {
    render(<PrintTraitsCard card={makeRaceCard()} />);

    const card = screen.getByTestId('print-card');
    expect(card.className).toContain('w-[5in]');
    expect(card.className).toContain('h-[3in]');
  });
});
