import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// ========== TAILWIND UTILITIES ==========

/**
 * Merge Tailwind classes dengan conflict resolution
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// ========== QUALITY & LINK UTILITIES ==========

/**
 * Get link quality label
 */
export function getLinkQuality(quality) {
  const qualities = {
    auto: 'Auto',
    hd: 'HD 720p',
    fhd: 'Full HD 1080p',
    sd: 'SD 480p',
    low: 'Low 360p',
  };
  return qualities[quality] || 'Auto';
}

/**
 * Get quality from height
 */
export function getQualityLabel(height) {
  if (!height) return 'Auto';
  if (height >= 1080) return '1080p';
  if (height >= 720) return '720p';
  if (height >= 480) return '480p';
  if (height >= 360) return '360p';
  return `${height}p`;
}

/**
 * Get quality badge color
 */
export function getQualityBadgeClass(height) {
  if (!height) return 'bg-gray-500';
  if (height >= 1080) return 'bg-purple-500';
  if (height >= 720) return 'bg-blue-500';
  if (height >= 480) return 'bg-green-500';
  return 'bg-yellow-500';
}

// ========== DATE & TIME UTILITIES ==========

/**
 * Format date (Indonesian locale)
 */
export function formatDate(dateString) {
  if (!dateString) return '-';
  try {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  } catch {
    return dateString;
  }
}

/**
 * Format date short
 */
export function formatDateShort(dateString) {
  if (!dateString) return '-';
  try {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'short',
    }).format(date);
  } catch {
    return dateString;
  }
}

/**
 * Format time
 */
export function formatTime(timeString) {
  return timeString || '00:00';
}

/**
 * Format duration (seconds to mm:ss or hh:mm:ss)
 */
export function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00';
  
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format relative time (e.g., "2 hours ago", "in 30 minutes")
 */
export function formatRelativeTime(dateString) {
  if (!dateString) return '-';
  
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffMins = Math.round(diffMs / 60000);
    const diffHours = Math.round(diffMs / 3600000);
    const diffDays = Math.round(diffMs / 86400000);
    
    if (Math.abs(diffMins) < 1) return 'just now';
    if (Math.abs(diffMins) < 60) {
      return diffMins > 0 ? `in ${diffMins} min` : `${Math.abs(diffMins)} min ago`;
    }
    if (Math.abs(diffHours) < 24) {
      return diffHours > 0 ? `in ${diffHours}h` : `${Math.abs(diffHours)}h ago`;
    }
    return diffDays > 0 ? `in ${diffDays}d` : `${Math.abs(diffDays)}d ago`;
  } catch {
    return dateString;
  }
}

// ========== STATUS UTILITIES ==========

/**
 * Get status badge class
 */
export function getStatusBadgeClass(status) {
  const badges = {
    live: 'bg-red-500 text-white animate-pulse',
    upcoming: 'bg-blue-500 text-white',
    ended: 'bg-gray-500 text-white',
  };
  return badges[status] || badges.upcoming;
}

/**
 * Get status icon
 */
export function getStatusIcon(status) {
  const icons = {
    live: '🔴',
    upcoming: '🕒',
    ended: '⚫',
  };
  return icons[status] || '🕒';
}

/**
 * Get status text
 */
export function getStatusText(status) {
  const texts = {
    live: 'LIVE',
    upcoming: 'UPCOMING',
    ended: 'ENDED',
  };
  return texts[status] || 'UPCOMING';
}

/**
 * Check if match is live
 */
export function isMatchLive(match) {
  return match?.status === 'live';
}

/**
 * Check if match is upcoming
 */
export function isMatchUpcoming(match) {
  return match?.status === 'upcoming';
}

// ========== BYTES & BANDWIDTH UTILITIES ==========

/**
 * Format bytes to human readable
 */
export function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

/**
 * Format bandwidth (bits per second)
 */
