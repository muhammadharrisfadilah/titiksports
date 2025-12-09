/**
 * 🔐 Token Manager - FIXED v2
 * 
 * FIXES:
 * ✅ Token duration synced with Worker (30 min)
 * ✅ Token cache with auto-refresh
 * ✅ refreshToken() function
 * ✅ clearTokenCache() function
 * ✅ Better error handling
 */

const TOKEN_SECRET = process.env.NEXT_PUBLIC_TOKEN_SECRET || "teskunci123";
const WORKER_URL = process.env.NEXT_PUBLIC_WORKER_URL;

// ✅ FIX: SYNC WITH WORKER!
const TOKEN_VALIDITY_DURATION = 1800000; // 30 minutes (MUST match Worker!)
const TOKEN_REFRESH_THRESHOLD = 300000;  // Refresh 5 min before expiry

// Token cache
const tokenCache = new Map();

/**
 * Generate HMAC-SHA256 signature
 */
async function generateHMAC(data, secret) {
  // Try Web Crypto API first (HTTPS only)
  if (typeof crypto !== "undefined" && crypto.subtle) {
    try {
      const encoder = new TextEncoder();
      const keyData = encoder.encode(secret);

      const key = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );

      const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        encoder.encode(data)
      );

      const hexSignature = Array.from(new Uint8Array(signature))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      console.log("✅ Token generated with crypto.subtle");
      return hexSignature;
    } catch (e) {
      console.warn("⚠️ Crypto.subtle failed:", e.message);
    }
  }

  // Fallback for non-HTTPS (localhost)
  console.warn("⚠️ Using fallback token generation (dev only)");
  return generateHMACFallback(data, secret);
}

/**
 * Fallback HMAC for localhost/non-HTTPS
 */
function generateHMACFallback(data, secret) {
  // Simple hash for development only
  const combined = `${secret}:${data}`;
  let hash = 0;

  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }

  // Generate 64-char hex string
  const hexPart = Math.abs(hash).toString(16).padStart(8, '0');
  const timePart = Date.now().toString(16).padStart(12, '0');
  const randomPart = Math.random().toString(16).substring(2, 46);
  
  return (hexPart + timePart + randomPart).substring(0, 64);
}

/**
 * Get cache key
 */
function getCacheKey(matchId, linkId) {
  return `${matchId}:${linkId}`;
}

/**
 * Create secure stream URL with HMAC token
 */
export async function createSecureStreamUrl(baseUrl, matchId, linkId = "link1") {
  if (!baseUrl) return null;
  if (!WORKER_URL) {
    console.warn("WORKER_URL not configured");
    return baseUrl;
  }

  const cacheKey = getCacheKey(matchId, linkId);
  
  // Check cache
  const cached = tokenCache.get(cacheKey);
  if (cached && !isTokenExpiringSoon(cached.ts)) {
    console.log("🔐 Using cached token");
    return buildUrl(baseUrl, matchId, linkId, cached.ts, cached.token);
  }

  try {
    // Generate new token
    const timestamp = Date.now().toString();
    const dataToSign = `${matchId}:${linkId}:${timestamp}`;
    const token = await generateHMAC(dataToSign, TOKEN_SECRET);

    // Cache token
    tokenCache.set(cacheKey, {
      token,
      ts: timestamp,
      createdAt: Date.now(),
      expiresAt: Date.now() + TOKEN_VALIDITY_DURATION,
    });

    const url = buildUrl(baseUrl, matchId, linkId, timestamp, token);

    console.log("🔐 Token generated:", {
      matchId,
      linkId,
      timestamp: new Date(parseInt(timestamp)).toISOString(),
      expiresIn: `${TOKEN_VALIDITY_DURATION / 60000} minutes`,
      tokenLength: token.length,
    });

    return url;
  } catch (error) {
    console.error("Error creating secure URL:", error);
    return baseUrl;
  }
}

/**
 * Build URL with params
 */
function buildUrl(baseUrl, matchId, linkId, timestamp, token) {
  const url = new URL(baseUrl);
  url.searchParams.set("match", matchId.toString());
  url.searchParams.set("link", linkId);
  url.searchParams.set("ts", timestamp);
  url.searchParams.set("token", token);
  return url.toString();
}

/**
 * Check if token is expiring soon
 */
function isTokenExpiringSoon(timestamp) {
  const tokenAge = Date.now() - parseInt(timestamp);
  return tokenAge >= (TOKEN_VALIDITY_DURATION - TOKEN_REFRESH_THRESHOLD);
}

