const BASE_URL = 'https://www.dnd5eapi.co/api';
const MAX_CONCURRENCY = 5;
const MAX_RETRIES = 5;
const RETRY_BASE_MS = 1000;

async function fetchJson<T>(url: string): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) {
        // Rate limited — wait longer before retry
        const delay = RETRY_BASE_MS * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_MS * Math.pow(2, attempt - 1);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError ?? new Error('Max retries exceeded');
}

async function runPool<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
  label?: string,
): Promise<T[]> {
  const results: T[] = [];
  let index = 0;
  let completed = 0;
  const total = tasks.length;

  async function runNext(): Promise<void> {
    while (index < tasks.length) {
      const currentIndex = index++;
      results[currentIndex] = await tasks[currentIndex]();
      completed++;
      if (label && completed % 50 === 0) {
        console.log(`  Fetching ${label}: ${completed}/${total}...`);
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, tasks.length) },
    () => runNext(),
  );
  await Promise.all(workers);
  return results;
}

interface ApiListResponse {
  count: number;
  results: { index: string; name: string; url: string }[];
}

export async function fetchAllDetails<T>(endpoint: string): Promise<T[]> {
  const list = await fetchJson<ApiListResponse>(`${BASE_URL}/${endpoint}`);
  console.log(`  Found ${list.count} ${endpoint} in API`);

  const tasks = list.results.map(
    (item) => () => fetchJson<T>(`${BASE_URL}/${endpoint}/${item.index}`),
  );

  return runPool(tasks, MAX_CONCURRENCY, endpoint);
}
