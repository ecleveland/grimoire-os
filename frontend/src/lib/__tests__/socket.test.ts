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

describe('socket', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.mocked(ioMock).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('getSocket', () => {
    it('creates a socket using the API origin stripped of the /api suffix', async () => {
      const fake = makeFakeSocket();
      vi.mocked(ioMock).mockReturnValue(fake as never);

      const { getSocket } = await import('../socket');
      getSocket();

      expect(ioMock).toHaveBeenCalledTimes(1);
      const [url] = vi.mocked(ioMock).mock.calls[0];
      expect(url).toBe('http://localhost:3001');
    });

    it('opens the connection with withCredentials so the cookie rides along', async () => {
      const fake = makeFakeSocket();
      vi.mocked(ioMock).mockReturnValue(fake as never);

      const { getSocket } = await import('../socket');
      getSocket();

      const [, opts] = vi.mocked(ioMock).mock.calls[0] as [
        string,
        { withCredentials: boolean; auth?: unknown },
      ];
      expect(opts.withCredentials).toBe(true);
    });

    it('does NOT pass an auth handshake (cookie is the auth mechanism)', async () => {
      const fake = makeFakeSocket();
      vi.mocked(ioMock).mockReturnValue(fake as never);

      const { getSocket } = await import('../socket');
      getSocket();

      const [, opts] = vi.mocked(ioMock).mock.calls[0] as [string, { auth?: { token?: string } }];
      expect(opts.auth).toBeUndefined();
    });

    it('returns the same socket instance on subsequent calls', async () => {
      const fake = makeFakeSocket();
      vi.mocked(ioMock).mockReturnValue(fake as never);

      const { getSocket } = await import('../socket');
      const first = getSocket();
      const second = getSocket();

      expect(first).toBe(second);
      expect(ioMock).toHaveBeenCalledTimes(1);
    });

    it('returns null in non-browser environments', async () => {
      vi.stubGlobal('window', undefined);

      const { getSocket } = await import('../socket');

      const socket = getSocket();

      expect(socket).toBeNull();
      expect(ioMock).not.toHaveBeenCalled();
    });
  });

  describe('disconnectSocket', () => {
    it('disconnects the current socket and clears the singleton', async () => {
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
