/**
 * @deprecated Use parseDBDate from '@/utils/timezone' instead.
 * This file is kept for backward compatibility.
 */
export { parseDBDate as parseMariaDBDate } from './timezone';

// Re-export timezone config and utilities for convenience
export { 
  TIMEZONE_CONFIG, 
  parseDBDate, 
  formatDateBR, 
  formatDateOnlyBR, 
  formatDateTimeBR,
  formatTimeOnlyBR,
  toDBDateString,
  isValidDate,
  getNowInDBTimezone
} from './timezone';