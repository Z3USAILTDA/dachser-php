import XLSX from "xlsx-js-style";

interface DisputaRow {
  cliente?: string;
  razao_base?: string;
  nf?: string;
  nd?: string;
  emissao?: string;
  vencimento?: string;
  created_at?: string;
  responsavel?: string;
  valor?: number;
  tipo?: string;
  observacoes?: string;
  status?: string;
}

const formatDate = (dateStr?: string): string => {
  if (!dateStr) return "-";
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("pt-BR");
  } catch {
    return "-";
  }
};

const formatMoney = (value?: number): string => {
  if (value === undefined || value === null) return "-";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
};

const formatElapsed = (dateStr?: string): string => {
  if (!dateStr) return "-";
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Hoje";
    if (diffDays === 1) return "1 dia";
    return `${diffDays} dias`;
  } catch {
    return "-";
  }
};

// DACHSER brand colors
const DACHSER_ORANGE = "F57C00";
const DACHSER_GOLD = "B8860B";
const WHITE = "FFFFFF";
const LIGHT_GRAY = "F5F5F5";
const DARK_TEXT = "333333";
const BORDER_COLOR = "E0E0E0";

const headerStyle = {
  font: { bold: true, color: { rgb: WHITE }, sz: 11, name: "Arial" },
  fill: { fgColor: { rgb: DACHSER_ORANGE } },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  border: {
    top: { style: "thin", color: { rgb: BORDER_COLOR } },
    bottom: { style: "thin", color: { rgb: BORDER_COLOR } },
    left: { style: "thin", color: { rgb: BORDER_COLOR } },
    right: { style: "thin", color: { rgb: BORDER_COLOR } },
  },
};

const titleStyle = {
  font: { bold: true, color: { rgb: DACHSER_GOLD }, sz: 16, name: "Arial" },
  alignment: { horizontal: "left", vertical: "center" },
};

const subtitleStyle = {
  font: { color: { rgb: "666666" }, sz: 10, name: "Arial" },
  alignment: { horizontal: "left", vertical: "center" },
};

const dataStyle = {
  font: { color: { rgb: DARK_TEXT }, sz: 10, name: "Arial" },
  alignment: { horizontal: "left", vertical: "center" },
  border: {
    top: { style: "thin", color: { rgb: BORDER_COLOR } },
    bottom: { style: "thin", color: { rgb: BORDER_COLOR } },
    left: { style: "thin", color: { rgb: BORDER_COLOR } },
    right: { style: "thin", color: { rgb: BORDER_COLOR } },
  },
};

const dataStyleAlt = {
  ...dataStyle,
  fill: { fgColor: { rgb: LIGHT_GRAY } },
};

const moneyStyle = {
  ...dataStyle,
  alignment: { horizontal: "right", vertical: "center" },
  numFmt: '"R$"#,##0.00',
};

const moneyStyleAlt = {
  ...moneyStyle,
  fill: { fgColor: { rgb: LIGHT_GRAY } },
};

const centerStyle = {
  ...dataStyle,
  alignment: { horizontal: "center", vertical: "center" },
};

const centerStyleAlt = {
  ...centerStyle,
  fill: { fgColor: { rgb: LIGHT_GRAY } },
};

const summaryLabelStyle = {
  font: { bold: true, color: { rgb: DARK_TEXT }, sz: 10, name: "Arial" },
  alignment: { horizontal: "right", vertical: "center" },
  fill: { fgColor: { rgb: "FFF3E0" } },
  border: {
    top: { style: "medium", color: { rgb: DACHSER_ORANGE } },
    bottom: { style: "thin", color: { rgb: BORDER_COLOR } },
    left: { style: "thin", color: { rgb: BORDER_COLOR } },
    right: { style: "thin", color: { rgb: BORDER_COLOR } },
  },
};

const summaryValueStyle = {
  font: { bold: true, color: { rgb: DACHSER_ORANGE }, sz: 11, name: "Arial" },
  alignment: { horizontal: "center", vertical: "center" },
  fill: { fgColor: { rgb: "FFF3E0" } },
  border: {
    top: { style: "medium", color: { rgb: DACHSER_ORANGE } },
    bottom: { style: "thin", color: { rgb: BORDER_COLOR } },
    left: { style: "thin", color: { rgb: BORDER_COLOR } },
    right: { style: "thin", color: { rgb: BORDER_COLOR } },
  },
};

