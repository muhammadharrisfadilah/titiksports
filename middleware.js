import { NextResponse } from 'next/server';

/**
 * Middleware untuk protect /admin routes
 * Note: Middleware runs on server, so it cannot access localStorage
 * Token validation happens on the client-side instead
 */
export function middleware(request) {
  const { pathname } = request.nextUrl;

  // Skip middleware untuk /admin/login - allow access freely
  if (pathname === '/admin/login') {
    return NextResponse.next();
  }

  // For /admin pages, we'll let client-side handle auth
  // Since localStorage is not accessible in middleware
  if (pathname.startsWith('/admin')) {
    // Just allow the request - client will redirect if no token
    return NextResponse.next();
  }

  return NextResponse.next();
}

// Configure which routes use this middleware
export const config = {
  matcher: ['/admin/:path*'],
};
