import { NextResponse } from 'next/server';

/**
 * Middleware untuk protect /admin routes
 * Verify admin authentication sebelum mengakses admin pages
 */
export function middleware(request) {
  const { pathname } = request.nextUrl;

  // Skip middleware untuk routes yang tidak memerlukan auth
  if (pathname === '/admin/login') {
    return NextResponse.next();
  }

  // Protect admin routes
  if (pathname.startsWith('/admin')) {
    const token = request.cookies.get('adminToken')?.value;

    if (!token) {
      // Redirect ke login jika tidak ada token
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }

    try {
      // Verify token validity
      const decoded = Buffer.from(token, 'base64').toString('utf-8');
      const [username, timestamp] = decoded.split(':');
      const age = Date.now() - parseInt(timestamp);

      // Check if token expired (2 hours)
      if (age >= 7200000) {
        const response = NextResponse.redirect(new URL('/admin/login', request.url));
        response.cookies.delete('adminToken');
        return response;
      }
    } catch (error) {
      // Invalid token format
      const response = NextResponse.redirect(new URL('/admin/login', request.url));
      response.cookies.delete('adminToken');
      return response;
    }
  }

  return NextResponse.next();
}

// Configure which routes use this middleware
export const config = {
  matcher: ['/admin/:path*'],
};
