/**
 * Utility to safely parse dates from MariaDB as UTC
 * Handles various date formats: date-only, datetime, ISO with/without timezone
 */
export const parseMariaDBDate = (dateStr: string | null | undefined): Date | null => {
  if (!dateStr) return null;
  
  // Se já contém 'Z' ou timezone, parse diretamente
  if (dateStr.includes('Z') || dateStr.includes('+')) {
    return new Date(dateStr);
  }
  
  // Se tem 'T', é ISO sem timezone - adicionar Z
  if (dateStr.includes('T')) {
    return new Date(dateStr + 'Z');
  }
  
  // Se tem espaço (formato "YYYY-MM-DD HH:mm:ss"), converter para ISO
  if (dateStr.includes(' ')) {
    return new Date(dateStr.replace(' ', 'T') + 'Z');
  }
  
  // Se é apenas data (YYYY-MM-DD), adicionar horário meia-noite UTC
  return new Date(dateStr + 'T00:00:00Z');
};
