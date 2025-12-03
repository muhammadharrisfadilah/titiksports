import { notFound } from 'next/navigation';
import { getMatchById, getMatches } from '@/lib/supabase';
import VideoPlayer from '@/components/video-player';
import AdBanner from '@/components/ad-banner';
import Link from 'next/link';

export const revalidate = 10;

// Generate static params for static export
export async function generateStaticParams() {
  try {
    const matches = await getMatches();
    
    return matches.map((match) => ({
      id: match.id.toString(),
    }));
  } catch (error) {
    console.error('Error generating static params:', error);
    return [];
  }
}

// Generate metadata - params must be awaited in Next.js 15+
export async function generateMetadata({ params }) {
  // Await params before accessing properties
  const resolvedParams = await params;
  const match = await getMatchById(resolvedParams.id);
  
  if (!match) {
    return {
      title: 'Match Not Found - TitikBola',
    };
  }

  return {
    title: `${match.home_team} vs ${match.away_team} - TitikBola`,
    description: `Nonton live streaming ${match.home_team} vs ${match.away_team} di ${match.competition}`,
  };
}

// Main page component - params must be awaited
export default async function PlayerPage({ params }) {
  // Await params before accessing properties
  const resolvedParams = await params;
  const match = await getMatchById(resolvedParams.id);

  if (!match) {
    notFound();
  }

  // Check if match is available for streaming
  const canStream = match.status === 'live' || match.status === 'upcoming';

  return (
    <div className="min-h-screen bg-gradient-to-b from-netflix-black via-netflix-darkGray to-netflix-black">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-netflix-black/95 backdrop-blur-sm border-b border-white/10">
        <div className="container-custom py-4 flex justify-between items-center">
          <Link href="/" className="text-2xl font-bold text-gradient-red">
            ⚽ TitikBola
          </Link>
          <Link
            href="/"
            className="btn btn-ghost text-sm"
          >
            ← Kembali
          </Link>
        </div>
      </header>

      {/* Match Info Bar */}
      <div className="bg-netflix-darkGray border-b border-white/10">
        <div className="container-custom py-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4 text-lg font-semibold">
              <span>{match.home_flag} {match.home_team}</span>
              <span className="text-netflix-red font-black text-2xl">
                {match.home_score} - {match.away_score}
              </span>
              <span>{match.away_team} {match.away_flag}</span>
            </div>
            <div className="text-sm text-gray-400">
              {match.competition}
            </div>
          </div>
        </div>
      </div>

      {/* Ad Banner */}
      <AdBanner type="banner" />

      {/* Video Player Container */}
      <div className="container-custom py-8">
        {canStream ? (
          <VideoPlayer match={match} />
        ) : (
          <div className="video-container">
            <div className="overlay">
              <svg
                className="w-16 h-16 text-yellow-500 mb-4"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              <h3 className="text-2xl font-bold mb-2">
                {match.status === 'ended' ? '⚫ Pertandingan Selesai' : '📺 Belum Dimulai'}
              </h3>
              <p className="text-gray-400 mb-4">
                {match.status === 'ended'
                  ? `Skor Akhir: ${match.home_score} - ${match.away_score}`
                  : `Jadwal: ${match.match_date} ${match.match_time}`}
              </p>
              <Link href="/" className="btn btn-primary">
                Lihat Pertandingan Lainnya
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Ad Banners */}
      <AdBanner type="banner" />

      {/* Telegram CTA */}
      <div className="container-custom py-8 text-center">
        <a
          href="https://t.me/titikbola_livesport"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-3 px-6 py-4 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 rounded-lg text-white font-semibold shadow-lg hover:shadow-xl transition-all hover:-translate-y-1"
        >
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.33 7.82l-3.32 7.55c-.17.39-.46.48-.82.26l-2.43-1.89-1.28 1.25c-.2.2-.4.2-.61 0l-.36-.36c-.19-.19-.15-.36 0-.52l1.37-1.37-1.89-2.43c-.22-.36-.13.1 0-.15l.39-.39c.33-.33.51-.12.82.02l8.83 5.38c.35.21.65.1.75-.24l1.32-6.52c.16-.76-.32-1.05-.85-.82z" />
          </svg>
          <span>📢 Gabung Channel Telegram untuk Update Link Terbaru!</span>
        </a>
      </div>

      {/* Footer */}
      <footer className="py-8 bg-black border-t border-white/10 mt-12">
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