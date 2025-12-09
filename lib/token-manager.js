/**
 * 🔐 Token Manager - FIXED v3
 * 
 * CRITICAL FIXES:
 * ✅ Token expiring check FIXED (tidak aggressive)
 * ✅ Cache management lebih baik
 * ✅ Auto-refresh hanya saat benar-benar perlu
 */

const TOKEN_SECRET = process.env.NEXT_PUBLIC_TOKEN_SECRET || "teskunci123";
const WORKER_URL = process.env.NEXT_PUBLIC_WORKER_URL;

// ✅ FIX: Sinkron dengan streaming-constants!
const TOKEN_VALIDITY_DURATION = 1800000;    // 30 minutes
const TOKEN_EXPIRING_THRESHOLD = 180000;    // ✅ 3 menit sebelum expired (bukan 5 menit!)

// Token cache
const tokenCache = new Map();

/**
 * Generate HMAC-SHA256 signature
 */
async function generateHMAC(data, secret) {
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

      return hexSignature;
    } catch (e) {
      console.warn("⚠️ Crypto.subtle failed:", e.message);
    }
  }

  return generateHMACFallback(data, secret);
}

/**
 * Fallback HMAC for localhost/non-HTTPS
 */
function generateHMACFallback(data, secret) {
  const combined = `${secret}:${data}`;
  let hash = 0;

  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }

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
 * ✅ FIX: Check if token is TRULY expiring soon
 */
function isTokenExpiringSoon(timestamp) {
  const tokenAge = Date.now() - parseInt(timestamp);
  const remaining = TOKEN_VALIDITY_DURATION - tokenAge;
  
  // ✅ CRITICAL: Hanya return true jika benar-benar < 3 menit
  return remaining <= TOKEN_EXPIRING_THRESHOLD;
}

/**
 * ✅ FIX: Check if token is expired
 */
function isTokenExpired(timestamp) {
  const tokenAge = Date.now() - parseInt(timestamp);
  return tokenAge >= TOKEN_VALIDITY_DURATION;
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
  
  // ✅ FIX: Check cache dengan logic yang benar
  const cached = tokenCache.get(cacheKey);
  if (cached) {
    const expired = isTokenExpired(cached.ts);
    const expiring = isTokenExpiringSoon(cached.ts);
    
    // ✅ CRITICAL: Hanya generate baru jika BENAR-BENAR expired
    if (!expired && !expiring) {
      const remaining = TOKEN_VALIDITY_DURATION - (Date.now() - parseInt(cached.ts));
      console.log(`🔐 Using cached token (${Math.floor(remaining / 60000)}min remaining)`);
      return buildUrl(baseUrl, matchId, linkId, cached.ts, cached.token);
    }
    
    if (expiring && !expired) {
      console.log(`⚠️ Token expiring soon (< 3min), will refresh on next request`);
      // Masih bisa pakai token ini, tapi flag untuk refresh
    }
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

    console.log("🔐 New token generated:", {
      matchId,
      linkId,
      validFor: `${TOKEN_VALIDITY_DURATION / 60000} minutes`,
      willRefreshIn: `${(TOKEN_VALIDITY_DURATION - TOKEN_EXPIRING_THRESHOLD) / 60000} minutes`,
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
 * Clear token cache
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
 * Get token info
 */
export function getTokenInfo(matchId, linkId = "link1") {
  const cacheKey = getCacheKey(matchId, linkId);
  const cached = tokenCache.get(cacheKey);
  
  if (!cached) return null;
  
  const now = Date.now();
  const age = now - parseInt(cached.ts);
  const expiresIn = TOKEN_VALIDITY_DURATION - age;
  
  return {
    ...cached,
    age,
    expiresIn,
    isExpired: isTokenExpired(cached.ts),
    isExpiringSoon: isTokenExpiringSoon(cached.ts),
    remainingMinutes: Math.floor(expiresIn / 60000),
  };
}

/**
 * ✅ FIX: Check if should auto-refresh (LEBIH KONSERVATIF)
 */
export function shouldRefreshToken(matchId, linkId = "link1") {
  const info = getTokenInfo(matchId, linkId);
  
  // Tidak ada token = perlu create
  if (!info) return true;
  
  // ✅ CRITICAL: Hanya refresh jika BENAR-BENAR expired atau < 3 menit
  return info.isExpired || info.isExpiringSoon;
}

/**
 * Verify token (client-side check)
 */
export async function verifyToken(matchId, linkId, timestamp, token) {
  try {
    const dataToSign = `${matchId}:${linkId}:${timestamp}`;
    const expectedToken = await generateHMAC(dataToSign, TOKEN_SECRET);

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
    const age = now - parseInt(value.ts);
    const remaining = TOKEN_VALIDITY_DURATION - age;
    
    stats.tokens.push({
      key,
      age: Math.round(age / 1000) + 's',
      remaining: Math.round(remaining / 1000) + 's',
      remainingMin: Math.floor(remaining / 60000) + 'min',
      isExpired: isTokenExpired(value.ts),
      isExpiring: isTokenExpiringSoon(value.ts),
    });
  });
  
  return stats;
}

// ✅ Log config on init (dev only)
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  console.log("🔐 Token Manager Config:", {
    validityDuration: `${TOKEN_VALIDITY_DURATION / 60000} minutes`,
    expiringThreshold: `${TOKEN_EXPIRING_THRESHOLD / 60000} minutes before expiry`,
    effectiveValidityWithBuffer: `${(TOKEN_VALIDITY_DURATION - TOKEN_EXPIRING_THRESHOLD) / 60000} minutes`,
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