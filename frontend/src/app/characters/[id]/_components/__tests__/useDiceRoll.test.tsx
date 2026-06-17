import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDiceRoll } from '../useDiceRoll';

const mockMessage = vi.fn();
vi.mock('sonner', () => ({ toast: { message: (...args: unknown[]) => mockMessage(...args) } }));

beforeEach(() => mockMessage.mockReset());

describe('useDiceRoll', () => {
  it('toasts a formatted d20 check result', () => {
    const { result } = renderHook(() => useDiceRoll());
    result.current.rollCheck('Dexterity check', 3);
    expect(mockMessage).toHaveBeenCalledTimes(1);
    const msg = mockMessage.mock.calls[0][0] as string;
    expect(msg).toMatch(/^Dexterity check: \d+ [+−] 3 = \d+$/);
  });

  it('toasts a formatted damage roll for a valid expression', () => {
    const { result } = renderHook(() => useDiceRoll());
    result.current.rollDamage('Longsword damage', '1d8+2');
    expect(mockMessage).toHaveBeenCalledTimes(1);
    expect(mockMessage.mock.calls[0][0]).toMatch(/^Longsword damage: \[\d+\] \+ 2 = \d+$/);
  });

  it('does not toast for an unparseable damage expression', () => {
    const { result } = renderHook(() => useDiceRoll());
    result.current.rollDamage('Mystery damage', 'special');
    expect(mockMessage).not.toHaveBeenCalled();
  });
});
