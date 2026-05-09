import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NpcFieldRow from '../NpcFieldRow';

describe('NpcFieldRow', () => {
  it('renders label and value', () => {
    render(
      <NpcFieldRow
        field="alignment"
        label="Alignment"
        value="Lawful Good"
        locked={false}
        onReroll={() => {}}
        onToggleLock={() => {}}
      />
    );
    expect(screen.getByText('Alignment')).toBeInTheDocument();
    expect(screen.getByText('Lawful Good')).toBeInTheDocument();
  });

  it('renders dash for empty value', () => {
    render(
      <NpcFieldRow
        field="background"
        label="Background"
        value={null}
        locked={false}
        onReroll={() => {}}
        onToggleLock={() => {}}
      />
    );
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows dice button that fires onReroll with the field name', async () => {
    const onReroll = vi.fn();
    const user = userEvent.setup();
    render(
      <NpcFieldRow
        field="name"
        label="Name"
        value="Old Maelin"
        locked={false}
        onReroll={onReroll}
        onToggleLock={() => {}}
      />
    );
    await user.click(screen.getByRole('button', { name: /reroll name/i }));
    expect(onReroll).toHaveBeenCalledWith('name');
  });

  it('shows lock button that fires onToggleLock', async () => {
    const onToggleLock = vi.fn();
    const user = userEvent.setup();
    render(
      <NpcFieldRow
        field="alignment"
        label="Alignment"
        value="Lawful Good"
        locked={false}
        onReroll={() => {}}
        onToggleLock={onToggleLock}
      />
    );
    await user.click(screen.getByRole('button', { name: /lock alignment/i }));
    expect(onToggleLock).toHaveBeenCalledWith('alignment');
  });

  it('disables dice button when locked', () => {
    render(
      <NpcFieldRow
        field="alignment"
        label="Alignment"
        value="Lawful Good"
        locked={true}
        onReroll={() => {}}
        onToggleLock={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: /reroll alignment/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /unlock alignment/i })).toBeInTheDocument();
  });

  it('hides dice button when reroll is disabled', () => {
    render(
      <NpcFieldRow
        field="age"
        label="Age"
        value="42"
        locked={false}
        rerollable={false}
        onReroll={() => {}}
        onToggleLock={() => {}}
      />
    );
    expect(screen.queryByRole('button', { name: /reroll/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /lock/i })).not.toBeInTheDocument();
  });
});
