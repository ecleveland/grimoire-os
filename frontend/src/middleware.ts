import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/register', '/srd'];

export function middleware(request: NextRequest) {
  const token = request.cookies.get('auth-flag');
  const { pathname } = request.nextUrl;

  const isPublicPath = PUBLIC_PATHS.some(p => pathname.startsWith(p));

  if (!token && !isPublicPath) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (token && (pathname === '/login' || pathname === '/register')) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
