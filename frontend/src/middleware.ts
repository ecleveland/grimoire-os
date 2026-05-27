import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/register', '/srd'];

export function middleware(request: NextRequest) {
  // Presence-only check — the backend remains the source of truth for the
  // actual JWT validity. The middleware just decides whether to show /login
  // versus an authenticated route based on whether the cookie was issued.
  const hasAuthCookie = Boolean(request.cookies.get('access_token'));
  const { pathname } = request.nextUrl;

  const isPublicPath = PUBLIC_PATHS.some(p => pathname.startsWith(p));

  if (!hasAuthCookie && !isPublicPath) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (hasAuthCookie && (pathname === '/login' || pathname === '/register')) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