export const exportDisputasToExcel = (rows: DisputaRow[], filterLabel?: string): void => {
  const wb = XLSX.utils.book_new();

  // Column headers
  const headers = [
    "Cliente",
    "Documento/NF",
    "Emissão",
    "Vencimento",
    "Tempo em Disputa",
    "Responsável",
    "Valor (R$)",
    "Tipo",
    "Status",
    "Observações",
  ];

  // Prepare data rows
  const dataRows: (string | number)[][] = rows.map((r) => [
    r.cliente || r.razao_base || "-",
    r.nf || r.nd || "-",
    formatDate(r.emissao),
    formatDate(r.vencimento),
    formatElapsed(r.created_at),
    r.responsavel || "-",
    r.valor ?? 0,
    r.tipo || "-",
    r.status || "-",
    r.observacoes || "-",
  ]);

  // Calculate totals
  const totalValor = rows.reduce((sum, r) => sum + (r.valor || 0), 0);
  const totalRegistros = rows.length;

  // Generate subtitle
  const now = new Date();
  const dateStr = now.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const filterInfo = filterLabel ? ` | Filtro: ${filterLabel}` : "";

  // Create worksheet data array with all rows
  const wsData: (string | number)[][] = [
    ["Relatório de Disputas Financeiras", "", "", "", "", "", "", "", "", ""], // Row 1: Title
    [`Gerado em: ${dateStr}${filterInfo}`, "", "", "", "", "", "", "", "", ""], // Row 2: Subtitle
    ["", "", "", "", "", "", "", "", "", ""], // Row 3: Empty spacing
    headers, // Row 4: Headers
    ...dataRows, // Data rows
    ["", "", "", "", "", "", "", "", "", ""], // Empty row before summary
    ["", "", "", "", "Total de Registros:", totalRegistros, "Total Valor:", formatMoney(totalValor), "", ""], // Summary row
  ];

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Merge title and subtitle cells
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 9 } }, // Title merge
    { s: { r: 1, c: 0 }, e: { r: 1, c: 9 } }, // Subtitle merge
  ];

  // Apply title style (Row 1)
  ws["A1"].s = titleStyle;

  // Apply subtitle style (Row 2)
  ws["A2"].s = subtitleStyle;

  // Apply header styles (Row 4, index 3)
  headers.forEach((_, colIdx) => {
    const cellRef = XLSX.utils.encode_cell({ r: 3, c: colIdx });
    if (ws[cellRef]) {
      ws[cellRef].s = headerStyle;
    }
  });

  // Style data rows (starting from row 5, index 4)
  dataRows.forEach((row, rowIdx) => {
    const isAlt = rowIdx % 2 === 1;
    row.forEach((cell, colIdx) => {
      const cellRef = XLSX.utils.encode_cell({ r: rowIdx + 4, c: colIdx });
      
      let style;
      if (colIdx === 6) {
        // Valor column - right aligned with currency format
        style = isAlt ? moneyStyleAlt : moneyStyle;
      } else if (colIdx === 2 || colIdx === 3 || colIdx === 4 || colIdx === 8) {
        // Date/Status columns - centered
        style = isAlt ? centerStyleAlt : centerStyle;
      } else {
        style = isAlt ? dataStyleAlt : dataStyle;
      }
      
      ws[cellRef] = { v: cell, s: style };
    });
  });

  // Add summary row
  const summaryRowIdx = dataRows.length + 5;
  ws[XLSX.utils.encode_cell({ r: summaryRowIdx, c: 4 })] = { v: "Total de Registros:", s: summaryLabelStyle };
  ws[XLSX.utils.encode_cell({ r: summaryRowIdx, c: 5 })] = { v: totalRegistros, s: summaryValueStyle };
  ws[XLSX.utils.encode_cell({ r: summaryRowIdx, c: 6 })] = { v: "Total Valor:", s: summaryLabelStyle };
  ws[XLSX.utils.encode_cell({ r: summaryRowIdx, c: 7 })] = { v: formatMoney(totalValor), s: summaryValueStyle };

  // Set column widths
  ws["!cols"] = [
    { wch: 30 }, // Cliente
    { wch: 18 }, // Documento/NF
    { wch: 12 }, // Emissão
    { wch: 12 }, // Vencimento
    { wch: 16 }, // Tempo em Disputa
    { wch: 20 }, // Responsável
    { wch: 14 }, // Valor
    { wch: 14 }, // Tipo
    { wch: 12 }, // Status
    { wch: 35 }, // Observações
  ];

  // Set row heights
  ws["!rows"] = [
    { hpt: 28 }, // Title row
    { hpt: 18 }, // Subtitle row
    { hpt: 10 }, // Empty spacing
    { hpt: 24 }, // Header row
    ...dataRows.map(() => ({ hpt: 20 })), // Data rows
    { hpt: 10 }, // Empty row
    { hpt: 22 }, // Summary row
  ];

  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(wb, ws, "Disputas");

  // Generate filename with date
  const fileName = `disputas_${now.toISOString().split("T")[0]}.xlsx`;

  // Write file
  XLSX.writeFile(wb, fileName);
};
