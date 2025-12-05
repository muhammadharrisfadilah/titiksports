'use client';

import Link from 'next/link';

export default function Error({ error, reset }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-netflix-black via-netflix-darkGray to-netflix-black">
      <div className="relative z-10 w-full max-w-md p-8">
        <div className="bg-black/70 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/10 p-8 text-center">
          <svg
            className="w-16 h-16 text-yellow-500 mx-auto mb-4"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          </svg>

          <h1 className="text-3xl font-bold text-netflix-red mb-2">Tidak Bisa Memutar</h1>
          <p className="text-gray-400 mb-4">
            {error?.message || 'Gagal memuat streaming'}
          </p>

          <div className="space-y-3">
            <button
              onClick={() => reset()}
              className="btn btn-primary w-full"
            >
              Coba Lagi
            </button>
            <Link
              href="/"
              className="btn btn-secondary w-full text-center block"
            >
              ← Kembali ke Home
            </Link>
          </div>

          <p className="text-gray-500 text-xs mt-6">
            Jika masalah terus berlanjut:
            <br />
            • Cek koneksi internet
            <br />
            • Refresh halaman
            <br />
            • Coba link streaming lain
          </p>
        </div>
      </div>
    </div>
  );
}
