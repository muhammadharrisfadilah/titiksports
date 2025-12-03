import Link from 'next/link';
import { getMatches } from '@/lib/supabase';
import MatchCard from '@/components/match-card';
import AdBanner from '@/components/ad-banner';

export const revalidate = 30; // Revalidate setiap 30 detik

export default async function HomePage() {
  const matches = await getMatches();

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-netflix-black/95 backdrop-blur-sm border-b border-white/10">
        <div className="container-custom py-4 flex justify-between items-center">
          <Link href="/" className="text-3xl font-bold text-gradient-red">
            ⚽ TitikBola
          </Link>
          <Link
            href="/admin/login"
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            Admin
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative h-[60vh] min-h-[450px] flex items-center justify-center text-center bg-gradient-to-b from-netflix-black via-netflix-darkGray to-netflix-black">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-20"
          style={{
            backgroundImage:
              'url(https://images.unsplash.com/photo-1556056504-5c7696c4c28d?w=1920)',
          }}
        />
        <div className="relative z-10 max-w-3xl px-4 animate-fadeIn">
          <div className="inline-block mb-4 px-4 py-2 bg-netflix-red rounded-full text-sm font-bold animate-pulse-slow">
            🔴 LIVE SEKARANG
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-4 leading-tight">
            Nonton Pertandingan Bola
            <br />
            Favorit Kamu, Live!
          </h1>
          <p className="text-lg md:text-xl text-gray-300">
            Streaming HD berkualitas tinggi, tanpa buffering.
            <br />
            100% GRATIS, tanpa registrasi.
          </p>
        </div>
      </section>

      {/* Ad Banner */}
      <AdBanner type="banner" />

      {/* Matches Section */}
      <section className="py-12 bg-netflix-black">
        <div className="container-custom">
          <h2 className="text-3xl font-bold mb-8 flex items-center gap-2">
            🔥 Pertandingan
          </h2>
          
          {matches.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-gray-400 text-lg">
                Belum ada pertandingan tersedia
              </p>
              <p className="text-gray-500 mt-2">Segera hadir!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fadeIn">
              {matches.map((match) => (
                <MatchCard key={match.id} match={match} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Ad Banner */}
      <AdBanner type="medium" />

      {/* Features Section */}
      <section className="py-16 bg-black">
        <div className="container-custom">
          <h2 className="text-3xl font-bold mb-12 text-center">
            Kenapa Pilih TitikBola?
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              {
                icon: '📺',
                title: 'HD Quality',
                desc: 'Streaming dengan kualitas HD hingga Full HD',
              },
              {
                icon: '⚡',
                title: 'Zero Buffering',
                desc: 'Server cepat dan stabil untuk pengalaman terbaik',
              },
              {
                icon: '📱',
                title: 'Multi Device',
                desc: 'Tonton di smartphone, tablet, atau desktop',
              },
              {
                icon: '💰',
                title: '100% GRATIS',
                desc: 'Tidak ada biaya, tidak ada registrasi',
              },
            ].map((feature, i) => (
              <div
                key={i}
                className="card p-6 text-center hover:scale-105 transition-transform"
              >
                <div className="text-5xl mb-4">{feature.icon}</div>
                <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
                <p className="text-gray-400 text-sm">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 bg-netflix-black">
        <div className="container-custom max-w-4xl">
          <h2 className="text-3xl font-bold mb-8 text-center">
            Pertanyaan Umum
          </h2>
          <div className="space-y-4">
            {[
              {
                q: 'Apa itu TitikBola?',
                a: 'TitikBola adalah platform streaming pertandingan sepak bola live dengan kualitas HD. 100% gratis tanpa registrasi.',
              },
              {
                q: 'Apakah benar-benar gratis?',
                a: 'Ya! 100% gratis. Tidak ada biaya tersembunyi. Anda bisa mendukung kami dengan donasi sukarela.',
              },
              {
                q: 'Apakah bisa ditonton di HP?',
                a: 'Ya! TitikBola fully responsive dan bisa ditonton di semua perangkat.',
              },
            ].map((faq, i) => (
              <details key={i} className="card p-6 group">
                <summary className="font-semibold cursor-pointer flex justify-between items-center">
                  <span>{faq.q}</span>
                  <span className="text-2xl group-open:rotate-45 transition-transform">
                    +
                  </span>
                </summary>
                <p className="mt-4 text-gray-400 leading-relaxed">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 bg-black border-t border-white/10">
        <div className="container-custom text-center text-gray-400">
          <p>&copy; 2025 TitikBola. All rights reserved.</p>
          <p className="mt-2 text-sm">
            Streaming pertandingan sepak bola berkualitas tinggi
          </p>
        </div>
      </footer>
    </div>
  );
}