export function formatBandwidth(bps) {
  if (!bps || bps === 0) return '0 bps';
  
  const k = 1000;
  const sizes = ['bps', 'Kbps', 'Mbps', 'Gbps'];
  const i = Math.floor(Math.log(bps) / Math.log(k));
  
  return `${parseFloat((bps / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// ========== URL UTILITIES ==========

/**
 * Redact sensitive URL parts (for logging)
 */
export function redactUrl(url) {
  if (!url) return '[no-url]';
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return '[invalid-url]';
  }
}

/**
 * Check if URL is valid
 */
export function isValidUrl(url) {
  if (!url) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get domain from URL
 */
export function getDomain(url) {
  if (!url) return '';
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

// ========== STREAM UTILITIES ==========

/**
 * Get available links from match
 */
export function getAvailableLinks(match) {
  if (!match) return [];
  
  const links = [];
  if (match.stream_url1) links.push({ id: 'link1', url: match.stream_url1, ref: match.referer1, org: match.origin1 });
  if (match.stream_url2) links.push({ id: 'link2', url: match.stream_url2, ref: match.referer2, org: match.origin2 });
  if (match.stream_url3) links.push({ id: 'link3', url: match.stream_url3, ref: match.referer3, org: match.origin3 });
  
  return links;
}

/**
 * Get link number (1, 2, 3) from linkId
 */
export function getLinkNumber(linkId) {
  if (!linkId) return 1;
  const match = linkId.match(/link(\d)/);
  return match ? parseInt(match[1]) : 1;
}

// ========== ERROR UTILITIES ==========

/**
 * Get user-friendly error message
 */
export function getUserErrorMessage(error) {
  if (!error) return 'An error occurred';
  
  const code = error.code || error.status;
  
  const messages = {
    403: 'Access denied. Please refresh the page.',
    404: 'Stream not found. Try another link.',
    429: 'Too many requests. Please wait a moment.',
    500: 'Server error. Please try again.',
    502: 'Server temporarily unavailable.',
    503: 'Service unavailable. Please try again.',
    504: 'Connection timeout. Check your internet.',
    'NETWORK_ERROR': 'Network error. Check your connection.',
    'TOKEN_EXPIRED': 'Session expired. Please refresh.',
    'MEDIA_ERROR': 'Video playback error.',
  };
  
  return messages[code] || error.message || 'Something went wrong';
}

// ========== MISC UTILITIES ==========

/**
 * Sleep/delay function
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Debounce function
 */
export function debounce(fn, delay) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Throttle function
 */
export function throttle(fn, limit) {
  let inThrottle;
  return (...args) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Generate unique ID
 */
export function generateId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Deep clone object
 */
export function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Check if running on mobile device
 */
export function isMobile() {
  if (typeof navigator === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

/**
 * Check if browser supports HLS natively (Safari)
 */
export function supportsNativeHLS() {
  if (typeof document === 'undefined') return false;
  const video = document.createElement('video');
  return video.canPlayType('application/vnd.apple.mpegurl') !== '';
}

/**
 * Check if browser supports MSE (HLS.js requirement)
 */
export function supportsMSE() {
  if (typeof window === 'undefined') return false;
  return 'MediaSource' in window;
}

// ========== IP ANONYMIZATION UTILITIES ==========

/**
 * Anonymize IP address (IPv4) - converts 192.168.1.1 → 192.168.*.*
 * Preserves IPv6 as-is for privacy
 */
export function anonymizeIP(ip) {
  if (!ip) return '0.0.0.0';
  if (ip.startsWith('::ffff:')) {
    ip = ip.substring(7); // Handle IPv4-mapped IPv6 addresses
  }

  const isIPv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(ip);
  
  if (!isIPv4) return ip; // Return IPv6 untouched

  const parts = ip.split('.');
  if (parts.length < 4) return ip;

  return `${parts[0]}.${parts[1]}.*.*`;
}

// ========== EXPORTS ==========

export default {
  cn,
  getLinkQuality,
  getQualityLabel,
  getQualityBadgeClass,
  formatDate,
  formatDateShort,
  formatTime,
  formatDuration,
  formatRelativeTime,
  getStatusBadgeClass,
  getStatusIcon,
  getStatusText,
  isMatchLive,
  isMatchUpcoming,
  formatBytes,
  formatBandwidth,
  redactUrl,
  isValidUrl,
  getDomain,
  getAvailableLinks,
  getLinkNumber,
  getUserErrorMessage,
  sleep,
  debounce,
  throttle,
  generateId,
  deepClone,
  isMobile,
  supportsNativeHLS,
  supportsMSE,
};
