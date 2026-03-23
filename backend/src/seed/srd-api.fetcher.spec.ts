import { fetchAllDetails } from "./srd-api.fetcher";

describe("SRD API Fetcher", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("fetches list then detail for each item", async () => {
    const mockFetch = jest
      .fn()
      // First call: list endpoint
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            count: 2,
            results: [
              { index: "item-a", name: "Item A", url: "/api/test/item-a" },
              { index: "item-b", name: "Item B", url: "/api/test/item-b" },
            ],
          }),
      })
      // Detail calls
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ index: "item-a", name: "Item A", detail: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ index: "item-b", name: "Item B", detail: true }),
      });

    global.fetch = mockFetch as unknown as typeof fetch;
    jest.spyOn(console, "log").mockImplementation();

    const results = await fetchAllDetails("test");

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      index: "item-a",
      name: "Item A",
      detail: true,
    });
    expect(results[1]).toEqual({
      index: "item-b",
      name: "Item B",
      detail: true,
    });
    expect(mockFetch).toHaveBeenCalledTimes(3); // 1 list + 2 details
  });

  it("retries on fetch failure", async () => {
    const mockFetch = jest
      .fn()
      // List endpoint succeeds
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            count: 1,
            results: [
              { index: "item-a", name: "Item A", url: "/api/test/item-a" },
            ],
          }),
      })
      // Detail: first attempt fails
      .mockRejectedValueOnce(new Error("Network error"))
      // Detail: second attempt succeeds
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ index: "item-a", name: "Item A" }),
      });

    global.fetch = mockFetch as unknown as typeof fetch;
    jest.spyOn(console, "log").mockImplementation();

    const results = await fetchAllDetails("test");

    expect(results).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(3); // 1 list + 1 fail + 1 retry
  });

  it("throws after max retries exhausted", async () => {
    const mockFetch = jest
      .fn()
      .mockRejectedValue(new Error("Persistent failure"));

    global.fetch = mockFetch as unknown as typeof fetch;
    jest.spyOn(console, "log").mockImplementation();

    await expect(fetchAllDetails("test")).rejects.toThrow("Persistent failure");
  }, 60000);
});
