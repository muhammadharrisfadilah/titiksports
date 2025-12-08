import { NextResponse } from 'next/server';
import { createMatch, getMatches, updateMatch, deleteMatch, getMatchById } from '@/lib/supabase';
export const runtime = 'edge';
export const dynamic = 'force-dynamic';
// Utility to sanitize stream URLs
function sanitizeStreamUrl(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    // Only allow http and https
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    // Reject private IPs
    const hostname = parsed.hostname.toLowerCase();
    if (['localhost', '127.0.0.1', '::1'].includes(hostname)) return null;
    if (hostname.startsWith('10.') || hostname.startsWith('192.168.') || hostname.startsWith('172.')) return null;
    return url;
  } catch {
    return null;
  }
}

// Middleware untuk verify admin token
async function verifyAdmin(request) {
  try {
    const authHeader = request.headers.get('authorization');
    const cookieToken = request.cookies.get('adminToken')?.value;

    const token = authHeader?.replace('Bearer ', '') || cookieToken;

    if (!token) {
      return { authenticated: false, error: 'No token provided' };
    }

    // Expect token format: base64(username:timestamp) or signed tokens in future
    let decoded;
    try {
      // Buffer may not exist in some runtimes (Edge), but Node supports it.
      if (typeof Buffer !== 'undefined') {
        decoded = Buffer.from(token, 'base64').toString('utf-8');
      } else if (typeof atob === 'function') {
        decoded = atob(token);
      } else {
        return { authenticated: false, error: 'Runtime not supported for token decoding' };
      }
    } catch (e) {
      return { authenticated: false, error: 'Invalid token encoding' };
    }

    const parts = decoded.split(':');
    if (parts.length < 2) return { authenticated: false, error: 'Invalid token format' };

    const username = parts[0];
    const timestamp = parseInt(parts[1], 10);
    if (!Number.isFinite(timestamp)) return { authenticated: false, error: 'Invalid token timestamp' };

    const age = Date.now() - timestamp;
    if (age >= 7200000 || age < -60000) { // 2 hours, allow small clock skew
      return { authenticated: false, error: 'Token expired' };
    }

    return { authenticated: true, username };
  } catch (error) {
    return { authenticated: false, error: 'Invalid token' };
  }
}

/**
 * GET /api/matches - Get all matches
 */
export async function GET(request) {
  try {
    const matches = await getMatches();

    return NextResponse.json({
      success: true,
      data: matches,
      count: matches.length,
    });
  } catch (error) {
    console.error('GET matches error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Gagal mengambil data pertandingan',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/matches - Create new match (Admin only)
 */
export async function POST(request) {
  try {
    // Verify admin
    const auth = await verifyAdmin(request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    console.log('📝 POST /api/matches - body:', { home_team: body.home_team, away_team: body.away_team });

    // Comprehensive validation
    if (!body.home_team || !body.away_team) {
      return NextResponse.json(
        {
          success: false,
          error: 'home_team dan away_team harus diisi',
        },
        { status: 400 }
      );
    }

    // Sanitize input
    const sanitizedBody = {
      home_team: String(body.home_team || '').trim().slice(0, 255),
      away_team: String(body.away_team || '').trim().slice(0, 255),
      start_time: body.start_time ? new Date(body.start_time).toISOString() : null,
      stream_url1: body.stream_url1 ? sanitizeStreamUrl(body.stream_url1) : null,
      stream_url2: body.stream_url2 ? sanitizeStreamUrl(body.stream_url2) : null,
      stream_url3: body.stream_url3 ? sanitizeStreamUrl(body.stream_url3) : null,
      status: ['live', 'upcoming', 'ended'].includes(body.status) ? body.status : 'upcoming',
    };

    console.log('🔍 Sanitized body:', sanitizedBody);

    // Validate stream URLs format
    for (const key of ['stream_url1', 'stream_url2', 'stream_url3']) {
      if (sanitizedBody[key]) {
        try {
          new URL(sanitizedBody[key]);
        } catch (e) {
          return NextResponse.json(
            { success: false, error: `Invalid URL format for ${key}` },
            { status: 400 }
          );
        }
      }
    }

    console.log('💾 Calling createMatch...');
    const result = await createMatch(sanitizedBody);
    console.log('✅ createMatch result:', result);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Pertandingan berhasil dibuat',
        data: result.data,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('❌ POST matches error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Gagal membuat pertandingan',
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/matches - Update match (Admin only)
 * Expects query param: ?id=<matchId>
 */
export async function PUT(request) {
  try {
    // Verify admin
    const auth = await verifyAdmin(request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const matchId = searchParams.get('id');

    if (!matchId) {
      return NextResponse.json(
        { success: false, error: 'Match ID harus diberikan' },
        { status: 400 }
      );
    }

    const body = await request.json();

    const result = await updateMatch(matchId, body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Pertandingan berhasil diupdate',
      data: result.data,
    });
  } catch (error) {
    console.error('PUT matches error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Gagal mengupdate pertandingan',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/matches - Delete match (Admin only)
 * Expects query param: ?id=<matchId>
 */
export async function DELETE(request) {
  try {
    // Verify admin
    const auth = await verifyAdmin(request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const matchId = searchParams.get('id');

    if (!matchId) {
      return NextResponse.json(
        { success: false, error: 'Match ID harus diberikan' },
        { status: 400 }
      );
    }

    const result = await deleteMatch(matchId);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Pertandingan berhasil dihapus',
    });
  } catch (error) {
    console.error('DELETE matches error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Gagal menghapus pertandingan',
      },
      { status: 500 }
    );
  }
}
