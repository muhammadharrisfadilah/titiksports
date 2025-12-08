import { NextResponse } from 'next/server';
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Admin credentials from environment variables
const ADMIN_USERNAME = process.env.NEXT_PUBLIC_ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || '123';
const TOKEN_SECRET = process.env.NEXT_PUBLIC_TOKEN_SECRET || 'teskunci123';

/**
 * Generate HMAC-SHA256 using Web Crypto API (Edge Runtime compatible)
 */
async function generateHMAC(data, secret) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(data)
  );
  
  // Convert to hex
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

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

    // Generate token with HMAC-SHA256
    const timestamp = Date.now();
    const tokenData = `${username}:${timestamp}`;
    
    // Generate HMAC-SHA256 using Web Crypto API
    const signature = await generateHMAC(tokenData, TOKEN_SECRET);
    
    // Encode: base64(username:timestamp:signature)
    const fullTokenData = `${tokenData}:${signature}`;
    const token = btoa(fullTokenData); // Use btoa instead of Buffer

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
 * Verify token with HMAC
 */
async function verifyTokenHMAC(token, secret) {
  try {
    // Decode token
    const decoded = atob(token);
    const parts = decoded.split(':');
    
    if (parts.length !== 3) return false;
    
    const [username, timestamp, signature] = parts;
    
    // Verify HMAC
    const expectedSignature = await generateHMAC(`${username}:${timestamp}`, secret);
    
    // Constant-time comparison
    if (signature !== expectedSignature) return false;
    
    // Check expiry
    const age = Date.now() - parseInt(timestamp);
    if (age < 0 || age >= 7200000) return false; // 2 hours
    
    return { username, timestamp };
  } catch (e) {
    return false;
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

    // Verify token with HMAC
    const verified = await verifyTokenHMAC(token, TOKEN_SECRET);
    
    if (!verified) {
      return NextResponse.json(
        { authenticated: false },
        { status: 401 }
      );
    }

    return NextResponse.json({
      authenticated: true,
      username: verified.username,
      expiresIn: Math.round((7200000 - (Date.now() - parseInt(verified.timestamp))) / 1000),
    });
  } catch (error) {
    console.error('Verify error:', error);
    return NextResponse.json(
      { authenticated: false },
      { status: 500 }
    );
  }
}