import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchSrdList, SRD_REVALIDATE_SECONDS } from '../srd-server';

describe('fetchSrdList', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function okResponse(body: unknown) {
    return {
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(body),
    } as unknown as Response;
  }

  it('fetches the given path against the configured API base with a revalidate hint', async () => {
    const data = [{ id: 'c1', name: 'Fighter' }];
    vi.mocked(fetch).mockResolvedValue(okResponse(data));

    const result = await fetchSrdList<typeof data>('/srd/classes');

    expect(result).toEqual(data);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toMatch(/\/srd\/classes$/);
    expect(init).toEqual(expect.objectContaining({ next: { revalidate: SRD_REVALIDATE_SECONDS } }));
  });

  it('does not send credentials (server fetches carry no caller identity)', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse([]));

    await fetchSrdList('/srd/races');

    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect((init as RequestInit)?.credentials).toBeUndefined();
  });

  it('throws on a non-OK response so the page can render its error state', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 503,
      json: vi.fn(),
    } as unknown as Response);

    await expect(fetchSrdList('/srd/backgrounds')).rejects.toThrow(/503/);
  });
});
