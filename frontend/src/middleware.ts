import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { serverApiUrl } from './lib/api-base';
import { isPublicPath, loginPathFor, resolveNextPath } from './lib/public-paths';
import { hasSessionCookie, SESSION_PRESENT_COOKIE_NAME } from './lib/session-cookie';

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // The browser calls the relative /api, and this rewrite proxies it to the
  // backend, so a deployment exposes one port and one origin. It runs before
  // the session check because API calls carry their own auth, and a signed-out
  // login must reach the backend instead of a redirect to /login. It lives here
  // and not in next.config's rewrites(), which next build resolves once and
  // writes into the image. serverApiUrl() reads INTERNAL_API_URL per request.
  if (pathname === '/api' || pathname.startsWith('/api/')) {
    return NextResponse.rewrite(new URL(`${serverApiUrl()}${pathname.slice(4)}${search}`));
  }

  // The check is for the presence of a session, not of the access token. The
  // access cookie expires after 15 minutes, while the session lasts as long as
  // the refresh token, and the client re-issues the access token through a
  // refresh on its first API call. The backend stays the judge of whether the
  // session is valid. A dead session ends in a logout that clears this cookie,
  // which is what keeps /login and / from bouncing each other. An access_token
  // cookie without session_present counts as signed out.
  const hasSession = hasSessionCookie(request.cookies.get(SESSION_PRESENT_COOKIE_NAME)?.value);

  if (!hasSession && !isPublicPath(pathname)) {
    return NextResponse.redirect(new URL(loginPathFor(pathname + search), request.url));
  }

  if (hasSession && (pathname === '/login' || pathname === '/register')) {
    const next = resolveNextPath(request.nextUrl.searchParams.get('next'));
    return NextResponse.redirect(new URL(next, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
