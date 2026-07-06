import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AddConditionSelect from '../AddConditionSelect';

describe('AddConditionSelect', () => {
  it('offers only conditions not already active, after the placeholder', () => {
    render(<AddConditionSelect activeConditions={['Poisoned']} onAdd={() => {}} />);
    const options = Array.from(screen.getByRole('combobox').querySelectorAll('option')).map(
      o => o.textContent
    );
    expect(options[0]).toBe('+ Condition');
    expect(options).not.toContain('Poisoned');
    expect(options).toContain('Prone');
  });

  it('calls onAdd with the picked condition', async () => {
    const onAdd = vi.fn();
    render(<AddConditionSelect activeConditions={[]} onAdd={onAdd} />);

    await userEvent.selectOptions(screen.getByLabelText('Add condition'), 'Blinded');

    expect(onAdd).toHaveBeenCalledWith('Blinded');
  });

  it('supports a custom aria-label (the tracker names the combatant)', () => {
    render(
      <AddConditionSelect
        activeConditions={[]}
        onAdd={() => {}}
        ariaLabel="Add condition to Goblin"
      />
    );
    expect(screen.getByLabelText('Add condition to Goblin')).toBeInTheDocument();
  });

  it('renders nothing when every condition is already active', () => {
    const all = [
      'Blinded',
      'Charmed',
      'Deafened',
      'Frightened',
      'Grappled',
      'Incapacitated',
      'Invisible',
      'Paralyzed',
      'Petrified',
      'Poisoned',
      'Prone',
      'Restrained',
      'Stunned',
      'Unconscious',
    ] as const;
    const { container } = render(
      <AddConditionSelect activeConditions={[...all]} onAdd={() => {}} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('disables while a write is pending', () => {
    render(<AddConditionSelect activeConditions={[]} onAdd={() => {}} disabled />);
    expect(screen.getByRole('combobox')).toBeDisabled();
  });
});
