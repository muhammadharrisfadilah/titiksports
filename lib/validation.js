/**
 * Form Validation Utility
 * Untuk admin panel dan user input
 */

export class ValidationError extends Error {
  constructor(field, message) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

/**
 * Validate match form data
 */
export function validateMatchForm(data) {
  const errors = {};
  
  // Validate home team
  if (!data.home_team || !data.home_team.trim()) {
    errors.home_team = 'Tim home harus diisi';
  }
  
  // Validate away team
  if (!data.away_team || !data.away_team.trim()) {
    errors.away_team = 'Tim away harus diisi';
  }
  
  // Validate competition
  if (!data.competition || !data.competition.trim()) {
    errors.competition = 'Kompetisi harus diisi';
  }
  
  // Validate match date
  if (!data.match_date) {
    errors.match_date = 'Tanggal pertandingan harus diisi';
  } else {
    const date = new Date(data.match_date);
    if (isNaN(date.getTime())) {
      errors.match_date = 'Format tanggal tidak valid';
    }
  }
  
  // Validate match time
  if (!data.match_time || !data.match_time.trim()) {
    errors.match_time = 'Waktu pertandingan harus diisi';
  } else if (!/^\d{2}:\d{2}/.test(data.match_time)) {
    errors.match_time = 'Format waktu harus HH:MM';
  }
  
  // Validate status
  if (!['upcoming', 'live', 'ended'].includes(data.status)) {
    errors.status = 'Status tidak valid';
  }
  
  // Validate score if live/ended
  if (['live', 'ended'].includes(data.status)) {
    if (typeof data.home_score !== 'number' || data.home_score < 0) {
      errors.home_score = 'Skor home tidak valid';
    }
    if (typeof data.away_score !== 'number' || data.away_score < 0) {
      errors.away_score = 'Skor away tidak valid';
    }
  }
  
  // Validate at least one stream URL
  const hasStream = data.stream_url1 || data.stream_url2 || data.stream_url3;
  if (!hasStream) {
    errors.streams = 'Minimal satu stream URL harus diisi';
  }
  
  // Validate stream URLs format
  if (data.stream_url1 && !isValidStreamUrl(data.stream_url1)) {
    errors.stream_url1 = 'Format URL stream tidak valid';
  }
  if (data.stream_url2 && !isValidStreamUrl(data.stream_url2)) {
    errors.stream_url2 = 'Format URL stream tidak valid';
  }
  if (data.stream_url3 && !isValidStreamUrl(data.stream_url3)) {
    errors.stream_url3 = 'Format URL stream tidak valid';
  }
  
  return errors;
}

/**
 * Validate stream URL format
 */
export function isValidStreamUrl(url) {
  if (!url || typeof url !== 'string') return false;
  
  try {
    const parsedUrl = new URL(url);
    return ['http:', 'https:'].includes(parsedUrl.protocol);
  } catch {
    return false;
  }
}

/**
 * Validate match ID
 */
export function validateMatchId(id) {
  const parsed = parseInt(id);
  return !isNaN(parsed) && parsed > 0 && parsed < 999999;
}

/**
 * Validate credentials
 */
export function validateCredentials(username, password) {
  const errors = {};
  
  if (!username || !username.trim()) {
    errors.username = 'Username harus diisi';
  } else if (username.trim().length < 3) {
    errors.username = 'Username minimal 3 karakter';
  }
  
  if (!password) {
    errors.password = 'Password harus diisi';
  } else if (password.length < 6) {
    errors.password = 'Password minimal 6 karakter';
  }
  
  return errors;
}

/**
 * Validate token
 */
export function validateToken(token) {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Token tidak ada' };
  }
  
  try {
    // Token format: base64(data)
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const parts = decoded.split(':');
    
    if (parts.length < 2) {
      return { valid: false, error: 'Format token tidak valid' };
    }
    
    const timestamp = parseInt(parts[1], 10);
    if (!Number.isFinite(timestamp)) {
      return { valid: false, error: 'Timestamp tidak valid' };
    }
    
    const age = Date.now() - timestamp;
    const maxAge = 7200000; // 2 hours
    
    if (age > maxAge) {
      return { valid: false, error: 'Token expired' };
    }
    
    return { valid: true, decoded, timestamp };
  } catch (error) {
    return { valid: false, error: 'Token decode error' };
  }
}

/**
 * Sanitize user input
 */
export function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove angle brackets
    .substring(0, 500);    // Limit length
}

/**
 * Format validation errors for display
 */
export function formatValidationErrors(errors) {
  return Object.entries(errors).map(([field, message]) => ({
    field,
    message,
  }));
}

/**
 * Check if form is valid
 */
export function isFormValid(errors) {
  return Object.keys(errors).length === 0;
}

/**
 * Validate score format (for live matches)
 */
export function validateScore(score) {
  const num = parseInt(score);
  return !isNaN(num) && num >= 0 && num <= 99;
}

/**
 * Validate timezone/datetime
 */
export function validateDateTime(date, time) {
  try {
    const dateObj = new Date(date);
    const [hours, minutes] = time.split(':').map(Number);
    
    if (isNaN(dateObj.getTime())) return false;
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return false;
    
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate email (optional, for future use)
 */
export function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

/**
 * Batch validate multiple fields
 */
export function validateFields(fields, rules) {
  const errors = {};
  
  Object.entries(rules).forEach(([field, rule]) => {
    const value = fields[field];
    
    if (rule.required && (!value || (typeof value === 'string' && !value.trim()))) {
      errors[field] = rule.requiredMessage || `${field} harus diisi`;
      return;
    }
    
    if (rule.minLength && value && value.length < rule.minLength) {
      errors[field] = `${field} minimal ${rule.minLength} karakter`;
      return;
    }
    
    if (rule.maxLength && value && value.length > rule.maxLength) {
      errors[field] = `${field} maksimal ${rule.maxLength} karakter`;
      return;
    }
    
    if (rule.pattern && value && !rule.pattern.test(value)) {
      errors[field] = rule.patternMessage || `Format ${field} tidak valid`;
      return;
    }
    
    if (rule.validator && !rule.validator(value)) {
      errors[field] = rule.validatorMessage || `${field} tidak valid`;
    }
  });
  
  return errors;
}
