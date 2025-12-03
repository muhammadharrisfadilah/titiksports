import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-netflix-black">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gradient-red mb-4">404</h1>
        <p className="text-2xl mb-8 text-gray-400">Halaman tidak ditemukan</p>
        <Link href="/" className="btn btn-primary">
          ← Kembali ke Home
        </Link>
      </div>
    </div>
  );
}