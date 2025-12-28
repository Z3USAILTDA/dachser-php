/**
 * Utility to safely parse dates from MariaDB
 * MariaDB stores dates in local time (UTC-3 São Paulo), so we should NOT add 'Z'
 * to datetime strings, letting JavaScript interpret them as local time.
 * 
 * Handles various date formats: date-only, datetime, ISO with/without timezone
 */
export const parseMariaDBDate = (dateStr: string | null | undefined): Date | null => {
  if (!dateStr) return null;
  
  // Se já contém 'Z' ou timezone offset, parse diretamente (já é UTC)
  if (dateStr.includes('Z') || dateStr.includes('+') || /[-+]\d{2}:\d{2}$/.test(dateStr)) {
    return new Date(dateStr);
  }
  
  // Se é formato MariaDB "YYYY-MM-DD HH:mm:ss", interpretar como hora LOCAL
  // NÃO adicionar 'Z' pois o MariaDB armazena em UTC-3
  if (dateStr.includes(' ')) {
    // Criar Date diretamente - será interpretado como hora local
    return new Date(dateStr.replace(' ', 'T'));
  }
  
  // Se tem 'T' sem timezone, interpretar como hora local
  if (dateStr.includes('T')) {
    return new Date(dateStr);
  }
  
  // Se é apenas data (YYYY-MM-DD), criar como meia-noite local
  return new Date(dateStr + 'T00:00:00');
};
