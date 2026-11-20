// Server-side SRD data fetching for the races reference page, the only public
// reference page still rendered on the server. These endpoints live on the
// un-guarded, 24h-cached SrdController
// — user-invariant content, safe to fetch without a session and to share across
// requests. (VEG-320)
//
// This module must only be imported from server components. It deliberately does
// NOT use the browser-oriented `apiFetch` (which reads document.cookie and
// redirects via window.location) — server fetches carry no caller identity.

import { serverApiUrl } from './api-base';

// A server component cannot use the browser's relative /api, because a fetch
// on the Next server has no page origin to resolve it against. serverApiUrl()
// gives the address the Next server itself reaches the backend on.
// INTERNAL_API_URL sets it in Docker (http://backend:3001/api, the compose
// service name), and local dev falls back to the backend on the host.
// It is read on every call, so the container's runtime env applies, not the
// env of the image build.

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
  const res = await fetch(`${serverApiUrl()}${path}`, {
    next: { revalidate: SRD_REVALIDATE_SECONDS },
  });
  if (!res.ok) {
    throw new Error(`SRD fetch failed (${res.status}) for ${path}`);
  }
  return res.json() as Promise<T>;
}
