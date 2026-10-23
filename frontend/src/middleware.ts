import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isPublicPath, loginPathFor, resolveNextPath } from './lib/public-paths';
import { hasSessionCookie, SESSION_PRESENT_COOKIE_NAME } from './lib/session-cookie';

export function middleware(request: NextRequest) {
  // The check is for the presence of a session, not of the access token. The
  // access cookie expires after 15 minutes, while the session lasts as long as
  // the refresh token, and the client re-issues the access token through a
  // refresh on its first API call. The backend stays the judge of whether the
  // session is valid. A dead session ends in a logout that clears this cookie,
  // which is what keeps /login and / from bouncing each other. An access_token
  // cookie without session_present counts as signed out.
  const hasSession = hasSessionCookie(request.cookies.get(SESSION_PRESENT_COOKIE_NAME)?.value);
  const { pathname, search } = request.nextUrl;

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
