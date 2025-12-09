// app/api/p2p-signal/route.js (IMPROVED)

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Signal TTL in seconds (60 seconds)
const SIGNAL_TTL_SECONDS = 60;

/**
 * POST /api/p2p-signal - Create a signal
 * Body: { room_id, from_peer, to_peer?, type, payload }
 */
export async function POST(request) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: 'Signaling not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { room_id, from_peer, to_peer = null, type, payload } = body;

    // Validation
    if (!room_id || !from_peer || !type) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: room_id, from_peer, type' },
        { status: 400 }
      );
    }

    // Validate type
    const validTypes = ['announce', 'offer', 'answer', 'candidate', 'bye'];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { success: false, error: `Invalid signal type. Must be one of: ${validTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // Generate unique ID
    const id = `${room_id}:${from_peer}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

    // ✅ Add expiry timestamp
    const expiresAt = new Date(Date.now() + SIGNAL_TTL_SECONDS * 1000).toISOString();

    const { data, error } = await supabaseAdmin
      .from('signals')
      .insert([{
        id,
        room_id,
        from_peer,
        to_peer,
        type,
        payload,
        expires_at: expiresAt, // ✅ TTL
      }])
      .select()
      .single();

    if (error) {
      console.error('[P2P Signal] Create error:', error.message);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    console.log(`[P2P Signal] Created: ${type} from ${from_peer} to ${to_peer || 'broadcast'}`);

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('[P2P Signal] POST error:', err.message);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/p2p-signal?room_id=...&peer=...
 * Fetch signals for a room, addressed to this peer or broadcast
 */
export async function GET(request) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: 'Signaling not configured' },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const room_id = searchParams.get('room_id');
    const peer = searchParams.get('peer');

    if (!room_id) {
      return NextResponse.json(
        { success: false, error: 'room_id required' },
        { status: 400 }
      );
    }

    if (!peer) {
      return NextResponse.json(
        { success: false, error: 'peer required' },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    // ✅ Improved query:
    // 1. Filter by room
    // 2. Exclude own signals (from_peer != peer)
    // 3. Only signals addressed to this peer OR broadcast
    // 4. Only non-expired signals
    const { data, error } = await supabaseAdmin
      .from('signals')
      .select('*')
      .eq('room_id', room_id)
      .neq('from_peer', peer) // ✅ Don't return own signals
      .or(`to_peer.eq.${peer},to_peer.is.null`) // To this peer or broadcast
      .gt('expires_at', now) // ✅ Not expired
      .order('created_at', { ascending: true })
      .limit(50);

    if (error) {
      console.error('[P2P Signal] Fetch error:', error.message);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    // ✅ Background cleanup of expired signals
    cleanupExpiredSignals(room_id).catch(e => 
      console.error('[P2P Signal] Cleanup error:', e.message)
    );

    return NextResponse.json({
      success: true,
      data: data || [],
      count: data?.length || 0,
    });
  } catch (err) {
    console.error('[P2P Signal] GET error:', err.message);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/p2p-signal?id=...&room_id=...
 * Delete a specific signal or all signals for a peer
 */
export async function DELETE(request) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: 'Signaling not configured' },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const room_id = searchParams.get('room_id');
    const peer = searchParams.get('peer'); // ✅ New: delete all signals from a peer

    if (id) {
      // Delete single signal
      const { error } = await supabaseAdmin
        .from('signals')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('[P2P Signal] Delete error:', error.message);
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true, deleted: 1 });
    }

    if (room_id && peer) {
      // ✅ Delete all signals from this peer (for cleanup on disconnect)
      const { error, count } = await supabaseAdmin
        .from('signals')
        .delete()
        .eq('room_id', room_id)
        .eq('from_peer', peer);

      if (error) {
        console.error('[P2P Signal] Bulk delete error:', error.message);
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 500 }
        );
      }

      console.log(`[P2P Signal] Deleted signals from ${peer} in ${room_id}`);
      return NextResponse.json({ success: true, deleted: count || 0 });
    }

    return NextResponse.json(
      { success: false, error: 'id or (room_id + peer) required' },
      { status: 400 }
    );
  } catch (err) {
    console.error('[P2P Signal] DELETE error:', err.message);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}

/**
 * ✅ Cleanup expired signals (background task)
 */
async function cleanupExpiredSignals(room_id) {
  const now = new Date().toISOString();

  const { error, count } = await supabaseAdmin
    .from('signals')
    .delete()
    .eq('room_id', room_id)
    .lt('expires_at', now);

  if (!error && count > 0) {
    console.log(`[P2P Signal] Cleaned up ${count} expired signals in ${room_id}`);
  }
}