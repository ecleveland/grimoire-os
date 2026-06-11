import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import CoinRangeEditor from '../CoinRangeEditor';
import type { LootTemplateCoinage } from '@grimoire-os/shared';

const value: LootTemplateCoinage = { gp: [0, 2], sp: [2, 8], cp: [4, 20] };

// Stateful harness: blur-time normalization reads the committed value, so
// interaction tests need onChange to actually update the prop.
function Harness({
  initial,
  onChange,
}: {
  initial: LootTemplateCoinage;
  onChange: (v: LootTemplateCoinage) => void;
}) {
  const [val, setVal] = useState(initial);
  return (
    <CoinRangeEditor
      value={val}
      onChange={v => {
        setVal(v);
        onChange(v);
      }}
    />
  );
}

function setup(initial: LootTemplateCoinage = value) {
  const onChange = vi.fn();
  render(<Harness initial={initial} onChange={onChange} />);
  return { onChange };
}

function lastChange(onChange: ReturnType<typeof vi.fn>) {
  return onChange.mock.calls[onChange.mock.calls.length - 1]?.[0];
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
    expect(lastChange(onChange)).toEqual({ gp: [0, 2], sp: [2, 12], cp: [4, 20] });
  });

  it('clearing a field keeps the prior value and restores it on blur', () => {
    const { onChange } = setup();
    const input = screen.getByLabelText('sp max');
    fireEvent.change(input, { target: { value: '' } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(input).toHaveValue(8);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('clearing the max box and retyping preserves the min bound', () => {
    const { onChange } = setup({ gp: [5, 20], sp: [0, 0], cp: [0, 0] });
    const max = screen.getByLabelText('gp max');
    fireEvent.change(max, { target: { value: '' } });
    fireEvent.change(max, { target: { value: '3' } });
    fireEvent.change(max, { target: { value: '30' } });
    fireEvent.blur(max);
    expect(lastChange(onChange)).toEqual({ gp: [5, 30], sp: [0, 0], cp: [0, 0] });
  });

  it('a crossed range resolves on blur in favor of the edited bound (min raised)', () => {
    const { onChange } = setup();
    const min = screen.getByLabelText('gp min');
    fireEvent.change(min, { target: { value: '9' } });
    fireEvent.blur(min);
    expect(lastChange(onChange)).toEqual({ gp: [9, 9], sp: [2, 8], cp: [4, 20] });
  });

  it('a crossed range resolves on blur in favor of the edited bound (max lowered)', () => {
    const { onChange } = setup();
    const max = screen.getByLabelText('cp max');
    fireEvent.change(max, { target: { value: '1' } });
    fireEvent.blur(max);
    expect(lastChange(onChange)).toEqual({ gp: [0, 2], sp: [2, 8], cp: [1, 1] });
  });

  it('clamps negative values to 0', () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByLabelText('sp min'), { target: { value: '-3' } });
    expect(lastChange(onChange)).toEqual({ gp: [0, 2], sp: [0, 8], cp: [4, 20] });
  });

  it('floors non-integer input', () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByLabelText('cp min'), { target: { value: '3.7' } });
    expect(lastChange(onChange)).toEqual({ gp: [0, 2], sp: [2, 8], cp: [3, 20] });
  });
});
