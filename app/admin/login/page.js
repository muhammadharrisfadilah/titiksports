'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { setAuthToken } from '@/lib/auth-client';

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const maxRetries = 3;
    let lastError = null;

    try {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`🔐 Login attempt ${attempt}/${maxRetries}: ${username}`);

          const response = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
            credentials: 'include', // Include cookies
          });

          const data = await response.json();
          console.log(`📡 Response (attempt ${attempt}):`, { status: response.status, success: data.success });

          if (!response.ok) {
            lastError = data.error || `Login failed (${response.status})`;
            
            if (attempt < maxRetries) {
              console.warn(`⚠️ Retry ${attempt}...`);
              await new Promise(r => setTimeout(r, 500 * attempt));
              continue;
            }
            
            setError(lastError);
            return;
          }

          if (!data.success) {
            setError(data.error || 'Login gagal. Coba lagi.');
            return;
          }

          console.log(`✅ Login successful!`);
          
          // Save token
          await setAuthToken(data.token);
          console.log(`💾 Token saved`);
          
          // Redirect to dashboard
          console.log(`🔄 Redirecting to dashboard...`);
          await new Promise(r => setTimeout(r, 500)); // Small delay to ensure token is saved
          router.push('/admin/dashboard');
          return;
          
        } catch (err) {
          lastError = err;
          console.error(`❌ Fetch error (attempt ${attempt}):`, err.message);
          
          if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, 500 * attempt));
          }
        }
      }

      // All retries failed
      setError('Tidak dapat terhubung ke server. Pastikan server berjalan.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-netflix-black via-netflix-darkGray to-netflix-black">
      <div
        className="absolute inset-0 bg-cover bg-center opacity-10"
        style={{
          backgroundImage: 'url(https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=1920)',
        }}
      />

      <div className="relative z-10 w-full max-w-md p-8">
        <div className="bg-black/70 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/10 p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gradient-red mb-2">
              Admin Login
            </h1>
            <p className="text-gray-400">TitikBola Management Dashboard</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold mb-2">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input"
                placeholder="Enter username"
                required
                autoComplete="username"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                placeholder="Enter password"
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="bg-netflix-red/20 border border-netflix-red rounded-lg p-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                'Login'
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-6 text-center">
            <Link
              href="/"
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              ← Kembali ke Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}