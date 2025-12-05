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
    let token = request.cookies.get('adminToken')?.value;
    
    // Also check Authorization header (for fetch requests)
    if (!token) {
      const authHeader = request.headers.get('authorization');
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }

    if (!token) {
      // Redirect ke login jika tidak ada token
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }

    try {
      // Verify token validity with HMAC-SHA256
      const crypto = require('crypto');
      const tokenSecret = process.env.NEXT_PUBLIC_TOKEN_SECRET || 'teskunci123';
      const decoded = Buffer.from(token, 'base64').toString('utf-8');
      const [username, timestamp, signature] = decoded.split(':');
      
      if (!username || !timestamp || !signature) {
        const response = NextResponse.redirect(new URL('/admin/login', request.url));
        response.cookies.delete('adminToken');
        return response;
      }

      // Verify HMAC
      const expectedHmac = crypto.createHmac('sha256', tokenSecret);
      expectedHmac.update(`${username}:${timestamp}`);
      const expectedSignature = expectedHmac.digest('hex');
      
      // Constant-time comparison
      try {
        if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
          const age = Date.now() - parseInt(timestamp);
          if (age >= 0 && age < 7200000) {
            return NextResponse.next();
          }
        }
      } catch (e) {
        // Signature mismatch
      }
      
      const response = NextResponse.redirect(new URL('/admin/login', request.url));
      response.cookies.delete('adminToken');
      return response;
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
