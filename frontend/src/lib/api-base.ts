// Where the app reaches the backend API.
//
// The browser calls the relative /api on the origin that served the page. The
// Next server proxies those requests to the backend (see middleware.ts), so a
// deployment needs one public address and the bundle carries no host name.
// NEXT_PUBLIC_API_URL overrides this at build time, which dev.sh uses to point
// the browser straight at the backend on port 3001.
//
// Each variable is read as process.env.NAME in full, never through a computed
// key, because Next inlines NEXT_PUBLIC_ variables at build time only where the
// code names them literally.
export const BROWSER_API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

const DEV_SERVER_API_URL = 'http://localhost:3001/api';

/**
 * The backend address for code running in the Next server: server components
 * and the /api proxy. A server-side fetch has no page origin to resolve a
 * relative URL against, so this never returns one. INTERNAL_API_URL wins, then
 * an absolute NEXT_PUBLIC_API_URL, then the dev backend. Read on every call, so
 * a container picks up INTERNAL_API_URL at runtime, not from the image build.
 */
export function serverApiUrl(): string {
  const publicUrl = process.env.NEXT_PUBLIC_API_URL;
  const absolutePublicUrl = publicUrl && /^https?:\/\//i.test(publicUrl) ? publicUrl : undefined;
  const url = process.env.INTERNAL_API_URL || absolutePublicUrl || DEV_SERVER_API_URL;
  return url.replace(/\/+$/, '');
}
