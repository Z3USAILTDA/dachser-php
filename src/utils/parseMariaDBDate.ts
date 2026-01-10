/**
 * Utility to safely parse dates from MariaDB
 * MariaDB stores dates in local time (UTC-3 São Paulo/Brasília).
 * 
 * Handles various date formats: date-only, datetime, ISO with/without timezone
 * 
 * IMPORTANT: For date-only strings (YYYY-MM-DD), we create a local date
 * to avoid off-by-one errors caused by UTC interpretation.
 */
export const parseMariaDBDate = (dateStr: string | null | undefined): Date | null => {
  if (!dateStr) return null;
  
  // Se já contém 'Z' ou timezone offset, parse diretamente (já é UTC)
  if (dateStr.includes('Z') || dateStr.includes('+') || /[-+]\d{2}:\d{2}$/.test(dateStr)) {
    return new Date(dateStr);
  }
  
  // Se é formato MariaDB "YYYY-MM-DD HH:mm:ss", adicionar offset de São Paulo (-03:00)
  if (dateStr.includes(' ')) {
    return new Date(dateStr.replace(' ', 'T') + '-03:00');
  }
  
  // Se tem 'T' sem timezone (datetime ISO sem offset), adicionar offset de São Paulo
  if (dateStr.includes('T')) {
    return new Date(dateStr + '-03:00');
  }
  
  // CORREÇÃO: Se é apenas data (YYYY-MM-DD), criar como data local
  // Isso evita o problema de "um dia a menos" quando o browser interpreta como UTC
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // JavaScript months are 0-indexed
    const day = parseInt(parts[2], 10);
    return new Date(year, month, day); // Creates local date at 00:00
  }
  
  // Fallback: try native parsing
  return new Date(dateStr);
};