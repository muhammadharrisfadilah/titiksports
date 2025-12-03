// Token manager dengan HMAC SHA-256 (sesuai dengan Cloudflare Worker)

const TOKEN_SECRET = process.env.NEXT_PUBLIC_TOKEN_SECRET || 'teskunci123';
const WORKER_URL = process.env.NEXT_PUBLIC_WORKER_URL;
const TOKEN_VALIDITY_DURATION = 7200000; // 2 jam

/**
 * Generate HMAC-SHA256 signature (browser-compatible)
 */
async function generateHMAC(data, secret) {
  // Fallback for non-secure contexts (http://) where crypto.subtle is undefined
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    console.warn('⚠️ Unsecure context. Using fallback HMAC implementation.');
    // Simple fallback for development. NOT FOR PRODUCTION.
    const token = btoa(`${data}:${secret}`);
    return token.substring(0, 32); 
  }
  
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(data)
  );
  
  // Convert to hex string
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Create secure stream URL with HMAC token
 */
export async function createSecureStreamUrl(streamUrl, matchId, linkId = 'link1') {
  if (!streamUrl) return null;
  
  // Jika tidak ada worker URL, return URL asli
  if (!WORKER_URL) {
    console.warn('WORKER_URL not configured, using direct stream URL');
    return streamUrl;
  }

  try {
    // Generate timestamp
    const timestamp = Date.now().toString();
    
    // Data to sign: matchId:linkId:timestamp
    const dataToSign = `${matchId}:${linkId}:${timestamp}`;
    
    // Generate HMAC token
    const token = await generateHMAC(dataToSign, TOKEN_SECRET);
    
    // Build worker URL
    const url = new URL(`${WORKER_URL}/api/stream/manifest`);
    url.searchParams.set('match', matchId);
    url.searchParams.set('link', linkId);
    url.searchParams.set('ts', timestamp);
    url.searchParams.set('token', token);
    
    console.log('🔐 Token generated:', { matchId, linkId, timestamp: new Date(parseInt(timestamp)).toISOString() });
    
    return url.toString();
  } catch (error) {
    console.error('Error creating secure URL:', error);
    return streamUrl;
  }
}

/**
 * Get token expiry time in seconds
 */
export function getTokenExpirySeconds() {
  return TOKEN_VALIDITY_DURATION / 1000; // Convert to seconds
}

/**
 * Check if token is about to expire (within 15 minutes)
 */
export function shouldRefreshToken(timestamp) {
  const tokenAge = Date.now() - parseInt(timestamp);
  const refreshThreshold = TOKEN_VALIDITY_DURATION - (15 * 60 * 1000); // 15 minutes before expiry
  return tokenAge >= refreshThreshold;
}

/**
 * Generate referer headers (optional, for future use)
 */
export function getStreamHeaders(referer, origin) {
  const headers = {};
  
  if (referer) {
    headers['Referer'] = referer;
  }
  
  if (origin) {
    headers['Origin'] = origin;
  }
  
  return headers;
}
