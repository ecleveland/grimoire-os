import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CoinRangeEditor from '../CoinRangeEditor';
import type { LootTemplateCoinage } from '@grimoire-os/shared';

const value: LootTemplateCoinage = { gp: [0, 2], sp: [2, 8], cp: [4, 20] };

function setup(initial: LootTemplateCoinage = value) {
  const onChange = vi.fn();
  render(<CoinRangeEditor value={initial} onChange={onChange} />);
  return { onChange };
}

describe('CoinRangeEditor', () => {
  it('renders min and max inputs for each denomination with current values', () => {
    setup();
    expect(screen.getByLabelText('gp min')).toHaveValue(0);
    expect(screen.getByLabelText('gp max')).toHaveValue(2);
    expect(screen.getByLabelText('sp min')).toHaveValue(2);
    expect(screen.getByLabelText('sp max')).toHaveValue(8);
    expect(screen.getByLabelText('cp min')).toHaveValue(4);
    expect(screen.getByLabelText('cp max')).toHaveValue(20);
  });

  it('emits the updated range when a bound is edited', () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByLabelText('sp max'), { target: { value: '12' } });
    expect(onChange).toHaveBeenCalledWith({ gp: [0, 2], sp: [2, 12], cp: [4, 20] });
  });

  it('raising min above max pulls max up with it', () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByLabelText('gp min'), { target: { value: '9' } });
    expect(onChange).toHaveBeenCalledWith({ gp: [9, 9], sp: [2, 8], cp: [4, 20] });
  });

  it('lowering max below min pulls min down with it', () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByLabelText('cp max'), { target: { value: '1' } });
    expect(onChange).toHaveBeenCalledWith({ gp: [0, 2], sp: [2, 8], cp: [1, 1] });
  });

  it('clamps negative values to 0', () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByLabelText('sp min'), { target: { value: '-3' } });
    expect(onChange).toHaveBeenCalledWith({ gp: [0, 2], sp: [0, 8], cp: [4, 20] });
  });

  it('floors non-integer input', () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByLabelText('cp min'), { target: { value: '3.7' } });
    expect(onChange).toHaveBeenCalledWith({ gp: [0, 2], sp: [2, 8], cp: [3, 20] });
  });

  it('treats a cleared input as 0', () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByLabelText('gp max'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ gp: [0, 0], sp: [2, 8], cp: [4, 20] });
  });
});
