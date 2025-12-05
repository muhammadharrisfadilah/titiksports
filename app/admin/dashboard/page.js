'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getMatches } from '@/lib/supabase';
import { verifyToken, getAuthToken, clearAuthToken, fetchWithAuth } from '@/lib/auth-client';
import MatchFormModal from '@/components/match-form-modal';

export default function AdminDashboard() {
  const router = useRouter();
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editMatch, setEditMatch] = useState(null);

  useEffect(() => {
    // Check authentication - just verify token exists and is valid
    const checkAuth = async () => {
      try {
        const token = await getAuthToken();
        
        if (!token) {
          console.log('❌ No token found, redirecting to login');
          router.push('/admin/login');
          return;
        }

        console.log('✅ Token found, loading matches...');
        loadMatches();
      } catch (err) {
        console.error('Auth check error:', err);
        setError('Auth error: ' + err.message);
        router.push('/admin/login');
      }
    };

    checkAuth();
  }, [router]);

  const loadMatches = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('📊 Fetching matches from Supabase...');
      const data = await getMatches();
      console.log('📊 Matches loaded:', data?.length || 0);
      setMatches(data || []);
    } catch (err) {
      console.error('❌ Error loading matches:', err);
      setError('Gagal memuat pertandingan: ' + err.message);
      setMatches([]);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (match) => {
    setEditMatch(match);
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Yakin ingin menghapus pertandingan ini?')) return;

    try {
      const response = await fetchWithAuth(`/api/matches?id=${id}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        alert('Gagal menghapus: ' + (result.error || 'Unknown error'));
        console.error('Delete error:', result);
        return;
      }

      alert('Pertandingan berhasil dihapus!');
      loadMatches();
    } catch (err) {
      console.error('Delete error:', err);
      alert('Terjadi kesalahan: ' + err.message);
    }
  };

  const handleLogout = async () => {
    clearAuthToken();
    router.push('/admin/login');
  };

  const handleModalClose = (reload) => {
    setShowModal(false);
    setEditMatch(null);
    if (reload) {
      loadMatches();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-netflix-black">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-white/20 border-t-netflix-red rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-netflix-black">
        <div className="text-center max-w-md p-8 bg-netflix-darkGray rounded-lg border border-netflix-red/30">
          <h2 className="text-xl font-bold text-netflix-red mb-4">Error</h2>
          <p className="text-gray-300 mb-6">{error}</p>
          <button 
            onClick={() => {
              setError(null);
              loadMatches();
            }}
            className="btn btn-primary"
          >
            🔄 Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-netflix-black">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-netflix-black/95 backdrop-blur-sm border-b border-white/10">
        <div className="container-custom py-4 flex justify-between items-center">
          <Link href="/" className="text-2xl font-bold text-gradient-red">
            ⚽ TitikBola Admin
          </Link>
          <button onClick={handleLogout} className="btn btn-secondary text-sm">
            Logout
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="container-custom py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="card p-6">
            <div className="text-3xl mb-2">📊</div>
            <div className="text-2xl font-bold">{matches.length}</div>
            <div className="text-sm text-gray-400">Total Matches</div>
          </div>
          <div className="card p-6">
            <div className="text-3xl mb-2">🔴</div>
            <div className="text-2xl font-bold">
              {matches.filter(m => m.status === 'live').length}
            </div>
            <div className="text-sm text-gray-400">Live Now</div>
          </div>
          <div className="card p-6">
            <div className="text-3xl mb-2">🕒</div>
            <div className="text-2xl font-bold">
              {matches.filter(m => m.status === 'upcoming').length}
            </div>
            <div className="text-sm text-gray-400">Upcoming</div>
          </div>
          <div className="card p-6">
            <div className="text-3xl mb-2">⚫</div>
            <div className="text-2xl font-bold">
              {matches.filter(m => m.status === 'ended').length}
            </div>
            <div className="text-sm text-gray-400">Ended</div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Manage Matches</h2>
          <button
            onClick={() => setShowModal(true)}
            className="btn btn-primary"
          >
            + Add Match
          </button>
        </div>

        {/* Matches Table */}
        {matches.length === 0 ? (
          <div className="card p-12 text-center">
            <div className="text-6xl mb-4">⚽</div>
            <p className="text-gray-400 text-lg mb-4">
              Belum ada pertandingan
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="btn btn-primary"
            >
              Tambah Pertandingan Pertama
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left p-4 text-sm font-semibold text-gray-400">
                    Match
                  </th>
                  <th className="text-left p-4 text-sm font-semibold text-gray-400">
                    Competition
                  </th>
                  <th className="text-left p-4 text-sm font-semibold text-gray-400">
                    Date & Time
                  </th>
                  <th className="text-left p-4 text-sm font-semibold text-gray-400">
                    Status
                  </th>
                  <th className="text-left p-4 text-sm font-semibold text-gray-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {matches.map((match) => (
                  <tr
                    key={match.id}
                    className="border-b border-white/10 hover:bg-white/5"
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <span>{match.home_flag}</span>
                        <div>
                          <div className="font-semibold">
                            {match.home_team} vs {match.away_team}
                          </div>
                          <div className="text-sm text-gray-400">
                            {match.home_score} - {match.away_score}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-sm">{match.competition}</td>
                    <td className="p-4 text-sm">
                      <div>{match.match_date}</div>
                      <div className="text-gray-400">{match.match_time}</div>
                    </td>
                    <td className="p-4">
                      <span
                        className={`badge ${
                          match.status === 'live'
                            ? 'badge-live'
                            : match.status === 'upcoming'
                            ? 'badge-upcoming'
                            : 'badge-ended'
                        }`}
                      >
                        {match.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex gap-2">
                        <Link
                          href={`/player/${match.id}`}
                          target="_blank"
                          className="px-3 py-1 bg-blue-500 hover:bg-blue-600 rounded text-sm"
                        >
                          View
                        </Link>
                        <button
                          onClick={() => handleEdit(match)}
                          className="px-3 py-1 bg-yellow-500 hover:bg-yellow-600 rounded text-sm"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(match.id)}
                          className="px-3 py-1 bg-red-500 hover:bg-red-600 rounded text-sm"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <MatchFormModal
          match={editMatch}
          onClose={handleModalClose}
        />
      )}
    </div>
  );
}