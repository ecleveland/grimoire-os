import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FeatureText from '@/components/FeatureText';
import { PrintTrayProvider, usePrintTray } from '@/lib/print-tray-context';
import { resetPrintTrayStore } from '@/lib/print-tray-store';

const BODY = "You can't pick the same invocation more than once.";

const TWO_OPTIONS = [
  BODY,
  '',
  '**Options**',
  '',
  '**Agonizing Blast**',
  '',
  'Prerequisite: Level 2+ Warlock',
  '',
  'Add your Charisma modifier to the damage.',
  '',
  '**Repeatable.** You can gain this invocation more than once.',
  '',
  '**Armor of Shadows**',
  '',
  'You can cast Mage Armor on yourself.',
].join('\n');

describe('FeatureText', () => {
  it('renders a description without options as markdown with no toggle', () => {
    render(<FeatureText description={'**Rage.** You fight with primal ferocity.'} />);

    expect(screen.getByText('Rage.', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText(/You fight with primal ferocity/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows the body and a collapsed options toggle with the count', () => {
    render(<FeatureText description={TWO_OPTIONS} />);

    expect(screen.getByText(BODY)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show 2 options' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(screen.queryByText('Agonizing Blast')).not.toBeInTheDocument();
    expect(screen.queryByText(/Mage Armor/)).not.toBeInTheDocument();
    expect(screen.queryByText('**Options**')).not.toBeInTheDocument();
  });

  it('lists every option with its name, meta line and text once opened', async () => {
    const user = userEvent.setup();
    render(<FeatureText description={TWO_OPTIONS} />);

    await user.click(screen.getByRole('button', { name: 'Show 2 options' }));

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(screen.getByText('Agonizing Blast')).toBeInTheDocument();
    expect(screen.getByText('Prerequisite: Level 2+ Warlock')).toBeInTheDocument();
    expect(screen.getByText('Add your Charisma modifier to the damage.')).toBeInTheDocument();
    expect(screen.getByText('Repeatable.', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText('Armor of Shadows')).toBeInTheDocument();
    expect(screen.getByText('You can cast Mage Armor on yourself.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide options' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });

  it('removes the options from the DOM when closed again', async () => {
    const user = userEvent.setup();
    render(<FeatureText description={TWO_OPTIONS} />);

    await user.click(screen.getByRole('button', { name: 'Show 2 options' }));
    await user.click(screen.getByRole('button', { name: 'Hide options' }));

    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByText('Agonizing Blast')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show 2 options' })).toBeInTheDocument();
  });

  it('says option in the singular for a single option', () => {
    render(
      <FeatureText description={`${BODY}\n\n**Options**\n\n**Armor of Shadows**\n\nMage Armor.`} />
    );

    expect(screen.getByRole('button', { name: 'Show 1 option' })).toBeInTheDocument();
  });

  it('renders only the name and meta line of an option with no text', async () => {
    const user = userEvent.setup();
    render(
      <FeatureText
        description={`${BODY}\n\n**Options**\n\n**Careful Spell**\n\nCost: 1 Sorcery Point`}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Show 1 option' }));

    const item = screen.getByRole('listitem');
    expect(item).toHaveTextContent(/^Careful SpellCost: 1 Sorcery Point$/);
    expect(item.querySelectorAll('p')).toHaveLength(1);
  });

  it('renders no body wrapper when the description opens with the option list', () => {
    // A class the toggle does not carry, so only a body wrapper can match it.
    const { container } = render(
      <FeatureText
        className="body-gap"
        description={'**Options**\n\n**Armor of Shadows**\n\nMage Armor.'}
      />
    );

    expect(screen.getByRole('button', { name: 'Show 1 option' })).toBeInTheDocument();
    expect(container.querySelector('.body-gap')).toBeNull();
  });

  it('puts the caller-supplied class on the body markdown wrapper', () => {
    render(<FeatureText className="mt-1" description={TWO_OPTIONS} />);

    expect(screen.getByText(BODY).parentElement).toHaveClass('mt-1');
  });

  describe('print controls', () => {
    const FEATURE_ID = 'feat-ei';

    function TrayItems() {
      const { items } = usePrintTray();
      return <output aria-label="tray items">{JSON.stringify(items)}</output>;
    }

    function renderWithTray(featureId?: string) {
      return render(
        <PrintTrayProvider>
          <FeatureText description={TWO_OPTIONS} featureId={featureId} />
          <TrayItems />
        </PrintTrayProvider>
      );
    }

    beforeEach(() => {
      localStorage.clear();
      resetPrintTrayStore();
    });

    it('gives each option its own print toggle', async () => {
      const user = userEvent.setup();
      renderWithTray(FEATURE_ID);

      await user.click(screen.getByRole('button', { name: 'Show 2 options' }));

      expect(
        screen.getByRole('button', { name: 'Add Agonizing Blast to print set' })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Add Armor of Shadows to print set' })
      ).toBeInTheDocument();
    });

    it('adds every option to the tray from the add-all button', async () => {
      const user = userEvent.setup();
      renderWithTray(FEATURE_ID);

      await user.click(screen.getByRole('button', { name: 'Show 2 options' }));
      await user.click(screen.getByRole('button', { name: 'Add all 2 to print set' }));

      expect(JSON.parse(screen.getByLabelText('tray items').textContent!)).toEqual([
        { type: 'feature-option', id: 'feat-ei::Agonizing Blast' },
        { type: 'feature-option', id: 'feat-ei::Armor of Shadows' },
      ]);
      expect(
        screen.getByRole('button', { name: 'Remove Agonizing Blast from print set' })
      ).toHaveAttribute('aria-pressed', 'true');
    });

    it('keeps offering add-all while only some options are in the tray', async () => {
      const user = userEvent.setup();
      renderWithTray(FEATURE_ID);

      await user.click(screen.getByRole('button', { name: 'Show 2 options' }));
      await user.click(screen.getByRole('button', { name: 'Add Armor of Shadows to print set' }));
      await user.click(screen.getByRole('button', { name: 'Add all 2 to print set' }));

      expect(JSON.parse(screen.getByLabelText('tray items').textContent!)).toEqual([
        { type: 'feature-option', id: 'feat-ei::Armor of Shadows' },
        { type: 'feature-option', id: 'feat-ei::Agonizing Blast' },
      ]);
    });

    it('turns into remove-all once every option is in the tray', async () => {
      const user = userEvent.setup();
      renderWithTray(FEATURE_ID);

      await user.click(screen.getByRole('button', { name: 'Show 2 options' }));
      await user.click(screen.getByRole('button', { name: 'Add all 2 to print set' }));
      await user.click(screen.getByRole('button', { name: 'Remove all 2 from print set' }));

      expect(screen.getByLabelText('tray items')).toHaveTextContent('[]');
      expect(screen.getByRole('button', { name: 'Add all 2 to print set' })).toBeInTheDocument();
    });

    it('renders no print controls without a feature id', async () => {
      const user = userEvent.setup();
      renderWithTray();

      await user.click(screen.getByRole('button', { name: 'Show 2 options' }));

      expect(screen.queryByRole('button', { name: /print set/ })).not.toBeInTheDocument();
    });
  });
});
