/**
 * Utility to safely parse dates from MariaDB
 * MariaDB stores dates in local time (UTC-3 São Paulo/Brasília).
 * We need to explicitly add the timezone offset to ensure correct parsing
 * regardless of the browser's timezone setting.
 * 
 * Handles various date formats: date-only, datetime, ISO with/without timezone
 */
export const parseMariaDBDate = (dateStr: string | null | undefined): Date | null => {
  if (!dateStr) return null;
  
  // Se já contém 'Z' ou timezone offset, parse diretamente (já é UTC)
  if (dateStr.includes('Z') || dateStr.includes('+') || /[-+]\d{2}:\d{2}$/.test(dateStr)) {
    return new Date(dateStr);
  }
  
  // Se é formato MariaDB "YYYY-MM-DD HH:mm:ss", adicionar offset de São Paulo (-03:00)
  // Isso garante que a data seja interpretada corretamente independente do timezone do navegador
  if (dateStr.includes(' ')) {
    // Converter para ISO format e adicionar offset de São Paulo
    return new Date(dateStr.replace(' ', 'T') + '-03:00');
  }
  
  // Se tem 'T' sem timezone, adicionar offset de São Paulo
  if (dateStr.includes('T') && !dateStr.includes('Z') && !dateStr.includes('+') && !dateStr.includes('-', 10)) {
    return new Date(dateStr + '-03:00');
  }
  
  // Se é apenas data (YYYY-MM-DD), criar como meia-noite no horário de São Paulo
  return new Date(dateStr + 'T00:00:00-03:00');
};