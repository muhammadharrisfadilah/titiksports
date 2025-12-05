'use client';

import { useState } from 'react';
import { fetchWithAuth } from '@/lib/auth-client';

export default function MatchFormModal({ match, onClose }) {
  const isEdit = !!match;
  
  const [formData, setFormData] = useState({
    home_team: match?.home_team || '',
    home_flag: match?.home_flag || '⚽',
    away_team: match?.away_team || '',
    away_flag: match?.away_flag || '⚽',
    competition: match?.competition || '',
    match_date: match?.match_date || new Date().toISOString().split('T')[0],
    match_time: match?.match_time || '19:00 WIB',
    thumbnail_url: match?.thumbnail_url || '',
    status: match?.status || 'upcoming',
    home_score: match?.home_score || 0,
    away_score: match?.away_score || 0,
    stream_url1: match?.stream_url1 || '',
    referer1: match?.referer1 || '',
    origin1: match?.origin1 || '',
    stream_url2: match?.stream_url2 || '',
    referer2: match?.referer2 || '',
    origin2: match?.origin2 || '',
    stream_url3: match?.stream_url3 || '',
    referer3: match?.referer3 || '',
    origin3: match?.origin3 || '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Make API request with auth token
      const url = isEdit ? `/api/matches?id=${match.id}` : '/api/matches';
      const method = isEdit ? 'PUT' : 'POST';

      const response = await fetchWithAuth(url, {
        method,
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        setError(result.error || 'Gagal menyimpan data');
        console.error('API Error:', { status: response.status, result });
        return;
      }

      alert(isEdit ? 'Pertandingan berhasil diupdate!' : 'Pertandingan berhasil ditambahkan!');
      onClose(true); // Reload data
    } catch (err) {
      console.error('Submit error:', err);
      setError(err.message || 'Terjadi kesalahan');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-netflix-darkGray rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto border border-white/10">
        {/* Header */}
        <div className="sticky top-0 bg-netflix-darkGray border-b border-white/10 p-6 flex justify-between items-center">
          <h2 className="text-2xl font-bold">
            {isEdit ? 'Edit Pertandingan' : 'Tambah Pertandingan'}
          </h2>
          <button
            onClick={() => onClose(false)}
            className="text-3xl hover:text-netflix-red transition-colors"
          >
            ×
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Team Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-2">Tim Kandang *</label>
              <input
                type="text"
                name="home_team"
                value={formData.home_team}
                onChange={handleChange}
                className="input"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Flag Kandang</label>
              <input
                type="text"
                name="home_flag"
                value={formData.home_flag}
                onChange={handleChange}
                className="input"
                maxLength={10}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Tim Tandang *</label>
              <input
                type="text"
                name="away_team"
                value={formData.away_team}
                onChange={handleChange}
                className="input"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Flag Tandang</label>
              <input
                type="text"
                name="away_flag"
                value={formData.away_flag}
                onChange={handleChange}
                className="input"
                maxLength={10}
              />
            </div>
          </div>

          {/* Match Details */}
          <div>
            <label className="block text-sm font-semibold mb-2">Kompetisi *</label>
            <input
              type="text"
              name="competition"
              value={formData.competition}
              onChange={handleChange}
              className="input"
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-2">Tanggal *</label>
              <input
                type="date"
                name="match_date"
                value={formData.match_date}
                onChange={handleChange}
                className="input"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Waktu *</label>
              <input
                type="text"
                name="match_time"
                value={formData.match_time}
                onChange={handleChange}
                className="input"
                placeholder="19:00 WIB"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">Thumbnail URL</label>
            <input
              type="url"
              name="thumbnail_url"
              value={formData.thumbnail_url}
              onChange={handleChange}
              className="input"
              placeholder="https://example.com/image.jpg"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-2">Status *</label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="input"
              >
                <option value="upcoming">Upcoming</option>
                <option value="live">Live</option>
                <option value="ended">Ended</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Skor (Home - Away)</label>
              <div className="flex gap-3 items-center">
                <input
                  type="number"
                  name="home_score"
                  value={formData.home_score}
                  onChange={handleChange}
                  className="input w-20"
                  min="0"
                  max="99"
                />
                <span>-</span>
                <input
                  type="number"
                  name="away_score"
                  value={formData.away_score}
                  onChange={handleChange}
                  className="input w-20"
                  min="0"
                  max="99"
                />
              </div>
            </div>
          </div>

          {/* Stream Links */}
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white/5 rounded-lg p-4 space-y-4">
              <h3 className="font-bold text-lg text-netflix-red">
                Stream Link {i} {i === 3 ? '(DASH)' : '(HLS)'}
              </h3>
              <div>
                <label className="block text-sm font-semibold mb-2">Stream URL</label>
                <input
                  type="url"
                  name={`stream_url${i}`}
                  value={formData[`stream_url${i}`]}
                  onChange={handleChange}
                  className="input"
                  placeholder={`https://example.com/stream.${i === 3 ? 'mpd' : 'm3u8'}`}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">Referer</label>
                  <input
                    type="text"
                    name={`referer${i}`}
                    value={formData[`referer${i}`]}
                    onChange={handleChange}
                    className="input"
                    placeholder="https://example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">Origin</label>
                  <input
                    type="text"
                    name={`origin${i}`}
                    value={formData[`origin${i}`]}
                    onChange={handleChange}
                    className="input"
                    placeholder="https://example.com"
                  />
                </div>
              </div>
            </div>
          ))}

          {error && (
            <div className="bg-netflix-red/20 border border-netflix-red rounded-lg p-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={() => onClose(false)}
              className="btn btn-secondary"
              disabled={loading}
            >
              Batal
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                'Simpan'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}