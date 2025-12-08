import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
export const runtime = 'edge';
export const dynamic = 'force-dynamic';
// Helpers: verify admin token - accept either signed token (payload.sig) or legacy base64(username:timestamp)
async function verifyAdminTokenRaw(token) {
  if (!token) return false;

  // HMAC-signed token format: <base64(payload)>.<hexsig>
  if (token.includes('.')) {
    try {
      const [payloadB64, sigHex] = token.split('.', 2);
      const payload = typeof atob === 'function' ? atob(payloadB64) : Buffer.from(payloadB64, 'base64').toString('utf-8');
      const parts = payload.split(':');
      if (parts.length < 2) return false;
      const username = parts[0];
      const ts = parseInt(parts[2] || parts[1], 10);
      if (!Number.isFinite(ts)) return false;

      // verify signature using TOKEN_SECRET_KEY
      const secret = process.env.TOKEN_SECRET_KEY || process.env.NEXT_PUBLIC_TOKEN_SECRET;
      if (!secret) return false;
      // import crypto only on Node/Next server
      const enc = new TextEncoder();
      const keyData = enc.encode(secret);
      const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
      const sigBuf = new Uint8Array(sigHex.match(/.{1,2}/g).map(h => parseInt(h, 16))).buffer;
      const ok = await crypto.subtle.verify('HMAC', key, sigBuf, enc.encode(payload));
      return ok;
    } catch (e) {
      console.warn('Signed token verification failed:', e.message);
      return false;
    }
  }

  // fallback: legacy base64(username:timestamp)
  try {
    const decoded = typeof atob === 'function' ? atob(token) : Buffer.from(token, 'base64').toString('utf-8');
    const parts = decoded.split(':');
    if (parts.length < 2) return false;
    const username = parts[0];
    const ts = parseInt(parts[1], 10);
    if (!Number.isFinite(ts)) return false;
    const age = Date.now() - ts;
    if (age > 24 * 60 * 60 * 1000) return false; // older than 24h
    return true;
  } catch (e) {
    return false;
  }
}

// Cleanup old signals (DELETE). Protected: require admin token in Authorization header
export async function POST(request) {
  try {
    if (!supabaseAdmin) return NextResponse.json({ success: false, error: 'Supabase admin client not configured' }, { status: 500 });

    const authHeader = request.headers.get('authorization');
    if (!authHeader) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const token = authHeader.replace('Bearer ', '');
    const ok = await verifyAdminTokenRaw(token);
    if (!ok) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    // optional body param `olderThanSeconds` (default 300s)
    const body = await request.json().catch(() => ({}));
    const olderThan = Number(body.olderThanSeconds) || 300;
    const cutoff = new Date(Date.now() - olderThan * 1000).toISOString();

    const { error } = await supabaseAdmin.from('signals').delete().lt('created_at', cutoff);
    if (error) {
      console.error('Signals cleanup error:', error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: `Signals older than ${olderThan}s deleted` });
  } catch (err) {
    console.error('Signals cleanup exception:', err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
