/**
 * Client-side auth utilities
 */

export async function getAuthToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('adminToken');
}

export async function setAuthToken(token) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('adminToken', token);
}

export async function clearAuthToken() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('adminToken');
}

/**
 * Fetch with auth header
 */
export async function fetchWithAuth(url, options = {}) {
  const token = await getAuthToken();
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return fetch(url, {
    ...options,
    headers,
  });
}

/**
 * Verify admin token
 */
export async function verifyToken() {
  try {
    const response = await fetchWithAuth('/api/auth', { method: 'GET' });
    if (!response.ok) {
      clearAuthToken();
      return null;
    }
    const data = await response.json();
    return data.authenticated ? data : null;
  } catch (err) {
    console.error('Token verification error:', err);
    return null;
  }
}
