import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TokenListEditor from '../TokenListEditor';

describe('TokenListEditor', () => {
  it('renders existing tokens as chips', () => {
    render(<TokenListEditor label="Languages" value={['Common', 'Elvish']} onChange={vi.fn()} />);
    expect(screen.getByText('Common')).toBeInTheDocument();
    expect(screen.getByText('Elvish')).toBeInTheDocument();
  });

  it('adds a typed token via the Add button', async () => {
    const onChange = vi.fn();
    render(<TokenListEditor label="Languages" value={['Common']} onChange={onChange} />);
    await userEvent.type(screen.getByLabelText('Languages'), 'Dwarvish');
    await userEvent.click(screen.getByRole('button', { name: /add/i }));
    expect(onChange).toHaveBeenCalledWith(['Common', 'Dwarvish']);
  });

  it('adds a token on Enter and does not submit a surrounding form', async () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <TokenListEditor label="Languages" value={[]} onChange={onChange} />
      </form>
    );
    await userEvent.type(screen.getByLabelText('Languages'), 'Giant{Enter}');
    expect(onChange).toHaveBeenCalledWith(['Giant']);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('ignores blank and duplicate entries', async () => {
    const onChange = vi.fn();
    render(<TokenListEditor label="Languages" value={['Common']} onChange={onChange} />);
    const input = screen.getByLabelText('Languages');
    await userEvent.click(screen.getByRole('button', { name: /add/i })); // blank
    await userEvent.type(input, 'Common');
    await userEvent.click(screen.getByRole('button', { name: /add/i })); // duplicate
    expect(onChange).not.toHaveBeenCalled();
  });

  it('removes a token via its remove button', async () => {
    const onChange = vi.fn();
    render(<TokenListEditor label="Languages" value={['Common', 'Elvish']} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Common' }));
    expect(onChange).toHaveBeenCalledWith(['Elvish']);
  });
});
