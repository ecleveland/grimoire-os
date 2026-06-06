import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PrintFeatureCard from '../PrintFeatureCard';
import type { PrintableFeatureCard, PrintableFeatureParentKind } from '@grimoire-os/shared';

function makeCard(over: Partial<PrintableFeatureCard> = {}): PrintableFeatureCard {
  return {
    type: 'feature',
    id: 'cf-1',
    name: 'Action Surge',
    parent: { kind: 'class', id: 'cls-1', name: 'Fighter' },
    level: 2,
    description: 'You can push yourself beyond your normal limits and take one additional action.',
    ...over,
  };
}

describe('PrintFeatureCard', () => {
  it('renders the feature name and the parent label as the tag', () => {
    render(<PrintFeatureCard card={makeCard()} />);

    expect(screen.getByText('Action Surge')).toBeInTheDocument();
    expect(screen.getByText('Class · Fighter')).toBeInTheDocument();
  });

  it.each([
    ['subclass', 'Champion', 'Subclass · Champion'],
    ['race', 'Elf', 'Race · Elf'],
    ['background', 'Acolyte', 'Background · Acolyte'],
  ] as [PrintableFeatureParentKind, string, string][])(
    'labels a %s parent correctly',
    (kind, parentName, expected) => {
      render(
        <PrintFeatureCard card={makeCard({ parent: { kind, id: 'p-1', name: parentName } })} />
      );
      expect(screen.getByText(expected)).toBeInTheDocument();
    }
  );

  it('renders the unlock level when present and omits it when absent', () => {
    const { rerender } = render(<PrintFeatureCard card={makeCard()} />);
    expect(screen.getByText('Level 2')).toBeInTheDocument();

    rerender(<PrintFeatureCard card={makeCard({ level: undefined })} />);
    expect(screen.queryByText(/^Level \d/)).not.toBeInTheDocument();
  });

  it('renders the description with a line clamp', () => {
    render(<PrintFeatureCard card={makeCard()} />);

    const description = screen.getByText(/push yourself beyond your normal limits/);
    expect(description.className).toContain('line-clamp');
  });

  it('renders inside the shared PrintCard chrome (fixed footprint)', () => {
    render(<PrintFeatureCard card={makeCard()} />);

    const card = screen.getByTestId('print-card');
    expect(card.className).toContain('w-[5in]');
    expect(card.className).toContain('h-[3in]');
  });
});
