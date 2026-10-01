import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isPublicPath, loginPathFor, resolveNextPath } from './lib/public-paths';

export function middleware(request: NextRequest) {
  // Presence-only check — the backend remains the source of truth for the
  // actual JWT validity. The middleware just decides whether to show /login
  // versus an authenticated route based on whether the cookie was issued.
  const hasAuthCookie = Boolean(request.cookies.get('access_token'));
  const { pathname, search } = request.nextUrl;

  if (!hasAuthCookie && !isPublicPath(pathname)) {
    return NextResponse.redirect(new URL(loginPathFor(pathname + search), request.url));
  }

  if (hasAuthCookie && (pathname === '/login' || pathname === '/register')) {
    const next = resolveNextPath(request.nextUrl.searchParams.get('next'));
    return NextResponse.redirect(new URL(next, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
