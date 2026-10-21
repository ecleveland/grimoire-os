import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FeatureList from '@/components/FeatureList';
import { PrintTrayProvider } from '@/lib/print-tray-context';
import type { ClassFeature } from '@/lib/types';

function renderList(
  features: ClassFeature[],
  { defaultOpen = true, className }: { defaultOpen?: boolean; className?: string } = {}
) {
  return render(
    <PrintTrayProvider>
      <FeatureList features={features} defaultOpen={defaultOpen} className={className} />
    </PrintTrayProvider>
  );
}

describe('FeatureList', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders a row carrying an id with a print toggle', () => {
    renderList([{ id: 'cf-rage', name: 'Rage', level: 1 }]);

    expect(screen.getByRole('button', { name: 'Add Rage to print set' })).toBeInTheDocument();
  });

  it('renders an id-less row without a print toggle, since it cannot be addressed as a card', () => {
    renderList([{ name: 'Rage', level: 1 }]);

    expect(screen.getByText('Rage')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('anchors a row on its feature id', () => {
    renderList([{ id: 'cf-rage', name: 'Rage', level: 1 }]);

    expect(document.getElementById('cf-rage')).toHaveTextContent('Rage');
  });

  it('leaves the id attribute off an id-less row', () => {
    const { container } = renderList([{ name: 'Rage', level: 1 }]);

    expect(container.querySelector('[id]')).toBeNull();
  });

  it('shows the level and the full description of each row', () => {
    renderList([
      { id: 'cf-rage', name: 'Rage', level: 1, description: 'You fight with primal ferocity.' },
    ]);

    expect(screen.getByText('Level 1')).toBeInTheDocument();
    expect(screen.getByText('You fight with primal ferocity.')).toBeInTheDocument();
  });

  it('keeps the line breaks an author typed into a description', () => {
    renderList([{ id: 'cf-rage', name: 'Rage', level: 1, description: 'First line.\nSecond.' }]);

    expect(screen.getByText(/First line\./)).toHaveClass('whitespace-pre-line');
  });

  it('renders no description paragraph for a row without one', () => {
    const { container } = renderList([{ id: 'cf-rage', name: 'Rage', level: 1 }]);

    expect(container.querySelector('p')).toBeNull();
  });

  it('orders rows by level', () => {
    renderList([
      { id: 'cf-c', name: 'Extra Attack', level: 5 },
      { id: 'cf-a', name: 'Rage', level: 1 },
      { id: 'cf-b', name: 'Reckless Attack', level: 2 },
    ]);

    const names = screen
      .getAllByText(/^(Rage|Reckless Attack|Extra Attack)$/)
      .map(el => el.textContent);
    expect(names).toEqual(['Rage', 'Reckless Attack', 'Extra Attack']);
  });

  it('keeps API order for rows at the same level', () => {
    renderList([
      { id: 'cf-z', name: 'Zealous Presence', level: 3 },
      { id: 'cf-a', name: 'Aura of Fury', level: 3 },
    ]);

    const names = screen
      .getAllByText(/^(Zealous Presence|Aura of Fury)$/)
      .map(el => el.textContent);
    expect(names).toEqual(['Zealous Presence', 'Aura of Fury']);
  });

  it('renders one name at two levels as two rows', () => {
    renderList([
      { name: 'Ability Score Improvement', level: 4 },
      { name: 'Ability Score Improvement', level: 8 },
    ]);

    expect(screen.getAllByText('Ability Score Improvement')).toHaveLength(2);
    expect(screen.getByText('Level 4')).toBeInTheDocument();
    expect(screen.getByText('Level 8')).toBeInTheDocument();
  });

  it('renders nothing at all for an empty list', () => {
    const { container } = renderList([]);

    expect(container).toBeEmptyDOMElement();
  });

  it('puts the caller-supplied spacing on the wrapper', () => {
    const { container } = renderList([{ name: 'Rage', level: 1 }], { className: 'mt-2' });

    expect(container.firstElementChild).toHaveClass('mt-2');
  });

  it('renders no show or hide toggle when open by default', () => {
    renderList([{ id: 'cf-rage', name: 'Rage', level: 1 }]);

    expect(screen.queryByRole('button', { expanded: false })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /features?$/ })).not.toBeInTheDocument();
  });

  describe('collapsed by default', () => {
    const twoFeatures: ClassFeature[] = [
      { id: 'cf-rage', name: 'Rage', level: 1, description: 'Primal ferocity.' },
      { id: 'cf-reckless', name: 'Reckless Attack', level: 2 },
    ];

    it('hides the rows behind a Show N features toggle', () => {
      renderList(twoFeatures, { defaultOpen: false });

      expect(screen.getByRole('button', { name: 'Show 2 features' })).toHaveAttribute(
        'aria-expanded',
        'false'
      );
      expect(screen.getByText('Primal ferocity.')).not.toBeVisible();
      expect(screen.queryByRole('button', { name: 'Add Rage to print set' })).toBeNull();
    });

    it('keeps the collapsed rows in the DOM so their anchors exist', () => {
      renderList(twoFeatures, { defaultOpen: false });

      expect(document.getElementById('cf-rage')).not.toBeNull();
    });

    it('says feature in the singular for a single row', () => {
      renderList([twoFeatures[0]], { defaultOpen: false });

      expect(screen.getByRole('button', { name: 'Show 1 feature' })).toBeInTheDocument();
    });

    it('opens on click and closes again', async () => {
      const user = userEvent.setup();
      renderList(twoFeatures, { defaultOpen: false });

      await user.click(screen.getByRole('button', { name: 'Show 2 features' }));

      const hide = screen.getByRole('button', { name: 'Hide features' });
      expect(hide).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByText('Primal ferocity.')).toBeVisible();
      expect(screen.getByRole('button', { name: 'Add Rage to print set' })).toBeInTheDocument();

      await user.click(hide);

      expect(screen.getByRole('button', { name: 'Show 2 features' })).toBeInTheDocument();
      expect(screen.getByText('Primal ferocity.')).not.toBeVisible();
    });
  });
});
