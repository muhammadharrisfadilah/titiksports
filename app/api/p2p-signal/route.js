import { NextResponse } from 'next/server';
import supabaseClient, { supabaseAdmin } from '@/lib/supabase';

// Simple signaling API using Supabase `signals` table.
// POST /api/p2p-signal - create a signal { room_id, from_peer, to_peer?, type, payload }
// GET /api/p2p-signal?room_id=...&peer=... - fetch signals for a room (optionally only to a specific peer)
// DELETE /api/p2p-signal?id=... - delete a specific signal (caller responsibility)

export async function POST(request) {
	try {
		if (!supabaseAdmin) {
			return NextResponse.json({ success: false, error: 'Signaling not configured' }, { status: 500 });
		}

		const body = await request.json();
		const { room_id, from_peer, to_peer = null, type, payload } = body;
		if (!room_id || !from_peer || !type || !payload) {
			return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
		}

		const id = `${room_id}:${from_peer}:${Date.now()}:${Math.random().toString(36).slice(2,8)}`;

		const { data, error } = await supabaseAdmin
			.from('signals')
			.insert([{ id, room_id, from_peer, to_peer, type, payload }])
			.select()
			.single();

		if (error) {
			console.error('Signal create error:', error.message);
			return NextResponse.json({ success: false, error: error.message }, { status: 500 });
		}

		return NextResponse.json({ success: true, data });
	} catch (err) {
		console.error('POST signaling error:', err.message);
		return NextResponse.json({ success: false, error: err.message }, { status: 500 });
	}
}

export async function GET(request) {
	try {
		if (!supabaseAdmin) {
			return NextResponse.json({ success: false, error: 'Signaling not configured' }, { status: 500 });
		}

		const { searchParams } = new URL(request.url);
		const room_id = searchParams.get('room_id');
		const peer = searchParams.get('peer');

		if (!room_id) return NextResponse.json({ success: false, error: 'room_id required' }, { status: 400 });

		let query = supabaseAdmin.from('signals').select('*').eq('room_id', room_id);
		if (peer) {
			// fetch signals addressed to this peer or broadcast (to_peer IS NULL)
			query = query.or(`to_peer.eq.${peer},to_peer.is.null`);
		}

		const { data, error } = await query.order('created_at', { ascending: true }).limit(100);

		if (error) {
			console.error('Signal fetch error:', error.message);
			return NextResponse.json({ success: false, error: error.message }, { status: 500 });
		}

		return NextResponse.json({ success: true, data });
	} catch (err) {
		console.error('GET signaling error:', err.message);
		return NextResponse.json({ success: false, error: err.message }, { status: 500 });
	}
}

export async function DELETE(request) {
	try {
		if (!supabaseAdmin) {
			return NextResponse.json({ success: false, error: 'Signaling not configured' }, { status: 500 });
		}

		const { searchParams } = new URL(request.url);
		const id = searchParams.get('id');
		if (!id) return NextResponse.json({ success: false, error: 'id required' }, { status: 400 });

		const { error } = await supabaseAdmin.from('signals').delete().eq('id', id);
		if (error) {
			console.error('Signal delete error:', error.message);
			return NextResponse.json({ success: false, error: error.message }, { status: 500 });
		}

		return NextResponse.json({ success: true });
	} catch (err) {
		console.error('DELETE signaling error:', err.message);
		return NextResponse.json({ success: false, error: err.message }, { status: 500 });
	}
}
