/**
 * 🔐 Client-side Auth Utilities - FIXED
 * Uses httpOnly cookies when possible, localStorage as fallback
 */

const TOKEN_STORAGE_KEY = 'adminToken';
const TOKEN_MAX_AGE = 7200; // 2 hours in seconds

/**
 * Get auth token - tries cookie first, then localStorage
 */
export async function getAuthToken() {
  if (typeof window === 'undefined') return null;
  
  // Try to get from cookie first (more secure)
  const cookieToken = getCookieToken();
  if (cookieToken) {
    return cookieToken;
  }
  
  // Fallback to localStorage (less secure but works)
  try {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    
    // Validate token format
    if (token && isValidTokenFormat(token)) {
      // Check if expired
      if (isTokenExpired(token)) {
        console.warn('Token expired, clearing...');
        await clearAuthToken();
        return null;
      }
      return token;
    }
    
    return null;
  } catch (e) {
    console.error('Error reading token:', e);
    return null;
  }
}

/**
 * Set auth token - tries to set httpOnly cookie via API
 */
export async function setAuthToken(token) {
  if (typeof window === 'undefined') return;
  
  if (!token || !isValidTokenFormat(token)) {
    console.error('Invalid token format');
    return;
  }
  
  // Store in localStorage as backup
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    
    // Also try to set via API (will set httpOnly cookie)
    await fetch('/api/auth/set-cookie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      credentials: 'include',
    }).catch(e => {
      console.warn('Could not set httpOnly cookie:', e.message);
    });
    
  } catch (e) {
    console.error('Error storing token:', e);
  }
}

/**
 * Clear auth token from all storages
 */
export async function clearAuthToken() {
  if (typeof window === 'undefined') return;
  
  // Clear localStorage
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch (e) {
    console.error('Error clearing localStorage:', e);
  }
  
  // Clear cookie via API
  try {
    await fetch('/api/auth/clear-cookie', {
      method: 'POST',
      credentials: 'include',
    });
  } catch (e) {
    console.warn('Could not clear cookie:', e.message);
  }
}

/**
 * Get token from cookie (client-side read)
 */
function getCookieToken() {
  if (typeof document === 'undefined') return null;
  
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === TOKEN_STORAGE_KEY) {
      return decodeURIComponent(value);
    }
  }
  
  return null;
}

/**
 * Validate token format (base64 encoded data)
 */
function isValidTokenFormat(token) {
  if (!token || typeof token !== 'string') return false;
  
  try {
    // Token should be base64
    const decoded = atob(token);
    
    // Should have at least username:timestamp
    const parts = decoded.split(':');
    if (parts.length < 2) return false;
    
    // Timestamp should be valid number
    const timestamp = parseInt(parts[1], 10);
    if (!Number.isFinite(timestamp)) return false;
    
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Check if token is expired
 */
function isTokenExpired(token) {
  try {
    const decoded = atob(token);
    const parts = decoded.split(':');
    
    if (parts.length < 2) return true;
    
    const timestamp = parseInt(parts[1], 10);
    const age = Date.now() - timestamp;
    const maxAge = TOKEN_MAX_AGE * 1000;
    
    return age > maxAge;
  } catch (e) {
    return true;
  }
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
    credentials: 'include', // Include cookies
  });
}

/**
 * Verify admin token with server
 */
export async function verifyToken() {
  try {
    const response = await fetchWithAuth('/api/auth/verify', { 
      method: 'GET' 
    });
    
    if (!response.ok) {
      await clearAuthToken();
      return null;
    }
    
    const data = await response.json();
    return data.authenticated ? data : null;
  } catch (err) {
    console.error('Token verification error:', err);
    return null;
  }
}

/**
 * Refresh token (get new token before expiry)
 */
export async function refreshToken() {
  try {
    const currentToken = await getAuthToken();
    if (!currentToken) return null;
    
    const response = await fetchWithAuth('/api/auth/refresh', {
      method: 'POST',
    });
    
    if (!response.ok) {
      await clearAuthToken();
      return null;
    }
    
    const data = await response.json();
    if (data.token) {
      await setAuthToken(data.token);
      return data.token;
    }
    
    return null;
  } catch (err) {
    console.error('Token refresh error:', err);
    return null;
  }
}

/**
 * Auto-refresh token before expiry
 */
export function startTokenRefreshTimer(onExpired) {
  const checkInterval = 5 * 60 * 1000; // Check every 5 minutes
  
  const timer = setInterval(async () => {
    const token = await getAuthToken();
    
    if (!token) {
      clearInterval(timer);
      if (onExpired) onExpired();
      return;
    }
    
    if (isTokenExpired(token)) {
      console.log('Token expired, attempting refresh...');
      const newToken = await refreshToken();
      
      if (!newToken) {
        clearInterval(timer);
        if (onExpired) onExpired();
      }
    } else {
      // Check if close to expiry (within 30 minutes)
      try {
        const decoded = atob(token);
        const parts = decoded.split(':');
        const timestamp = parseInt(parts[1], 10);
        const age = Date.now() - timestamp;
        const refreshThreshold = (TOKEN_MAX_AGE - 1800) * 1000; // 30 min before expiry
        
        if (age > refreshThreshold) {
          console.log('Token close to expiry, refreshing...');
          await refreshToken();
        }
      } catch (e) {
        console.error('Token check error:', e);
      }
    }
  }, checkInterval);
  
  return timer;
}

/**
 * XSS Protection: Sanitize user input before storage
 */
function sanitizeForStorage(value) {
  if (typeof value !== 'string') return '';
  
  // Remove any HTML tags
  return value.replace(/<[^>]*>/g, '');
}