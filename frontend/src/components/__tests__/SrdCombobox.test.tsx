import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SrdCombobox, { type SrdComboboxOption } from '../SrdCombobox';

const options: SrdComboboxOption[] = [
  { id: '1', name: 'Barbarian' },
  { id: '2', name: 'Bard' },
  { id: '3', name: 'Fighter' },
];

function setup(over: Partial<React.ComponentProps<typeof SrdCombobox>> = {}) {
  const onChange = over.onChange ?? vi.fn();
  const onSelect = over.onSelect ?? vi.fn();
  const { rerender } = render(
    <SrdCombobox
      label="Class"
      value={over.value ?? ''}
      options={over.options ?? options}
      onChange={onChange}
      onSelect={onSelect}
      loading={over.loading}
      helperText={over.helperText}
    />
  );
  return { onChange, onSelect, rerender };
}

beforeEach(() => vi.clearAllMocks());

describe('SrdCombobox', () => {
  it('opens on focus and lists all options when empty', async () => {
    setup();
    await userEvent.click(screen.getByLabelText('Class'));
    expect(screen.getByRole('option', { name: 'Barbarian' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Fighter' })).toBeInTheDocument();
  });

  it('typing fires onChange with the new value', async () => {
    const { onChange } = setup();
    await userEvent.type(screen.getByLabelText('Class'), 'F');
    expect(onChange).toHaveBeenCalledWith('F');
  });

  it('filters by the controlled value and selecting an option fires onChange + onSelect', async () => {
    const onChange = vi.fn();
    const onSelect = vi.fn();
    render(
      <SrdCombobox
        label="Class"
        value="ba"
        options={options}
        onChange={onChange}
        onSelect={onSelect}
      />
    );
    await userEvent.click(screen.getByLabelText('Class'));
    // "ba" matches Barbarian and Bard, not Fighter.
    expect(screen.getByRole('option', { name: 'Barbarian' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Bard' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Fighter' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('option', { name: 'Bard' }));
    expect(onChange).toHaveBeenLastCalledWith('Bard');
    expect(onSelect).toHaveBeenCalledWith({ id: '2', name: 'Bard' });
  });

  it('shows a custom-value hint when nothing matches (manual override)', async () => {
    render(<SrdCombobox label="Class" value="Artificer" options={options} onChange={vi.fn()} />);
    await userEvent.click(screen.getByLabelText('Class'));
    expect(screen.getByText(/kept as a custom value/i)).toBeInTheDocument();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('selects the highlighted option with arrow keys + Enter', async () => {
    const onSelect = vi.fn();
    const onChange = vi.fn();
    render(
      <SrdCombobox
        label="Class"
        value=""
        options={options}
        onChange={onChange}
        onSelect={onSelect}
      />
    );
    const input = screen.getByLabelText('Class');
    input.focus();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}'); // highlight 2nd -> Bard
    expect(onSelect).toHaveBeenCalledWith({ id: '2', name: 'Bard' });
  });

  it('closes on Escape', async () => {
    setup();
    const input = screen.getByLabelText('Class');
    await userEvent.click(input);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('shows a loading row while options are loading', async () => {
    setup({ loading: true, options: [] });
    await userEvent.click(screen.getByLabelText('Class'));
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });
});
