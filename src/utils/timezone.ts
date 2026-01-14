/**
 * Centralized timezone configuration for the entire project.
 * 
 * The application database (MariaDB) stores all dates in São Paulo/Brasília timezone (UTC-3).
 * This configuration ensures consistent date handling across all components.
 */

// ============= TIMEZONE CONFIGURATION =============
export const TIMEZONE_CONFIG = {
  /** The timezone used by the database */
  database: 'America/Sao_Paulo',
  
  /** UTC offset for São Paulo (standard time, no DST since 2019) */
  offsetHours: -3,
  
  /** ISO offset string for appending to date strings */
  offsetString: '-03:00',
  
  /** Display locale for formatting */
  locale: 'pt-BR',
} as const;

// ============= DATE PARSING UTILITIES =============

/**
 * Parse a date string from MariaDB, correctly handling the database timezone.
 * MariaDB stores dates in local time (UTC-3 São Paulo/Brasília).
 * 
 * @param dateStr - Date string from database (various formats supported)
 * @returns Date object or null if invalid
 */
export const parseDBDate = (dateStr: string | null | undefined): Date | null => {
  if (!dateStr) return null;
  
  try {
    // Already has timezone info (Z or offset) - parse directly
    if (dateStr.includes('Z') || dateStr.includes('+') || /[-+]\d{2}:\d{2}$/.test(dateStr)) {
      return new Date(dateStr);
    }
    
    // MariaDB datetime format "YYYY-MM-DD HH:mm:ss" - add São Paulo offset
    if (dateStr.includes(' ')) {
      return new Date(dateStr.replace(' ', 'T') + TIMEZONE_CONFIG.offsetString);
    }
    
    // ISO datetime without timezone (has T) - add São Paulo offset
    if (dateStr.includes('T')) {
      return new Date(dateStr + TIMEZONE_CONFIG.offsetString);
    }
    
    // Date-only format "YYYY-MM-DD" - create as local date to avoid off-by-one errors
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // JavaScript months are 0-indexed
      const day = parseInt(parts[2], 10);
      return new Date(year, month, day); // Creates local date at 00:00
    }
    
    // Fallback: try native parsing
    return new Date(dateStr);
  } catch {
    console.warn(`[Timezone] Failed to parse date: ${dateStr}`);
    return null;
  }
};

/**
 * Get current date/time in São Paulo timezone.
 * Useful for comparisons with database dates.
 */
export const getNowInDBTimezone = (): Date => {
  return new Date();
};

/**
 * Format a date for display using Brazilian locale.
 * 
 * @param date - Date object or string to format
 * @param formatStr - Format string (uses date-fns format)
 * @returns Formatted date string
 */
export const formatDateBR = (
  date: Date | string | null | undefined,
  options: Intl.DateTimeFormatOptions = { 
    day: '2-digit', 
    month: '2-digit', 
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }
): string => {
  if (!date) return '—';
  
  try {
    const dateObj = typeof date === 'string' ? parseDBDate(date) : date;
    if (!dateObj || isNaN(dateObj.getTime())) return '—';
    
    return dateObj.toLocaleString(TIMEZONE_CONFIG.locale, options);
  } catch {
    return '—';
  }
};

/**
 * Format a date for display (date only, no time).
 */
export const formatDateOnlyBR = (date: Date | string | null | undefined): string => {
  return formatDateBR(date, { 
    day: '2-digit', 
    month: '2-digit', 
    year: '2-digit' 
  });
};

/**
 * Format a date for display (date and time).
 */
export const formatDateTimeBR = (date: Date | string | null | undefined): string => {
  return formatDateBR(date, { 
    day: '2-digit', 
    month: '2-digit', 
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

/**
 * Format a date for display (time only).
 */
export const formatTimeOnlyBR = (date: Date | string | null | undefined): string => {
  return formatDateBR(date, { 
    hour: '2-digit',
    minute: '2-digit'
  });
};

/**
 * Convert a Date to ISO string with São Paulo offset for sending to backend.
 */
export const toDBDateString = (date: Date): string => {
  const pad = (n: number) => n.toString().padStart(2, '0');
  
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

/**
 * Check if a date string represents a valid date.
 */
export const isValidDate = (dateStr: string | null | undefined): boolean => {
  if (!dateStr) return false;
  const date = parseDBDate(dateStr);
  return date !== null && !isNaN(date.getTime());
};

// Re-export parseMariaDBDate as alias for backward compatibility
export { parseDBDate as parseMariaDBDate };
