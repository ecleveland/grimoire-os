// Server-side SRD data fetching for the public reference pages (classes, races,
// backgrounds). These endpoints live on the un-guarded, 24h-cached SrdController
// — user-invariant content, safe to fetch without a session and to share across
// requests. (VEG-320)
//
// This module must only be imported from server components. It deliberately does
// NOT use the browser-oriented `apiFetch` (which reads document.cookie and
// redirects via window.location) — server fetches carry no caller identity.

// In browser-rendered paths the app reaches the backend at NEXT_PUBLIC_API_URL
// (the host-published address, e.g. http://localhost:3001/api). A server
// component running inside the frontend container cannot use that — `localhost`
// there is the frontend container itself, not the backend. INTERNAL_API_URL
// supplies the container-reachable address (e.g. http://backend:3001/api) in
// Docker; it falls back to the public URL for local dev, where the Next server
// and the backend share the host's localhost.
const SERVER_API_URL =
  process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

// SRD reference content is user-invariant and rarely edited (only admins curate
// shared rows), and the backend already caches it for 24h. An hour of Next
// data-cache keeps SSR off the backend on hot paths without staling admin edits
// for long.
export const SRD_REVALIDATE_SECONDS = 3600;

/**
 * Fetch a public SRD reference list server-side with revalidation caching.
 * Throws on a non-OK response so the calling page can render its error state.
 */
export async function fetchSrdList<T>(path: string): Promise<T> {
  const res = await fetch(`${SERVER_API_URL}${path}`, {
    next: { revalidate: SRD_REVALIDATE_SECONDS },
  });
  if (!res.ok) {
    throw new Error(`SRD fetch failed (${res.status}) for ${path}`);
  }
  return res.json() as Promise<T>;
}
