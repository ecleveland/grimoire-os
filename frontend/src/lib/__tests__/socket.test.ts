import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { io as ioMock } from 'socket.io-client';

vi.mock('socket.io-client', () => ({
  io: vi.fn(),
}));

type FakeSocket = {
  connected: boolean;
  disconnect: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
};

const makeFakeSocket = (): FakeSocket => ({
  connected: false,
  disconnect: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
});

function createMockLocalStorage() {
  const store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      Object.keys(store).forEach(k => delete store[k]);
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
  };
}

describe('socket', () => {
  let mockLocalStorage: ReturnType<typeof createMockLocalStorage>;

  beforeEach(async () => {
    vi.resetModules();
    mockLocalStorage = createMockLocalStorage();
    vi.stubGlobal('localStorage', mockLocalStorage);
    vi.mocked(ioMock).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('getSocket', () => {
    it('creates a socket using the API origin stripped of the /api suffix', async () => {
      mockLocalStorage.setItem('token', 'test-token');
      const fake = makeFakeSocket();
      vi.mocked(ioMock).mockReturnValue(fake as never);

      const { getSocket } = await import('../socket');
      getSocket();

      expect(ioMock).toHaveBeenCalledTimes(1);
      const [url] = vi.mocked(ioMock).mock.calls[0];
      expect(url).toBe('http://localhost:3001');
    });

    it('passes the JWT from localStorage in the auth handshake', async () => {
      mockLocalStorage.setItem('token', 'my.jwt.token');
      const fake = makeFakeSocket();
      vi.mocked(ioMock).mockReturnValue(fake as never);

      const { getSocket } = await import('../socket');
      getSocket();

      const [, opts] = vi.mocked(ioMock).mock.calls[0] as [string, { auth: { token: string } }];
      expect(opts.auth).toEqual({ token: 'my.jwt.token' });
    });

    it('returns the same socket instance on subsequent calls', async () => {
      mockLocalStorage.setItem('token', 'token-a');
      const fake = makeFakeSocket();
      vi.mocked(ioMock).mockReturnValue(fake as never);

      const { getSocket } = await import('../socket');
      const first = getSocket();
      const second = getSocket();

      expect(first).toBe(second);
      expect(ioMock).toHaveBeenCalledTimes(1);
    });

    it('returns null when no token is in localStorage', async () => {
      const { getSocket } = await import('../socket');

      const socket = getSocket();

      expect(socket).toBeNull();
      expect(ioMock).not.toHaveBeenCalled();
    });

    it('returns null in non-browser environments', async () => {
      vi.unstubAllGlobals();
      vi.stubGlobal('window', undefined);

      const { getSocket } = await import('../socket');

      const socket = getSocket();

      expect(socket).toBeNull();
      expect(ioMock).not.toHaveBeenCalled();
    });
  });

  describe('disconnectSocket', () => {
    it('disconnects the current socket and clears the singleton', async () => {
      mockLocalStorage.setItem('token', 'token-a');
      const fake = makeFakeSocket();
      const replacement = makeFakeSocket();
      vi.mocked(ioMock)
        .mockReturnValueOnce(fake as never)
        .mockReturnValueOnce(replacement as never);

      const { getSocket, disconnectSocket } = await import('../socket');
      const original = getSocket();
      disconnectSocket();

      expect(fake.disconnect).toHaveBeenCalledTimes(1);
      const next = getSocket();
      expect(next).not.toBe(original);
      expect(ioMock).toHaveBeenCalledTimes(2);
    });

    it('is a no-op when no socket exists', async () => {
      const { disconnectSocket } = await import('../socket');

      expect(() => disconnectSocket()).not.toThrow();
    });
  });
});
