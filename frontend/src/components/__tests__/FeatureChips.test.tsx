import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import FeatureChips from '@/components/FeatureChips';
import { PrintTrayProvider } from '@/lib/print-tray-context';
import type { ClassFeature } from '@/lib/types';

function renderChips(features: ClassFeature[], className?: string) {
  return render(
    <PrintTrayProvider>
      <FeatureChips features={features} className={className} />
    </PrintTrayProvider>
  );
}

describe('FeatureChips', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders a row carrying an id as a print toggle', () => {
    renderChips([{ id: 'cf-rage', name: 'Rage', level: 1 }]);

    expect(screen.getByRole('button', { name: 'Add Rage to print set' })).toBeInTheDocument();
  });

  it('renders an id-less row as a plain chip, since it cannot be addressed as a card', () => {
    renderChips([{ name: 'Rage', level: 1 }]);

    expect(screen.getByText('Rage')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders one name at two levels as two chips', () => {
    renderChips([
      { name: 'Ability Score Improvement', level: 4 },
      { name: 'Ability Score Improvement', level: 8 },
    ]);

    expect(screen.getAllByText('Ability Score Improvement')).toHaveLength(2);
  });

  it('renders nothing at all for an empty list', () => {
    const { container } = renderChips([]);

    expect(container).toBeEmptyDOMElement();
  });

  it('puts the caller-supplied spacing on the wrapper', () => {
    const { container } = renderChips([{ name: 'Rage', level: 1 }], 'mt-2');

    expect(container.firstElementChild).toHaveClass('mt-2');
  });
});
