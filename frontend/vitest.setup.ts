import '@testing-library/jest-dom';

// Node 22+ exposes an experimental `localStorage` global that is non-functional
// unless Node is started with --localstorage-file, and it shadows jsdom's
// Storage in the Vitest environment ("`--localstorage-file` was provided
// without a valid path" warning). Replace it with a spec-shaped in-memory
// implementation so code under test can use localStorage normally.
function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => {
      store.clear();
    },
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
  };
}

if (typeof localStorage === 'undefined' || typeof localStorage.clear !== 'function') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: createMemoryStorage(),
    writable: true,
    configurable: true,
  });
}
