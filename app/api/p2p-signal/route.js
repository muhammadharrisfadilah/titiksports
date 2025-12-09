// app/api/p2p-signal/route.js
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const SIGNAL_TTL_SECONDS = 60;

// ✅ Types yang dipakai P2P Engine
const VALID_TYPES = ['announce', 'offer', 'answer', 'ice-candidate', 'candidate', 'bye', 'join', 'leave'];

/**
 * POST /api/p2p-signal
 */
export async function POST(request) {
  try {
    const body = await request.json();
    
    // ✅ Support kedua format (camelCase dan snake_case)
    const room_id = body.room_id || body.roomId;
    const from_peer = body.from_peer || body.peerId || body.fromPeer;
    const to_peer = body.to_peer || body.to || body.targetPeerId || body.toPeer || null;
    const type = body.type;
    const payload = body.payload || body.signal || body.data || {};

    // Validasi
    if (!room_id || !from_peer || !type) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Missing required fields',
          required: ['room_id/roomId', 'from_peer/peerId', 'type'],
          received: Object.keys(body)
        },
        { status: 400 }
      );
    }

    // Validasi type
    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { success: false, error: `Invalid type: ${type}. Valid: ${VALID_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    // Jika Supabase tidak ada, return success (fallback mode)
    if (!supabaseAdmin) {
      console.log(`[P2P] Fallback mode: ${type} from ${from_peer}`);
      return NextResponse.json({ success: true, fallback: true });
    }

    // Generate ID unik
    const id = `${room_id}:${from_peer}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const expiresAt = new Date(Date.now() + SIGNAL_TTL_SECONDS * 1000).toISOString();

    const { data, error } = await supabaseAdmin
      .from('signals')
      .insert([{
        id,
        room_id,
        from_peer,
        to_peer,
        type,
        payload: typeof payload === 'object' ? JSON.stringify(payload) : payload,
        expires_at: expiresAt,
      }])
      .select()
      .single();

    if (error) {
      console.error('[P2P Signal] Insert error:', error.message);
      // Return success anyway to not break P2P
      return NextResponse.json({ success: true, warning: error.message });
    }

    console.log(`[P2P] ✅ ${type}: ${from_peer} → ${to_peer || 'broadcast'}`);

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('[P2P Signal] Error:', err.message);
    // Return success to not break P2P flow
    return NextResponse.json({ success: true, error: err.message });
  }
}

/**
 * GET /api/p2p-signal?room_id=...&peer=...
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Support kedua format
    const room_id = searchParams.get('room_id') || searchParams.get('roomId');
    const peer = searchParams.get('peer') || searchParams.get('peerId');

    if (!room_id || !peer) {
      return NextResponse.json(
        { success: false, error: 'room_id dan peer required' },
        { status: 400 }
      );
    }

    // Fallback jika Supabase tidak ada
    if (!supabaseAdmin) {
      return NextResponse.json({ success: true, data: [], count: 0 });
    }

    const now = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('signals')
      .select('*')
      .eq('room_id', room_id)
      .neq('from_peer', peer)
      .or(`to_peer.eq.${peer},to_peer.is.null`)
      .gt('expires_at', now)
      .order('created_at', { ascending: true })
      .limit(50);

    if (error) {
      console.error('[P2P Signal] Fetch error:', error.message);
      return NextResponse.json({ success: true, data: [], count: 0 });
    }

    // Background cleanup
    cleanupExpiredSignals(room_id).catch(() => {});

    // Parse payload back to object
    const parsedData = (data || []).map(signal => {
      try {
        if (typeof signal.payload === 'string') {
          signal.payload = JSON.parse(signal.payload);
        }
      } catch (e) {}
      return signal;
    });

    return NextResponse.json({
      success: true,
      data: parsedData,
      count: parsedData.length,
    });
  } catch (err) {
    console.error('[P2P Signal] GET error:', err.message);
    return NextResponse.json({ success: true, data: [], count: 0 });
  }
}

/**
 * DELETE /api/p2p-signal
 */
export async function DELETE(request) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ success: true, deleted: 0 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const room_id = searchParams.get('room_id') || searchParams.get('roomId');
    const peer = searchParams.get('peer') || searchParams.get('peerId');

    if (id) {
      await supabaseAdmin.from('signals').delete().eq('id', id);
      return NextResponse.json({ success: true, deleted: 1 });
    }

    if (room_id && peer) {
      const { count } = await supabaseAdmin
        .from('signals')
        .delete()
        .eq('room_id', room_id)
        .eq('from_peer', peer);

      return NextResponse.json({ success: true, deleted: count || 0 });
    }

    return NextResponse.json({ success: true, deleted: 0 });
  } catch (err) {
    return NextResponse.json({ success: true, deleted: 0 });
  }
}

/**
 * Cleanup expired signals
 */
async function cleanupExpiredSignals(room_id) {
  if (!supabaseAdmin) return;
  
  try {
    const now = new Date().toISOString();
    await supabaseAdmin
      .from('signals')
      .delete()
      .eq('room_id', room_id)
      .lt('expires_at', now);
  } catch (e) {}
}