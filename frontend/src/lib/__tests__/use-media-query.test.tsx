import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useMediaQuery } from '../use-media-query';

type ChangeListener = () => void;

/** A MediaQueryList stand-in whose `matches` the test can flip by hand. */
function stubMatchMedia(initial: boolean) {
  const mql = {
    matches: initial,
    listener: undefined as ChangeListener | undefined,
    addEventListener: vi.fn((_event: string, listener: ChangeListener) => {
      mql.listener = listener;
    }),
    removeEventListener: vi.fn(),
  };
  const matchMedia = vi.fn(() => mql);
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: matchMedia,
  });
  return { mql, matchMedia };
}

afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia;
});

describe('useMediaQuery', () => {
  it('returns false when window.matchMedia is undefined', () => {
    expect(window.matchMedia).toBeUndefined();

    const { result } = renderHook(() => useMediaQuery('(min-width: 1024px)'));

    expect(result.current).toBe(false);
  });

  it('returns the initial matches of the queried media list', () => {
    const { matchMedia } = stubMatchMedia(true);

    const { result } = renderHook(() => useMediaQuery('(min-width: 1024px)'));

    expect(matchMedia).toHaveBeenCalledWith('(min-width: 1024px)');
    expect(result.current).toBe(true);
  });

  it('follows the media list when it fires a change event', () => {
    const { mql } = stubMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery('(min-width: 1024px)'));
    expect(result.current).toBe(false);
    expect(mql.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));

    act(() => {
      mql.matches = true;
      mql.listener?.();
    });

    expect(result.current).toBe(true);
  });

  it('removes its change listener on unmount', () => {
    const { mql } = stubMatchMedia(false);
    const { unmount } = renderHook(() => useMediaQuery('(min-width: 1024px)'));
    const listener = mql.listener;

    unmount();

    expect(mql.removeEventListener).toHaveBeenCalledWith('change', listener);
  });
});
