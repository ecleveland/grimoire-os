import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FormCheckbox from '../FormCheckbox';

describe('FormCheckbox', () => {
  it('wires the label to the checkbox', () => {
    render(<FormCheckbox label="Ritual" checked={false} onChange={vi.fn()} />);
    const box = screen.getByLabelText('Ritual');
    expect(box).toHaveAttribute('type', 'checkbox');
    expect(screen.getByRole('checkbox', { name: 'Ritual' })).toBe(box);
  });

  it('reflects the checked prop', () => {
    const { rerender } = render(<FormCheckbox label="Ritual" checked onChange={vi.fn()} />);
    expect(screen.getByLabelText('Ritual')).toBeChecked();

    rerender(<FormCheckbox label="Ritual" checked={false} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Ritual')).not.toBeChecked();
  });

  it('calls onChange with the new checked state', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FormCheckbox label="Ritual" checked={false} onChange={onChange} />);

    await user.click(screen.getByLabelText('Ritual'));

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('calls onChange with false when unticking', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FormCheckbox label="Ritual" checked onChange={onChange} />);

    await user.click(screen.getByLabelText('Ritual'));

    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('uses a passed id for the input and the label', () => {
    render(<FormCheckbox id="ritual-box" label="Ritual" checked={false} onChange={vi.fn()} />);
    const box = screen.getByLabelText('Ritual');
    expect(box).toHaveAttribute('id', 'ritual-box');
    expect(box.closest('label')).toHaveAttribute('for', 'ritual-box');
  });

  it('gives two checkboxes distinct ids when none is passed', () => {
    render(
      <>
        <FormCheckbox label="Ritual" checked={false} onChange={vi.fn()} />
        <FormCheckbox label="Concentration" checked={false} onChange={vi.fn()} />
      </>
    );
    expect(screen.getByLabelText('Ritual').id).not.toBe(screen.getByLabelText('Concentration').id);
  });

  it('appends a passed className to the label', () => {
    render(<FormCheckbox label="Ritual" checked={false} onChange={vi.fn()} className="mt-2" />);
    expect(screen.getByLabelText('Ritual').closest('label')).toHaveClass('mt-2', 'flex');
  });
});
