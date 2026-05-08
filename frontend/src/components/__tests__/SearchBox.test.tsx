import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import SearchBox from '../SearchBox';

describe('SearchBox', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders with the provided placeholder', () => {
    render(<SearchBox onDebouncedChange={() => {}} placeholder="Search SRD..." />);
    expect(screen.getByPlaceholderText('Search SRD...')).toBeInTheDocument();
  });

  it('starts with the provided initial value', () => {
    render(<SearchBox initialValue="fire" onDebouncedChange={() => {}} />);
    expect(screen.getByDisplayValue('fire')).toBeInTheDocument();
  });

  it('debounces the onDebouncedChange callback', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<SearchBox onDebouncedChange={onChange} delay={300} />);

    // Initial render fires once with the initial value.
    act(() => {
      vi.advanceTimersByTime(300);
    });
    onChange.mockClear();

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'f' } });
    fireEvent.change(input, { target: { value: 'fi' } });
    fireEvent.change(input, { target: { value: 'fir' } });

    // Before delay: no calls yet (still debouncing).
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(onChange).not.toHaveBeenCalled();

    // After delay: one call with the latest value.
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('fir');
  });
});
