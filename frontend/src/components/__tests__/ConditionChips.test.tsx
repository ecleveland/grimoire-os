import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConditionChips from '../ConditionChips';

describe('ConditionChips', () => {
  it('renders a chip per condition', () => {
    render(<ConditionChips conditions={['Poisoned', 'Prone']} />);
    expect(screen.getByText('Poisoned')).toBeInTheDocument();
    expect(screen.getByText('Prone')).toBeInTheDocument();
  });

  it('renders nothing for an empty list', () => {
    const { container } = render(<ConditionChips conditions={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows no remove button when onRemove is omitted (read-only)', () => {
    render(<ConditionChips conditions={['Poisoned']} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('calls onRemove with the condition when its × is clicked', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<ConditionChips conditions={['Poisoned', 'Prone']} onRemove={onRemove} />);

    await user.click(screen.getByRole('button', { name: 'Remove Prone' }));

    expect(onRemove).toHaveBeenCalledWith('Prone');
  });

  it('labels the remove button via removeLabel (the tracker names the combatant)', () => {
    render(
      <ConditionChips
        conditions={['Poisoned']}
        onRemove={() => {}}
        removeLabel={cond => `Remove ${cond} from Goblin`}
      />
    );
    expect(screen.getByRole('button', { name: 'Remove Poisoned from Goblin' })).toBeInTheDocument();
  });

  it('disables remove buttons while a write is pending', () => {
    render(<ConditionChips conditions={['Poisoned']} onRemove={() => {}} disabled />);
    expect(screen.getByRole('button', { name: 'Remove Poisoned' })).toBeDisabled();
  });
});
