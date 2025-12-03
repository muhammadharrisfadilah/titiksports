import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility untuk merge Tailwind classes
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Get link quality label
export function getLinkQuality(quality) {
  const qualities = {
    auto: 'Auto',
    hd: 'HD',
    sd: 'SD',
    low: 'Low',
  };
  return qualities[quality] || 'Auto';
}

// Format date
export function formatDate(dateString) {
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

// Format time
export function formatTime(timeString) {
  return timeString || '00:00';
}

// Get status badge class
export function getStatusBadgeClass(status) {
  const badges = {
    live: 'badge-live',
    upcoming: 'badge-upcoming',
    ended: 'badge-ended',
  };
  return badges[status] || 'badge-upcoming';
}

// Get status icon
export function getStatusIcon(status) {
  const icons = {
    live: '🔴',
    upcoming: '🕒',
    ended: '⚫',
  };
  return icons[status] || '🕒';
}

// Get status text
export function getStatusText(status) {
  const texts = {
    live: 'LIVE',
    upcoming: 'UPCOMING',
    ended: 'ENDED',
  };
  return texts[status] || 'UPCOMING';
}