import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, renderHook, screen } from '@testing-library/react';
import { useValueChange } from '../use-value-change';

describe('useValueChange', () => {
  it('does not fire on the first render', () => {
    const onChange = vi.fn();
    renderHook(({ value }) => useValueChange(value, onChange), { initialProps: { value: 1 } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('fires with the next and previous value when the value changes across a rerender', () => {
    const onChange = vi.fn();
    const { rerender } = renderHook(({ value }) => useValueChange(value, onChange), {
      initialProps: { value: 'a' },
    });
    rerender({ value: 'b' });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('b', 'a');
  });

  it('does not fire when the new value is Object.is-equal to the last one', () => {
    const onChange = vi.fn();
    const same = { id: 1 };
    const { rerender } = renderHook(({ value }) => useValueChange(value, onChange), {
      initialProps: { value: same as unknown },
    });
    rerender({ value: same });
    rerender({ value: NaN });
    rerender({ value: NaN });
    // Only the change from `same` to NaN fires; NaN to NaN is Object.is-equal.
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('fires once per change, not on unrelated rerenders after it', () => {
    const onChange = vi.fn();
    const { rerender } = renderHook(({ value }) => useValueChange(value, onChange), {
      initialProps: { value: 1 },
    });
    rerender({ value: 2 });
    rerender({ value: 2 });
    rerender({ value: 3 });
    expect(onChange.mock.calls).toEqual([
      [2, 1],
      [3, 2],
    ]);
  });

  it('lands a setState from onChange in the same render pass', () => {
    function Probe({ version }: { version: number }) {
      const [editing, setEditing] = useState<string | null>('row-1');
      useValueChange(version, () => setEditing(null));
      return <p>{editing ?? 'none'}</p>;
    }
    const { rerender } = render(<Probe version={1} />);
    expect(screen.getByText('row-1')).toBeInTheDocument();
    rerender(<Probe version={2} />);
    expect(screen.getByText('none')).toBeInTheDocument();
  });
});
