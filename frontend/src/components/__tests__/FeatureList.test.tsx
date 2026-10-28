import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FeatureList from '@/components/FeatureList';
import { PrintTrayProvider, PRINT_TRAY_STORAGE_KEY } from '@/lib/print-tray-context';
import type { ClassFeature } from '@/lib/types';

const WITH_OPTIONS =
  'Pick two invocations.\n\n**Options**\n\n**Agonizing Blast**\n\nPrerequisite: Level 2+ Warlock\n\nAdd your Charisma modifier.\n\n**Armor of Shadows**\n\nMage Armor at will.';

const MARKDOWN =
  '**Cantrips.** You know two cantrips.\n\nSecond paragraph.\n\n| A | B |\n| --- | --- |\n| 1 | 2 |';

/** The MARKDOWN description rendered as markup inside `scope`, with no literal syntax left. */
function expectRenderedMarkdown(scope: HTMLElement) {
  expect(within(scope).getByText('Cantrips.', { selector: 'strong' })).toBeInTheDocument();
  expect(scope.querySelectorAll('p')).toHaveLength(2);
  expect(scope.querySelector('p p')).toBeNull();
  expect(within(scope).getByRole('table')).toBeInTheDocument();
  expect(within(scope).getByRole('cell', { name: '2' })).toBeInTheDocument();
  expect(scope.textContent).not.toContain('**');
  expect(scope.textContent).not.toContain('|');
}

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

  it('reflows a single line break in a description as a space, as markdown does', () => {
    renderList([{ id: 'cf-rage', name: 'Rage', level: 1, description: 'First line.\nSecond.' }]);

    expect(screen.getByText('First line. Second.')).toBeInTheDocument();
  });

  it('renders a markdown description as bold run-in heads, paragraphs and a table', () => {
    renderList([{ id: 'cf-spellcasting', name: 'Spellcasting', level: 1, description: MARKDOWN }]);

    expectRenderedMarkdown(document.getElementById('cf-spellcasting')!);
  });

  it("puts a description's option list behind a collapsed toggle", () => {
    renderList([
      { id: 'cf-invocations', name: 'Eldritch Invocations', level: 1, description: WITH_OPTIONS },
    ]);

    const row = document.getElementById('cf-invocations')!;
    expect(within(row).getByText('Pick two invocations.')).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Show 2 options' })).toBeInTheDocument();
    expect(within(row).queryByText('Agonizing Blast')).not.toBeInTheDocument();
  });

  it("gives each option a print toggle keyed on the row's feature id", async () => {
    const user = userEvent.setup();
    renderList([
      { id: 'cf-invocations', name: 'Eldritch Invocations', level: 1, description: WITH_OPTIONS },
    ]);

    await user.click(screen.getByRole('button', { name: 'Show 2 options' }));
    await user.click(screen.getByRole('button', { name: 'Add Agonizing Blast to print set' }));

    expect(JSON.parse(localStorage.getItem(PRINT_TRAY_STORAGE_KEY)!)).toEqual([
      { type: 'feature-option', id: 'cf-invocations::Agonizing Blast' },
    ]);
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
