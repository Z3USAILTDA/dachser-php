import * as XLSX from 'xlsx';

export interface SeaReportItem {
  id: string;
  arquivo: string;
  mbl_number: string | null;
  armador: string | null;
  cliente: string | null;
  data_atracacao: string | null;
  container: string | null;
  tipo_analise: string;
  status: string;
  data_criacao: string;
}

/**
 * Format analysis type for display
 */
function formatAnalysisType(type: string): string {
  switch (type) {
    case 'manifest_hbl': return 'Manifest × HBL';
    case 'hbl_mbl': return 'HBL × MBL';
    case 'invoices_hbl': return 'Invoices × HBL';
    default: return type;
  }
}

/**
 * Format status for display
 */
function formatStatus(status: string): string {
  switch (status) {
    case 'pendente': return 'Pendente';
    case 'analisado': return 'Analisado';
    case 'realizado': return 'Concluído';
    case 'erro': return 'Erro';
    case 'queued': return 'Na Fila';
    default: return status;
  }
}

/**
 * Format date for display (DD/MM/YYYY)
 */
function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-BR');
  } catch {
    return dateStr;
  }
}

/**
 * Export SEA report data to Excel
 */
export function exportSeaReportToExcel(items: SeaReportItem[], filename: string = 'relatorio-sea'): void {
  // Transform data for Excel
  const excelData = items.map((item, index) => ({
    '#': index + 1,
    'MBL': item.mbl_number || '-',
    'Armador': item.armador || '-',
    'Cliente': item.cliente || '-',
    'Data Atracação': formatDate(item.data_atracacao),
    'Container': item.container || '-',
    'Tipo Análise': formatAnalysisType(item.tipo_analise),
    'Status': formatStatus(item.status),
    'Data Criação': formatDate(item.data_criacao),
    'Arquivo': item.arquivo || '-'
  }));

  // Create workbook and worksheet
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(excelData);

  // Set column widths
  ws['!cols'] = [
    { wch: 5 },   // #
    { wch: 20 },  // MBL
    { wch: 18 },  // Armador
    { wch: 35 },  // Cliente
    { wch: 15 },  // Data Atracação
    { wch: 15 },  // Container
    { wch: 18 },  // Tipo Análise
    { wch: 12 },  // Status
    { wch: 15 },  // Data Criação
    { wch: 40 },  // Arquivo
  ];

  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(wb, ws, 'Relatório SEA');

  // Generate filename with date
  const dateStr = new Date().toISOString().split('T')[0];
  const fullFilename = `${filename}-${dateStr}.xlsx`;

  // Download the file
  XLSX.writeFile(wb, fullFilename);
}

/**
 * Export SEA report data to CSV
 */
export function exportSeaReportToCSV(items: SeaReportItem[], filename: string = 'relatorio-sea'): void {
  // Create CSV header
  const headers = ['#', 'MBL', 'Armador', 'Cliente', 'Data Atracação', 'Container', 'Tipo Análise', 'Status', 'Data Criação', 'Arquivo'];
  
  // Create CSV rows
  const rows = items.map((item, index) => [
    index + 1,
    item.mbl_number || '-',
    item.armador || '-',
    item.cliente || '-',
    formatDate(item.data_atracacao),
    item.container || '-',
    formatAnalysisType(item.tipo_analise),
    formatStatus(item.status),
    formatDate(item.data_criacao),
    item.arquivo || '-'
  ]);

  // Combine headers and rows
  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  // Create blob and download
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  
  const dateStr = new Date().toISOString().split('T')[0];
  link.href = url;
  link.download = `${filename}-${dateStr}.csv`;
  link.click();
  
  URL.revokeObjectURL(url);
}
