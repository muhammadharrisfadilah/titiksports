'use client';

import Link from 'next/link';

export default function MatchCard({ match }) {
  const statusConfig = {
    live: {
      badge: 'badge-live',
      icon: '🔴',
      text: 'LIVE',
    },
    upcoming: {
      badge: 'badge-upcoming',
      icon: '🕒',
      text: 'UPCOMING',
    },
    ended: {
      badge: 'badge-ended',
      icon: '⚫',
      text: 'ENDED',
    },
  };

  const status = statusConfig[match.status] || statusConfig.upcoming;

  return (
    <Link href={`/player/${match.id}`}>
      <div className="card card-hover group cursor-pointer">
        {/* Thumbnail */}
        <div className="relative aspect-video bg-netflix-neutral overflow-hidden">
          {match.thumbnail_url ? (
            <img
              src={match.thumbnail_url}
              alt={`${match.home_team} vs ${match.away_team}`}
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-netflix-darkGray to-netflix-neutral">
              <span className="text-6xl">⚽</span>
            </div>
          )}
          
          {/* Status Badge */}
          <div className="absolute top-3 right-3">
            <span className={`badge ${status.badge}`}>
              {status.icon} {status.text}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Competition */}
          <div className="text-xs text-gray-400 font-semibold uppercase tracking-wide">
            {match.competition}
          </div>

          {/* Teams */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1">
                <span className="text-2xl">{match.home_flag}</span>
                <span className="font-semibold text-lg truncate">
                  {match.home_team}
                </span>
              </div>
              {match.status !== 'upcoming' && (
                <span className="text-2xl font-black text-netflix-red mx-3">
                  {match.home_score}
                </span>
              )}
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1">
                <span className="text-2xl">{match.away_flag}</span>
                <span className="font-semibold text-lg truncate">
                  {match.away_team}
                </span>
              </div>
              {match.status !== 'upcoming' && (
                <span className="text-2xl font-black text-netflix-red mx-3">
                  {match.away_score}
                </span>
              )}
            </div>
          </div>

          {/* Match Info */}
          <div className="flex items-center justify-between text-sm text-gray-400 pt-3 border-t border-white/10">
            <span>📅 {match.match_date}</span>
            <span>🕐 {match.match_time}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}