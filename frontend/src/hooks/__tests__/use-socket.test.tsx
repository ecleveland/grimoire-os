import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, renderHook } from '@testing-library/react';
import type { Socket } from 'socket.io-client';
import { useSocket } from '../use-socket';

vi.mock('@/lib/socket', () => ({
  getSocket: vi.fn(),
  disconnectSocket: vi.fn(),
}));

import { getSocket, disconnectSocket } from '@/lib/socket';

type Listener = (...args: unknown[]) => void;

function makeFakeSocket(): Socket & {
  emit: (event: string, ...args: unknown[]) => void;
  listeners: Map<string, Set<Listener>>;
  connected: boolean;
} {
  const listeners = new Map<string, Set<Listener>>();
  const fake = {
    connected: false,
    listeners,
    on: vi.fn((event: string, cb: Listener) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(cb);
      return fake;
    }),
    off: vi.fn((event: string, cb: Listener) => {
      listeners.get(event)?.delete(cb);
      return fake;
    }),
    emit: (event: string, ...args: unknown[]) => {
      listeners.get(event)?.forEach(cb => cb(...args));
    },
    disconnect: vi.fn(),
  };
  return fake as unknown as Socket & {
    emit: (event: string, ...args: unknown[]) => void;
    listeners: Map<string, Set<Listener>>;
    connected: boolean;
  };
}

describe('useSocket', () => {
  beforeEach(() => {
    vi.mocked(getSocket).mockReset();
    vi.mocked(disconnectSocket).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the socket instance from getSocket', () => {
    const fake = makeFakeSocket();
    vi.mocked(getSocket).mockReturnValue(fake);

    const { result } = renderHook(() => useSocket());

    expect(result.current.socket).toBe(fake);
  });

  it('reflects the socket connected state initially', () => {
    const fake = makeFakeSocket();
    fake.connected = true;
    vi.mocked(getSocket).mockReturnValue(fake);

    const { result } = renderHook(() => useSocket());

    expect(result.current.isConnected).toBe(true);
  });

  it('updates isConnected when the socket emits "connect"', () => {
    const fake = makeFakeSocket();
    vi.mocked(getSocket).mockReturnValue(fake);

    const { result } = renderHook(() => useSocket());
    expect(result.current.isConnected).toBe(false);

    act(() => {
      fake.connected = true;
      fake.emit('connect');
    });

    expect(result.current.isConnected).toBe(true);
  });

  it('updates isConnected when the socket emits "disconnect"', () => {
    const fake = makeFakeSocket();
    fake.connected = true;
    vi.mocked(getSocket).mockReturnValue(fake);

    const { result } = renderHook(() => useSocket());
    expect(result.current.isConnected).toBe(true);

    act(() => {
      fake.connected = false;
      fake.emit('disconnect');
    });

    expect(result.current.isConnected).toBe(false);
  });

  it('detaches the listeners on unmount', () => {
    const fake = makeFakeSocket();
    vi.mocked(getSocket).mockReturnValue(fake);

    const { unmount } = renderHook(() => useSocket());
    expect(fake.listeners.get('connect')?.size).toBe(1);
    expect(fake.listeners.get('disconnect')?.size).toBe(1);

    unmount();

    expect(fake.listeners.get('connect')?.size ?? 0).toBe(0);
    expect(fake.listeners.get('disconnect')?.size ?? 0).toBe(0);
  });

  it('returns null socket and disconnected when getSocket returns null', () => {
    vi.mocked(getSocket).mockReturnValue(null);

    const { result } = renderHook(() => useSocket());

    expect(result.current.socket).toBeNull();
    expect(result.current.isConnected).toBe(false);
  });

  it('can be consumed in a component without throwing', () => {
    const fake = makeFakeSocket();
    vi.mocked(getSocket).mockReturnValue(fake);

    function Probe() {
      const { isConnected } = useSocket();
      return <span data-testid="probe">{isConnected ? 'on' : 'off'}</span>;
    }

    const { getByTestId } = render(<Probe />);
    expect(getByTestId('probe').textContent).toBe('off');
  });
});
