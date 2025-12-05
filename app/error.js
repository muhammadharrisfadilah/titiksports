'use client';

import Link from 'next/link';

export default function Error({ error, reset }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-netflix-black via-netflix-darkGray to-netflix-black">
      <div className="relative z-10 w-full max-w-md p-8">
        <div className="bg-black/70 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/10 p-8 text-center">
          <svg
            className="w-16 h-16 text-netflix-red mx-auto mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4v2m0 4v2m0-12V9m0 8v2m-6-4h12a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2v-8a2 2 0 012-2zm0-4h12a2 2 0 012 2V7a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2z"
            />
          </svg>

          <h1 className="text-3xl font-bold text-netflix-red mb-2">Terjadi Kesalahan</h1>
          <p className="text-gray-400 mb-4">{error?.message || 'Something went wrong'}</p>

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
              Kembali ke Home
            </Link>
          </div>

          <p className="text-gray-500 text-xs mt-6">
            Jika masalah terus terjadi, hubungi support kami
          </p>
        </div>
      </div>
    </div>
  );
}
