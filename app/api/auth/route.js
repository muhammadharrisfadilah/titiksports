import { NextResponse } from 'next/server';

// Admin credentials from environment variables
const ADMIN_USERNAME = process.env.NEXT_PUBLIC_ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || '123';
const TOKEN_SECRET = process.env.NEXT_PUBLIC_TOKEN_SECRET || 'teskunci123';

/**
 * POST /api/auth - Login endpoint
 * Body: { username, password }
 * Returns: { success, token, error }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { username, password, action } = body;

    // Handle logout action
    if (action === 'logout') {
      return NextResponse.json({
        success: true,
        message: 'Logged out successfully',
      });
    }

    // Validate credentials
    if (!username || !password) {
      return NextResponse.json(
        {
          success: false,
          error: 'Username dan password harus diisi',
        },
        { status: 400 }
      );
    }

    // Check credentials
    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
      return NextResponse.json(
        {
          success: false,
          error: 'Username atau password salah',
        },
        { status: 401 }
      );
    }

    // Generate token (HMAC-like token)
    const timestamp = Date.now();
    const tokenData = `${username}:${timestamp}:${TOKEN_SECRET}`;
    const token = Buffer.from(tokenData).toString('base64');

    // Set secure httpOnly cookie
    const response = NextResponse.json({
      success: true,
      token,
      message: 'Login berhasil',
    });

    response.cookies.set('adminToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7200, // 2 hours
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Auth error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Terjadi kesalahan server',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/auth/verify - Verify token
 */
export async function GET(request) {
  try {
    const authHeader = request.headers.get('authorization');
    const cookieToken = request.cookies.get('adminToken')?.value;

    const token = authHeader?.replace('Bearer ', '') || cookieToken;

    if (!token) {
      return NextResponse.json(
        { authenticated: false },
        { status: 401 }
      );
    }

    // Decode and verify token
    try {
      const decoded = Buffer.from(token, 'base64').toString('utf-8');
      const [username, timestamp, secret] = decoded.split(':');

      // Simple token validation
      if (username === ADMIN_USERNAME && secret === TOKEN_SECRET) {
        const age = Date.now() - parseInt(timestamp);
        if (age < 7200000) { // 2 hours
          return NextResponse.json({
            authenticated: true,
            username,
            expiresIn: Math.round((7200000 - age) / 1000),
          });
        }
      }
    } catch (e) {
      // Token decode failed
    }

    return NextResponse.json(
      { authenticated: false },
      { status: 401 }
    );
  } catch (error) {
    console.error('Verify error:', error);
    return NextResponse.json(
      { authenticated: false },
      { status: 500 }
    );
  }
}
