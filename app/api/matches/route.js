import { NextResponse } from 'next/server';
import { createMatch, getMatches, updateMatch, deleteMatch, getMatchById } from '@/lib/supabase';

// Middleware untuk verify admin token
async function verifyAdmin(request) {
  try {
    const authHeader = request.headers.get('authorization');
    const cookieToken = request.cookies.get('adminToken')?.value;

    const token = authHeader?.replace('Bearer ', '') || cookieToken;

    if (!token) {
      return { authenticated: false, error: 'No token provided' };
    }

    // Simple token validation
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const [username, timestamp] = decoded.split(':');
    const age = Date.now() - parseInt(timestamp);

    if (age >= 7200000) { // 2 hours
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

    // Validate required fields
    if (!body.home_team || !body.away_team) {
      return NextResponse.json(
        {
          success: false,
          error: 'home_team dan away_team harus diisi',
        },
        { status: 400 }
      );
    }

    const result = await createMatch(body);

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
    console.error('POST matches error:', error);
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
