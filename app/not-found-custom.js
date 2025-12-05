'use client';

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-netflix-black via-netflix-darkGray to-netflix-black">
      <div className="relative z-10 text-center">
        <div className="mb-8">
          <h1 className="text-8xl font-bold text-netflix-red mb-4">404</h1>
          <h2 className="text-3xl font-bold text-white mb-4">Halaman Tidak Ditemukan</h2>
          <p className="text-gray-400 mb-8">
            Maaf, pertandingan atau halaman yang Anda cari tidak ada.
          </p>
        </div>

        <div className="space-y-4">
          <Link href="/" className="btn btn-primary inline-block">
            ← Kembali ke Home
          </Link>
        </div>

        <div className="mt-12 text-6xl">⚽</div>
      </div>
    </div>
  );
}
