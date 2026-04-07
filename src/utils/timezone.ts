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
    // IMPORTANT: MariaDB is configured with -03:00 timezone (São Paulo)
    // The MySQL driver creates JS Date objects from the local time values
    // When JSON.stringify is called, it converts to ISO with Z suffix
    // But the time value is actually São Paulo time, not UTC
    // So "2026-01-14T22:09:31.000Z" is actually São Paulo time marked as UTC
    // We need to correct this by interpreting the Z time as São Paulo
    
    // Has Z suffix - this is from our MariaDB proxy JSON serialization
    // The time is actually São Paulo time, not UTC, so we need to adjust
    if (dateStr.endsWith('Z') || dateStr.endsWith('.000Z')) {
      const withoutZ = dateStr.replace(/\.000Z$/, '').replace(/Z$/, '');
      
      // Check if it's a date-only ISO string (e.g., "2026-01-15T00:00:00Z")
      // These should be treated as pure dates, not datetime with timezone
      if (withoutZ.endsWith('T00:00:00') || withoutZ.endsWith('T03:00:00')) {
        // Extract just the date part and create as local date
        const datePart = withoutZ.split('T')[0];
        const parts = datePart.split('-');
        if (parts.length === 3) {
          const year = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10) - 1;
          const day = parseInt(parts[2], 10);
          return new Date(year, month, day);
        }
      }
      
      // For actual datetime values, treat as São Paulo time
      return new Date(withoutZ + TIMEZONE_CONFIG.offsetString);
    }
    
    // Has explicit offset (+ or -HH:MM) - parse directly
    if (dateStr.includes('+') || /[-+]\d{2}:\d{2}$/.test(dateStr)) {
      return new Date(dateStr);
    }

    // === MULTI-FORMAT DETECTION ===

    const MONTH_MAP: Record<string, string> = {
      Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
      Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
      jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
      jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12",
    };

    // 1) "DD Mon YYYY HH:MM" / "DD Mon YYYY" (Firecrawl/timeline)
    const textMatch = dateStr.trim().match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})(?:\s+(\d{1,2}:\d{2}))?/);
    if (textMatch) {
      const mm = MONTH_MAP[textMatch[2].substring(0, 3)];
      if (mm) {
        const dd = textMatch[1].padStart(2, "0");
        const time = textMatch[4] || "00:00";
        return new Date(`${textMatch[3]}-${mm}-${dd}T${time}:00${TIMEZONE_CONFIG.offsetString}`);
      }
    }

    // 2) "Mon DD, YYYY" / "March 15, 2026" (English long)
    const enLongMatch = dateStr.trim().match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})(?:\s+(\d{1,2}:\d{2}))?/);
    if (enLongMatch) {
      const mm = MONTH_MAP[enLongMatch[1].substring(0, 3)];
      if (mm) {
        const dd = enLongMatch[2].padStart(2, "0");
        const time = enLongMatch[4] || "00:00";
        return new Date(`${enLongMatch[3]}-${mm}-${dd}T${time}:00${TIMEZONE_CONFIG.offsetString}`);
      }
    }

    // 3) "DD/MM/YYYY HH:mm" or "DD/MM/YYYY" (BR format)
    const brMatch = dateStr.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}:\d{2}(?::\d{2})?))?$/);
    if (brMatch) {
      const dd = brMatch[1].padStart(2, "0");
      const mm = brMatch[2].padStart(2, "0");
      const time = brMatch[4] || "00:00:00";
      return new Date(`${brMatch[3]}-${mm}-${dd}T${time}${TIMEZONE_CONFIG.offsetString}`);
    }

    // 4) "DD-MM-YYYY" or "DD.MM.YYYY" (European)
    const euMatch = dateStr.trim().match(/^(\d{1,2})[.\-](\d{1,2})[.\-](\d{4})(?:\s+(\d{1,2}:\d{2}(?::\d{2})?))?$/);
    if (euMatch) {
      const dd = euMatch[1].padStart(2, "0");
      const mm = euMatch[2].padStart(2, "0");
      const time = euMatch[4] || "00:00:00";
      return new Date(`${euMatch[3]}-${mm}-${dd}T${time}${TIMEZONE_CONFIG.offsetString}`);
    }

    // 5) "YYYY/MM/DD HH:mm:ss" (alternative ISO with /)
    const altIsoMatch = dateStr.trim().match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}:\d{2}(?::\d{2})?))?$/);
    if (altIsoMatch) {
      const mm = altIsoMatch[2].padStart(2, "0");
      const dd = altIsoMatch[3].padStart(2, "0");
      const time = altIsoMatch[4] || "00:00:00";
      return new Date(`${altIsoMatch[1]}-${mm}-${dd}T${time}${TIMEZONE_CONFIG.offsetString}`);
    }

    // 6) Unix timestamp (seconds or milliseconds)
    if (/^\d{10,13}$/.test(dateStr.trim())) {
      const ts = parseInt(dateStr.trim(), 10);
      return new Date(ts < 1e12 ? ts * 1000 : ts);
    }

    // MariaDB datetime format "YYYY-MM-DD HH:mm:ss" - add São Paulo offset
    if (dateStr.includes(' ') && /^\d{4}-\d{2}-\d{2}\s/.test(dateStr)) {
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
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      return new Date(year, month, day);
    }
    
    // Fallback: try native parsing, validate result
    const fallback = new Date(dateStr);
    return isNaN(fallback.getTime()) ? null : fallback;
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
