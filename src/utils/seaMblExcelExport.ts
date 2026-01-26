import * as XLSX from 'xlsx-js-style';
import { supabase } from '@/integrations/supabase/client';

// DACHSER colors
const DACHSER_ORANGE = "F57C00";
const DACHSER_LIGHT_ORANGE = "FFF3E0";

interface SeaMblExportItem {
  mawb: string;
  tipo_processo: string;
  etd: string | null;
  eta: string | null;
  shipper: string | null;
  consignee: string | null;
  coordenador: string | null;
  origin: string | null;
  destination: string | null;
}

/**
 * Fetches maritime MBLs from the last 2 months and exports to Excel
 * with DACHSER orange header formatting
 */
export async function exportSeaMblsToExcel(): Promise<{ success: boolean; filename?: string; error?: string; count?: number }> {
  try {
    // Fetch data from MariaDB via edge function
    const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
      body: {
        action: 'get_sea_mbls_export'
      }
    });

    if (error) {
      console.error('[SeaMblExport] Error fetching data:', error);
      return { success: false, error: error.message };
    }

    if (!data?.success || !data?.data?.length) {
      return { success: false, error: 'Nenhum dado encontrado para exportar' };
    }

    const mbls: SeaMblExportItem[] = data.data;

    // Prepare Excel data
    const excelRows = mbls.map((item, index) => ({
      "#": index + 1,
      "MBL": item.mawb || "-",
      "Tipo Processo": item.tipo_processo || "-",
      "ETD": formatDate(item.etd),
      "ETA": formatDate(item.eta),
      "Shipper": item.shipper || "-",
      "Consignee": item.consignee || "-",
      "Coordenador": item.coordenador || "-",
      "Origem": item.origin || "-",
      "Destino": item.destination || "-",
    }));

    // Create worksheet
    const ws = XLSX.utils.json_to_sheet(excelRows);

    // Get range
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    const numCols = range.e.c + 1;

    // Style header row (row 0)
    for (let col = 0; col < numCols; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
      if (ws[cellAddress]) {
        ws[cellAddress].s = {
          fill: { fgColor: { rgb: DACHSER_ORANGE } },
          font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
          alignment: { horizontal: "center", vertical: "center" },
          border: {
            top: { style: "thin", color: { rgb: "000000" } },
            bottom: { style: "thin", color: { rgb: "000000" } },
            left: { style: "thin", color: { rgb: "000000" } },
            right: { style: "thin", color: { rgb: "000000" } },
          },
        };
      }
    }

    // Style data rows with alternating colors
    for (let row = 1; row <= range.e.r; row++) {
      for (let col = 0; col < numCols; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
        if (ws[cellAddress]) {
          ws[cellAddress].s = {
            fill: row % 2 === 0 ? { fgColor: { rgb: DACHSER_LIGHT_ORANGE } } : { fgColor: { rgb: "FFFFFF" } },
            font: { sz: 10 },
            alignment: { horizontal: col === 0 ? "center" : "left", vertical: "center" },
            border: {
              top: { style: "thin", color: { rgb: "CCCCCC" } },
              bottom: { style: "thin", color: { rgb: "CCCCCC" } },
              left: { style: "thin", color: { rgb: "CCCCCC" } },
              right: { style: "thin", color: { rgb: "CCCCCC" } },
            },
          };
        }
      }
    }

    // Set column widths
    ws['!cols'] = [
      { wch: 5 },   // #
      { wch: 25 },  // MBL
      { wch: 15 },  // Tipo Processo
      { wch: 12 },  // ETD
      { wch: 12 },  // ETA
      { wch: 30 },  // Shipper
      { wch: 30 },  // Consignee
      { wch: 20 },  // Coordenador
      { wch: 15 },  // Origem
      { wch: 15 },  // Destino
    ];

    // Create workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "MBLs Marítimos");

    // Generate filename with date
    const dateStr = new Date().toISOString().split("T")[0];
    const filename = `mbls-maritimos-2meses-${dateStr}.xlsx`;

    // Download file
    XLSX.writeFile(wb, filename);

    return { success: true, filename, count: mbls.length };
  } catch (err) {
    console.error('[SeaMblExport] Unexpected error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Erro desconhecido' };
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('pt-BR');
  } catch {
    return dateStr;
  }
}
