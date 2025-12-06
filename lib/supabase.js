import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let supabase = null;

if (supabaseUrl && supabaseAnonKey) {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
}

// Server-side admin client
let supabaseAdmin = null;
const serviceUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (serviceUrl && serviceKey) {
  supabaseAdmin = createClient(serviceUrl, serviceKey, { 
    auth: { persistSession: false } 
  });
}

// Startup warnings
if (!supabase) {
  console.warn('⚠️ Supabase anon client not configured');
}

if (!supabaseAdmin) {
  console.warn('⚠️ Supabase admin client not configured');
}

// ========== FIXED CACHING (Thread-Safe) ==========

/**
 * Simple in-memory cache with Map (better than global object)
 * Thread-safe and works in edge runtime
 */
class SimpleCache {
  constructor(ttlMs = 5000, maxSize = 100) {
    this.cache = new Map();
    this.ttlMs = ttlMs;
    this.maxSize = maxSize;
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    
    // Check if expired
    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    
    return item.data;
  }

  set(key, data) {
    // LRU eviction if cache full
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  clear() {
    this.cache.clear();
  }

  size() {
    return this.cache.size;
  }
}

// Create cache instance
const matchesCache = new SimpleCache(5000, 50); // 5s TTL, max 50 entries

/**
 * Get all matches with caching
 */
export async function getMatches() {
  if (!supabase) {
    console.warn('Supabase not configured');
    return [];
  }

  // Try cache first
  const cached = matchesCache.get('all_matches');
  if (cached) {
    return cached;
  }

  try {
    const { data, error } = await supabase
      .from('matches')
      .select('*')
      .order('match_date', { ascending: true })
      .order('match_time', { ascending: true });

    if (error) {
      console.error('Error fetching matches:', error);
      return [];
    }

    const rows = data || [];
    
    // Cache results
    matchesCache.set('all_matches', rows);
    
    return rows;
  } catch (error) {
    console.error('Fetch error:', error);
    return [];
  }
}

/**
 * Get single match by ID with caching
 */
export async function getMatchById(id) {
  if (!supabase) {
    console.warn('Supabase not configured');
    return null;
  }

  // Try cache first
  const cacheKey = `match_${id}`;
  const cached = matchesCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const { data, error } = await supabase
      .from('matches')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching match:', error);
      return null;
    }

    // Cache result
    if (data) {
      matchesCache.set(cacheKey, data);
    }

    return data;
  } catch (error) {
    console.error('Fetch error:', error);
    return null;
  }
}

/**
 * Create new match
 */
export async function createMatch(matchData) {
  if (!supabaseAdmin) {
    return { success: false, error: 'Supabase admin client not configured' };
  }

  try {
    // Sanitize input
    const sanitized = sanitizeMatchData(matchData);
    
    const { data, error } = await supabaseAdmin
      .from('matches')
      .insert([sanitized])
      .select()
      .single();

    if (error) {
      console.error('Create match error:', error);
      return { success: false, error: error.message };
    }

    // Clear cache
    matchesCache.clear();

    return { success: true, data };
  } catch (error) {
    console.error('Create match exception:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Update match
 */
export async function updateMatch(id, matchData) {
  if (!supabaseAdmin) {
    return { success: false, error: 'Supabase admin client not configured' };
  }

  try {
    // Sanitize input
    const sanitized = sanitizeMatchData(matchData);
    
    const { data, error } = await supabaseAdmin
      .from('matches')
      .update(sanitized)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Update match error:', error);
      return { success: false, error: error.message };
    }

    // Clear cache
    matchesCache.clear();

    return { success: true, data };
  } catch (error) {
    console.error('Update match exception:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Delete match
 */
export async function deleteMatch(id) {
  if (!supabaseAdmin) {
    return { success: false, error: 'Supabase admin client not configured' };
  }

  try {
    const { error } = await supabaseAdmin
      .from('matches')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Delete match error:', error);
      return { success: false, error: error.message };
    }

    // Clear cache
    matchesCache.clear();

    return { success: true };
  } catch (error) {
    console.error('Delete match exception:', error);
    return { success: false, error: error.message };
  }
}

// ========== INPUT SANITIZATION ==========

/**
 * Sanitize match data to prevent injection attacks
 */
function sanitizeMatchData(data) {
  const sanitized = {};
  
  // String fields - trim and limit length
  const stringFields = [
    'home_team', 'away_team', 'competition',
    'home_flag', 'away_flag', 'match_time',
    'thumbnail_url', 'status'
  ];
  
  stringFields.forEach(field => {
    if (data[field] !== undefined) {
      sanitized[field] = String(data[field] || '')
        .trim()
        .slice(0, 255) // Limit length
        .replace(/[<>]/g, ''); // Remove HTML brackets
    }
  });
  
  // Number fields
  const numberFields = ['home_score', 'away_score'];
  numberFields.forEach(field => {
    if (data[field] !== undefined) {
      const num = parseInt(data[field], 10);
      sanitized[field] = Number.isFinite(num) && num >= 0 && num <= 99 
        ? num 
        : 0;
    }
  });
  
  // URL fields - validate format
  const urlFields = [
    'stream_url1', 'stream_url2', 'stream_url3',
    'referer1', 'referer2', 'referer3',
    'origin1', 'origin2', 'origin3',
    'thumbnail_url'
  ];
  
  urlFields.forEach(field => {
    if (data[field]) {
      const url = sanitizeUrl(data[field]);
      if (url) {
        sanitized[field] = url;
      }
    }
  });
  
  // Date field
  if (data.match_date) {
    try {
      const date = new Date(data.match_date);
      if (!isNaN(date.getTime())) {
        sanitized.match_date = data.match_date;
      }
    } catch (e) {
      console.warn('Invalid date format:', data.match_date);
    }
  }
  
  // Status validation
  if (data.status) {
    const validStatuses = ['upcoming', 'live', 'ended'];
    if (validStatuses.includes(data.status)) {
      sanitized.status = data.status;
    }
  }
  
  return sanitized;
}

/**
 * Sanitize and validate URL
 */
function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return null;
  
  try {
    const parsed = new URL(url);
    
    // Only allow http and https
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null;
    }
    
    // Block private IPs
    const hostname = parsed.hostname.toLowerCase();
    const privateHosts = [
      'localhost', '127.0.0.1', '::1',
      '0.0.0.0', '169.254'
    ];
    
    if (privateHosts.some(h => hostname.includes(h))) {
      return null;
    }
    
    // Block private IP ranges
    if (
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('172.')
    ) {
      return null;
    }
    
    return url;
  } catch (e) {
    return null;
  }
}

// ========== CACHE UTILITIES ==========

/**
 * Clear all caches (useful for admin panel)
 */
export function clearCache() {
  matchesCache.clear();
  console.log('✅ Cache cleared');
}

/**
 * Get cache stats
 */
export function getCacheStats() {
  return {
    size: matchesCache.size(),
    ttl: matchesCache.ttlMs,
    maxSize: matchesCache.maxSize,
  };
}

export default supabase;
export { supabaseAdmin };