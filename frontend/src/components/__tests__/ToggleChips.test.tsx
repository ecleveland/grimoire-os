import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ToggleChips from '../ToggleChips';

const options = ['Strength', 'Dexterity', 'Constitution'];

describe('ToggleChips', () => {
  it('renders each option and marks selected ones aria-pressed', () => {
    render(
      <ToggleChips
        label="Saving Throws"
        options={options}
        value={['Constitution']}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /^strength$/i })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(screen.getByRole('button', { name: /^constitution/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('adds an unselected option on click', async () => {
    const onChange = vi.fn();
    render(
      <ToggleChips
        label="Saving Throws"
        options={options}
        value={['Constitution']}
        onChange={onChange}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /^strength$/i }));
    expect(onChange).toHaveBeenCalledWith(['Constitution', 'Strength']);
  });

  it('removes a selected option on click', async () => {
    const onChange = vi.fn();
    render(
      <ToggleChips
        label="Saving Throws"
        options={options}
        value={['Constitution', 'Strength']}
        onChange={onChange}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /^constitution/i }));
    expect(onChange).toHaveBeenCalledWith(['Strength']);
  });

  it('marks highlighted (class-pool) options with a star', () => {
    render(
      <ToggleChips
        label="Skills"
        options={options}
        value={[]}
        onChange={vi.fn()}
        highlight={['Strength']}
      />
    );
    // The star is rendered inside the highlighted option's button.
    expect(screen.getByRole('button', { name: /strength/i })).toHaveTextContent('★');
    expect(screen.getByRole('button', { name: /^dexterity$/i })).not.toHaveTextContent('★');
  });
});
