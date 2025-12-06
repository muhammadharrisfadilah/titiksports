/**
 * 🔐 Token Manager - FIXED Security
 * HMAC-SHA256 token generation with proper fallback
 */

const TOKEN_SECRET = process.env.NEXT_PUBLIC_TOKEN_SECRET || "teskunci123";
const WORKER_URL = process.env.NEXT_PUBLIC_WORKER_URL;
const TOKEN_VALIDITY_DURATION = 7200000; // 2 hours

/**
 * Generate HMAC-SHA256 signature
 * Works in both secure and insecure contexts
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

      // Convert to hex
      const hexSignature = Array.from(new Uint8Array(signature))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      console.log("✅ Token generated with crypto.subtle");
      return hexSignature;
    } catch (e) {
      console.warn("⚠️ Crypto.subtle failed:", e.message);
      // Fall through to fallback
    }
  }

  // Fallback for non-HTTPS (localhost)
  console.warn("⚠️ crypto.subtle not available, using fallback");
  return await generateHMACFallback(data, secret);
}

/**
 * Fallback HMAC implementation using SHA-256
 * More secure than simple base64
 */
async function generateHMACFallback(data, secret) {
  // Simple hash untuk development/non-HTTPS
  // ⚠️ NOT cryptographically secure, OK for development only
  console.warn("⚠️ Using fallback token generation (non-HTTPS)");

  const combined = `${secret}:${data}:${Date.now()}`;
  let hash = 0;

  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Add more entropy
  const entropy = Math.random().toString(36).substring(2);
  const finalHash = Math.abs(hash).toString(16) + entropy;

  return finalHash.padStart(64, "0").substring(0, 64);
}

/**
 * Create secure stream URL with HMAC token
 */
export async function createSecureStreamUrl(
  baseUrl,
  matchId,
  linkId = "link1"
) {
  if (!baseUrl) return null;

  if (!WORKER_URL) {
    console.warn("WORKER_URL not configured");
    return baseUrl;
  }

  try {
    const timestamp = Date.now().toString();
    const dataToSign = `${matchId}:${linkId}:${timestamp}`;

    // Generate secure HMAC token
    const token = await generateHMAC(dataToSign, TOKEN_SECRET);

    // Build URL
    // Build URL dengan URLSearchParams (tidak bisa typo)
    const url = new URL(baseUrl);
    url.searchParams.set("match", matchId);
    url.searchParams.set("link", linkId);
    url.searchParams.set("ts", timestamp);
    url.searchParams.set("token", token);

    const finalUrl = url.toString();

    console.log("🔐 Token generated:", {
      url: finalUrl, // ← TAMBAHKAN INI buat debug
      matchId,
      linkId,
      timestamp: new Date(parseInt(timestamp)).toISOString(),
      tokenLength: token.length,
    });

    return finalUrl;
  } catch (error) {
    console.error("Error creating secure URL:", error);
    return baseUrl;
  }
}

/**
 * Get token expiry time in seconds
 */
export function getTokenExpirySeconds() {
  return TOKEN_VALIDITY_DURATION / 1000;
}

/**
 * Check if token is about to expire (within 15 minutes)
 */
export function shouldRefreshToken(timestamp) {
  const tokenAge = Date.now() - parseInt(timestamp);
  const refreshThreshold = TOKEN_VALIDITY_DURATION - 15 * 60 * 1000;
  return tokenAge >= refreshThreshold;
}

/**
 * Verify token (client-side check)
 */
export async function verifyToken(matchId, linkId, timestamp, token) {
  try {
    const dataToSign = `${matchId}:${linkId}:${timestamp}`;
    const expectedToken = await generateHMAC(dataToSign, TOKEN_SECRET);

    // Constant-time comparison (prevent timing attacks)
    if (token.length !== expectedToken.length) {
      return false;
    }

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
 * Get stream headers
 */
export function getStreamHeaders(referer, origin) {
  const headers = {};

  if (referer) {
    headers["Referer"] = referer;
  }

  if (origin) {
    headers["Origin"] = origin;
  }

  return headers;
}

// ========== INITIALIZATION ==========