/**
 * ✅ NEW: Refresh token (force regenerate)
 */
export async function refreshToken(matchId, linkId = "link1") {
  const cacheKey = getCacheKey(matchId, linkId);
  
  // Clear old token
  tokenCache.delete(cacheKey);
  
  // Generate new token
  const timestamp = Date.now().toString();
  const dataToSign = `${matchId}:${linkId}:${timestamp}`;
  const token = await generateHMAC(dataToSign, TOKEN_SECRET);

  // Cache new token
  tokenCache.set(cacheKey, {
    token,
    ts: timestamp,
    createdAt: Date.now(),
    expiresAt: Date.now() + TOKEN_VALIDITY_DURATION,
  });

  console.log("🔄 Token refreshed:", { matchId, linkId });

  return { token, ts: timestamp };
}

/**
 * ✅ NEW: Clear token cache
 */
export function clearTokenCache(matchId, linkId) {
  if (matchId && linkId) {
    const cacheKey = getCacheKey(matchId, linkId);
    tokenCache.delete(cacheKey);
    console.log("🧹 Token cache cleared:", { matchId, linkId });
  } else {
    tokenCache.clear();
    console.log("🧹 All token cache cleared");
  }
}

/**
 * ✅ NEW: Get token info
 */
export function getTokenInfo(matchId, linkId = "link1") {
  const cacheKey = getCacheKey(matchId, linkId);
  const cached = tokenCache.get(cacheKey);
  
  if (!cached) return null;
  
  const now = Date.now();
  return {
    ...cached,
    age: now - cached.createdAt,
    expiresIn: cached.expiresAt - now,
    isExpired: now >= cached.expiresAt,
    isExpiringSoon: isTokenExpiringSoon(cached.ts),
  };
}

/**
 * ✅ NEW: Check if should auto-refresh
 */
export function shouldRefreshToken(matchId, linkId = "link1") {
  const info = getTokenInfo(matchId, linkId);
  if (!info) return true; // No token, need to create
  return info.isExpiringSoon || info.isExpired;
}

/**
 * Verify token (client-side check)
 */
export async function verifyToken(matchId, linkId, timestamp, token) {
  try {
    const dataToSign = `${matchId}:${linkId}:${timestamp}`;
    const expectedToken = await generateHMAC(dataToSign, TOKEN_SECRET);

    // Constant-time comparison
    if (token.length !== expectedToken.length) return false;

    let mismatch = 0;
    for (let i = 0; i < token.length; i++) {
      mismatch |= token.charCodeAt(i) ^ expectedToken.charCodeAt(i);
    }

    return mismatch === 0;
  } catch (error) {
    console.error("Token verification error:", error);
    return false;
  }
}

/**
 * Get token expiry time in seconds
 */
export function getTokenExpirySeconds() {
  return TOKEN_VALIDITY_DURATION / 1000;
}

/**
 * Get token validity duration in ms
 */
export function getTokenValidityDuration() {
  return TOKEN_VALIDITY_DURATION;
}

/**
 * Get stream headers
 */
export function getStreamHeaders(referer, origin) {
  const headers = {};
  if (referer) headers["Referer"] = referer;
  if (origin) headers["Origin"] = origin;
  return headers;
}

// ========== DEBUG HELPERS ==========

/**
 * Get cache stats (for debugging)
 */
export function getTokenCacheStats() {
  const stats = {
    size: tokenCache.size,
    tokens: [],
  };
  
  tokenCache.forEach((value, key) => {
    const now = Date.now();
    stats.tokens.push({
      key,
      age: Math.round((now - value.createdAt) / 1000) + 's',
      expiresIn: Math.round((value.expiresAt - now) / 1000) + 's',
      isExpired: now >= value.expiresAt,
    });
  });
  
  return stats;
}

// Log config on init (dev only)
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  console.log("🔐 Token Manager Config:", {
    validityDuration: `${TOKEN_VALIDITY_DURATION / 60000} minutes`,
    refreshThreshold: `${TOKEN_REFRESH_THRESHOLD / 60000} minutes before expiry`,
    workerUrl: WORKER_URL || 'NOT SET',
    secretConfigured: TOKEN_SECRET !== 'teskunci123',
  });
}

export default {
  createSecureStreamUrl,
  refreshToken,
  clearTokenCache,
  getTokenInfo,
  shouldRefreshToken,
  verifyToken,
  getTokenExpirySeconds,
  getTokenValidityDuration,
  getStreamHeaders,
  getTokenCacheStats,
};