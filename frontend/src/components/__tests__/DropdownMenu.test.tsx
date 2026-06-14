import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DropdownMenu, { type DropdownMenuItem } from '@/components/DropdownMenu';

function setup(overItems?: Partial<DropdownMenuItem>[]) {
  const onEach = vi.fn();
  const onShared = vi.fn();
  const items: DropdownMenuItem[] = [
    { label: 'Each NPC separately', description: 'd20 + DEX', onSelect: onEach },
    { label: 'One shared roll', description: 'one d20', onSelect: onShared },
    ...((overItems as DropdownMenuItem[] | undefined) ?? []),
  ];
  render(<DropdownMenu label="Roll initiative" items={items} testId="menu-trigger" />);
  return { onEach, onShared };
}

describe('DropdownMenu', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('is collapsed by default — items are not rendered', () => {
    setup();
    expect(screen.getByRole('button', { name: /roll initiative/i })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Each NPC separately' })).not.toBeInTheDocument();
  });

  it('opens on click and runs the selected item, then closes', async () => {
    const user = userEvent.setup();
    const { onEach, onShared } = setup();

    await user.click(screen.getByRole('button', { name: /roll initiative/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.click(screen.getByRole('menuitem', { name: 'Each NPC separately' }));
    expect(onEach).toHaveBeenCalledTimes(1);
    expect(onShared).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes on Escape without selecting', async () => {
    const user = userEvent.setup();
    const { onEach } = setup();
    await user.click(screen.getByRole('button', { name: /roll initiative/i }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(onEach).not.toHaveBeenCalled();
  });

  it('closes on an outside click', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: /roll initiative/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.click(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('focuses the first item on open and moves with arrow keys', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: /roll initiative/i }));
    expect(screen.getByRole('menuitem', { name: 'Each NPC separately' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'One shared roll' })).toHaveFocus();
    // Wraps back to the first.
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Each NPC separately' })).toHaveFocus();
  });

  it('does not invoke a disabled item', async () => {
    const user = userEvent.setup();
    const onDisabled = vi.fn();
    setup([{ label: 'Nope', onSelect: onDisabled, disabled: true }]);
    await user.click(screen.getByRole('button', { name: /roll initiative/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Nope' }));
    expect(onDisabled).not.toHaveBeenCalled();
  });
});
