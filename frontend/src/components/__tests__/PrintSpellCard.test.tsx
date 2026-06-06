import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PrintSpellCard from '../PrintSpellCard';
import type { PrintableSpellCard } from '@grimoire-os/shared';

function makeCard(over: Partial<PrintableSpellCard> = {}): PrintableSpellCard {
  return {
    type: 'spell',
    id: 'spell-1',
    name: 'Fireball',
    level: 3,
    school: 'Evocation',
    castingTime: '1 action',
    range: '150 feet',
    components: 'V, S, M',
    duration: 'Instantaneous',
    concentration: false,
    ritual: false,
    description: 'A bright streak flashes from your pointing finger to a point you choose.',
    ...over,
  };
}

describe('PrintSpellCard', () => {
  it('renders the curated header fields: name and level/school tag', () => {
    render(<PrintSpellCard card={makeCard()} />);

    expect(screen.getByText('Fireball')).toBeInTheDocument();
    expect(screen.getByText('Level 3 · Evocation')).toBeInTheDocument();
  });

  it('labels level 0 as a cantrip', () => {
    render(<PrintSpellCard card={makeCard({ name: 'Fire Bolt', level: 0 })} />);
    expect(screen.getByText('Cantrip · Evocation')).toBeInTheDocument();
  });

  it('renders the casting line: time, range, components, duration', () => {
    render(<PrintSpellCard card={makeCard()} />);

    expect(screen.getByText('Casting Time')).toBeInTheDocument();
    expect(screen.getByText('1 action')).toBeInTheDocument();
    expect(screen.getByText('Range')).toBeInTheDocument();
    expect(screen.getByText('150 feet')).toBeInTheDocument();
    expect(screen.getByText('Components')).toBeInTheDocument();
    expect(screen.getByText('V, S, M')).toBeInTheDocument();
    expect(screen.getByText('Duration')).toBeInTheDocument();
    expect(screen.getByText('Instantaneous')).toBeInTheDocument();
  });

  it('shows Concentration and Ritual badges only when flagged', () => {
    const { rerender } = render(
      <PrintSpellCard card={makeCard({ concentration: true, ritual: true })} />
    );
    expect(screen.getByText('Concentration')).toBeInTheDocument();
    expect(screen.getByText('Ritual')).toBeInTheDocument();

    rerender(<PrintSpellCard card={makeCard()} />);
    expect(screen.queryByText('Concentration')).not.toBeInTheDocument();
    expect(screen.queryByText('Ritual')).not.toBeInTheDocument();
  });

  it('renders the condensed description with a line clamp so long text cannot overflow', () => {
    const longDescription = 'A very long spell description. '.repeat(60);
    render(<PrintSpellCard card={makeCard({ description: longDescription })} />);

    const description = screen.getByText(/A very long spell description/);
    expect(description.className).toContain('line-clamp');
  });

  it('renders inside the shared PrintCard chrome (fixed footprint)', () => {
    render(<PrintSpellCard card={makeCard()} />);

    const card = screen.getByTestId('print-card');
    expect(card.className).toContain('w-[5in]');
    expect(card.className).toContain('h-[3in]');
  });
});
