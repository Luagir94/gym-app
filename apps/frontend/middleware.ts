import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Next.js middleware for route protection.
 *
 * Rules:
 * - No session → redirect to /login
 * - role=ADMIN → allowed on /admin/*, redirected away from /me/*
 * - role=MEMBER → allowed on /me/*, redirected away from /admin/*
 *
 * NOTE: Better Auth session validation in Edge runtime is done via
 * the session cookie. In PR6 (frontend routes), this will be wired
 * to auth.api.getSession(). For the spike, the middleware structure
 * is scaffolded correctly but the session check is a stub.
 *
 * The JWKS endpoint and auth API routes are excluded from middleware.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip auth API routes (Better Auth handles these directly)
  if (pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }

  // Public routes
  if (pathname === '/login' || pathname === '/') {
    return NextResponse.next();
  }

  // Read session from cookie (Better Auth sets this as 'better-auth.session_token')
  const sessionToken =
    request.cookies.get('better-auth.session_token')?.value ??
    request.cookies.get('__Secure-better-auth.session_token')?.value;

  if (!sessionToken) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Role-based routing will be fully implemented in PR6 when we have
  // server-side session validation. For the spike, the session presence
  // is sufficient to prove the middleware wiring.
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public files
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
