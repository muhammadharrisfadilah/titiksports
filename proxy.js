// middleware.js - GANTI JADI INI
import { NextResponse } from 'next/server';

export function proxy(request) {
  // Cloudflare Pages tidak butuh middleware khusus
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};