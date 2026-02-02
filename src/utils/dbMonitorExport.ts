import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx-js-style";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { parseDBDate } from "@/utils/timezone";

// Types
interface ModalBreakdown {
  lastUpdate: string | null;
  totalRecords: number;
  recentInserts: number;
  breakdown: {
    [key: string]: { lastUpdate: string | null; count: number; recentInserts: number };
  };
}

interface TableStats {
  lastUpdate: string | null;
  totalRecords: number;
  recentInserts: number;
  applications: string[];
  byModal?: {
    AIR: ModalBreakdown;
    SEA: ModalBreakdown;
  };
}

interface DatabaseStats {
  t_master_dados: TableStats;
  t_dados_financeiro_nfs: TableStats;
  t_dados_financeiro_voucher: TableStats;
  tbaixas: TableStats;
  fetchedAt: string;
}

type HealthStatus = "green" | "yellow" | "red";

interface ExportableArea {
  name: string;
  technicalName: string;
  description: string;
  status: string;
  statusColor: HealthStatus;
  lastUpdate: string;
  lastUpdateFormatted: string;
  totalRecords: number;
  recentInserts: number;
  applications: string[];
  details?: {
    air?: { total: number; inserts: number; breakdown?: Record<string, number> };
    sea?: { total: number; inserts: number; breakdown?: Record<string, number> };
  };
}

interface ExportableSummary {
  totalRecords: number;
  healthyCount: number;
  warningCount: number;
  criticalCount: number;
  totalInserts24h: number;
  areasCount: number;
}

// Terminology mapping
const AREA_NAMES: Record<string, { name: string; description: string }> = {
  t_master_dados: {
    name: "Dados Operacionais",
    description: "Processos de importação e exportação aérea e marítima",
  },
  t_dados_financeiro_nfs: {
    name: "Notas Fiscais",
    description: "Dados para régua de cobrança",
  },
  t_dados_financeiro_voucher: {
    name: "Vouchers/SPO",
    description: "Esteira de pagamentos",
  },
  tbaixas: {
    name: "Baixas Financeiras",
    description: "Comprovantes de pagamento processados",
  },
};

const STATUS_LABELS: Record<HealthStatus, string> = {
  green: "Atualizado",
  yellow: "Verificar",
  red: "Ação Necessária",
};

const APPLICATION_LABELS: Record<string, string> = {
  AIR: "Operações Aéreas",
  SEA: "Operações Marítimas",
  CCT: "CCT",
  TRACKING: "Rastreamento",
  OLIMPO: "Olimpo",
  REGUA: "Régua de Cobrança",
  ESTEIRA: "Esteira de Pagamentos",
};

// Utility functions
function getHealthStatus(lastUpdate: string | null): HealthStatus {
  if (!lastUpdate) return "red";

  const now = new Date();
  const updateTime = parseDBDate(lastUpdate);
  if (!updateTime) return "red";

  const diffMinutes = (now.getTime() - updateTime.getTime()) / (1000 * 60);

  if (diffMinutes <= 5) return "green";
  if (diffMinutes <= 60) return "yellow";
  return "red";
}

function formatNumber(num: number): string {
  return num.toLocaleString("pt-BR");
}

function formatDateTime(date: string | null): string {
  if (!date) return "Nunca atualizado";
  const parsed = parseDBDate(date);
  if (!parsed) return "Nunca atualizado";
  return format(parsed, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

function formatRelativeTime(date: string | null): string {
  if (!date) return "Nunca";
  const parsed = parseDBDate(date);
  if (!parsed) return "Nunca";

  const now = new Date();
  const diffMinutes = Math.floor((now.getTime() - parsed.getTime()) / (1000 * 60));

  if (diffMinutes < 1) return "Agora mesmo";
  if (diffMinutes < 60) return `há ${diffMinutes} min`;
  if (diffMinutes < 1440) return `há ${Math.floor(diffMinutes / 60)}h`;
  return `há ${Math.floor(diffMinutes / 1440)} dias`;
}

// Transform stats to exportable format
function transformToExportable(stats: DatabaseStats): { areas: ExportableArea[]; summary: ExportableSummary } {
  const areas: ExportableArea[] = [];
  const tables = [
    { key: "t_master_dados", data: stats.t_master_dados },
    { key: "t_dados_financeiro_nfs", data: stats.t_dados_financeiro_nfs },
    { key: "t_dados_financeiro_voucher", data: stats.t_dados_financeiro_voucher },
    { key: "tbaixas", data: stats.tbaixas },
  ];

  for (const { key, data } of tables) {
    const health = getHealthStatus(data.lastUpdate);
    const area: ExportableArea = {
      name: AREA_NAMES[key].name,
      technicalName: key,
      description: AREA_NAMES[key].description,
      status: STATUS_LABELS[health],
      statusColor: health,
      lastUpdate: data.lastUpdate || "",
      lastUpdateFormatted: formatDateTime(data.lastUpdate),
      totalRecords: data.totalRecords,
      recentInserts: data.recentInserts,
      applications: data.applications.map((app) => APPLICATION_LABELS[app] || app),
    };

    // Add modal breakdown for t_master_dados
    if (key === "t_master_dados" && data.byModal) {
      area.details = {
        air: {
          total: data.byModal.AIR.totalRecords,
          inserts: data.byModal.AIR.recentInserts,
          breakdown: Object.fromEntries(
            Object.entries(data.byModal.AIR.breakdown).map(([k, v]) => [k, v.count])
          ),
        },
        sea: {
          total: data.byModal.SEA.totalRecords,
          inserts: data.byModal.SEA.recentInserts,
          breakdown: Object.fromEntries(
            Object.entries(data.byModal.SEA.breakdown).map(([k, v]) => [k, v.count])
          ),
        },
      };
    }

    areas.push(area);
  }

  const summary: ExportableSummary = {
    totalRecords: areas.reduce((sum, a) => sum + a.totalRecords, 0),
    healthyCount: areas.filter((a) => a.statusColor === "green").length,
    warningCount: areas.filter((a) => a.statusColor === "yellow").length,
    criticalCount: areas.filter((a) => a.statusColor === "red").length,
    totalInserts24h: areas.reduce((sum, a) => sum + a.recentInserts, 0),
    areasCount: areas.length,
  };

  return { areas, summary };
}

// PDF Export
export function exportDbMonitorPDF(stats: DatabaseStats): string {
  const { areas, summary } = transformToExportable(stats);
  const now = new Date();
  const fileName = `relatorio-monitoramento-${format(now, "yyyy-MM-dd-HHmm")}.pdf`;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  let yPos = margin;

  // Colors
  const primaryColor: [number, number, number] = [255, 200, 0]; // DACHSER yellow
  const darkColor: [number, number, number] = [30, 30, 35];
  const greenColor: [number, number, number] = [34, 197, 94];
  const yellowColor: [number, number, number] = [245, 158, 11];
  const redColor: [number, number, number] = [239, 68, 68];

  const statusColors: Record<HealthStatus, [number, number, number]> = {
    green: greenColor,
    yellow: yellowColor,
    red: redColor,
  };

  // Helper: Add header
  function addHeader() {
    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, pageWidth, 25, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(...darkColor);
    doc.text("DACHSER", margin, 15);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.text("Relatório de Monitoramento de Dados", pageWidth - margin, 15, { align: "right" });

    yPos = 35;
  }

  // Helper: Add footer
  function addFooter(pageNum: number, totalPages: number) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);

    doc.text("Sistema Z3US.AI", margin, pageHeight - 10);
    doc.text(`Página ${pageNum} de ${totalPages}`, pageWidth - margin, pageHeight - 10, { align: "right" });
    doc.text(
      `Gerado em: ${format(now, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`,
      pageWidth / 2,
      pageHeight - 10,
      { align: "center" }
    );
  }

  // Helper: Draw status indicator
  function drawStatusIndicator(x: number, y: number, color: HealthStatus) {
    doc.setFillColor(...statusColors[color]);
    doc.circle(x, y, 3, "F");
  }

  // PAGE 1: Executive Summary
  addHeader();

  // Report info
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Data do Relatório: ${format(now, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}`, margin, yPos);
  yPos += 12;

  // Summary cards - 2 cards only
  const cardWidth = (pageWidth - margin * 2 - 5) / 2;
  const cardHeight = 35;

  // Card 1: Processed 24h
  doc.setFillColor(245, 245, 250);
  doc.roundedRect(margin, yPos, cardWidth, cardHeight, 3, 3, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text("PROCESSADOS NAS ÚLTIMAS 24H", margin + 5, yPos + 12);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...greenColor);
  doc.text(`+${formatNumber(summary.totalInserts24h)}`, margin + 5, yPos + 27);

  // Card 2: Status Overview
  doc.setFillColor(245, 245, 250);
  doc.roundedRect(margin + cardWidth + 5, yPos, cardWidth, cardHeight, 3, 3, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text("SITUAÇÃO DAS ÁREAS", margin + cardWidth + 10, yPos + 12);

  const statusY = yPos + 24;
  const statusX = margin + cardWidth + 10;

  drawStatusIndicator(statusX + 3, statusY, "green");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...darkColor);
  doc.text(`${summary.healthyCount} OK`, statusX + 10, statusY + 3);

  drawStatusIndicator(statusX + 43, statusY, "yellow");
  doc.text(`${summary.warningCount} Atenção`, statusX + 50, statusY + 3);

  drawStatusIndicator(statusX + 100, statusY, "red");
  doc.text(`${summary.criticalCount} Crítico`, statusX + 107, statusY + 3);

  yPos += cardHeight + 15;

  // Status Table
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...darkColor);
  doc.text("Situação por Área", margin, yPos);
  yPos += 8;

  const tableData = areas.map((area) => [
    area.name,
    area.status,
    formatRelativeTime(area.lastUpdate),
    `+${formatNumber(area.recentInserts)}`,
  ]);

  autoTable(doc, {
    startY: yPos,
    head: [["Área", "Status", "Última Atualização", "Processados (24h)"]],
    body: tableData,
    theme: "grid",
    styles: {
      fontSize: 9,
      cellPadding: 5,
    },
    headStyles: {
      fillColor: primaryColor,
      textColor: darkColor,
      fontStyle: "bold",
    },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 55 },
      1: { halign: "center", cellWidth: 40 },
      2: { halign: "center", cellWidth: 45 },
      3: { halign: "right", textColor: greenColor, cellWidth: 40 },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 1) {
        const status = data.cell.raw as string;
        if (status === "Atualizado") {
          data.cell.styles.textColor = greenColor;
        } else if (status === "Verificar") {
          data.cell.styles.textColor = yellowColor;
        } else if (status === "Ação Necessária") {
          data.cell.styles.textColor = redColor;
        }
      }
    },
    margin: { left: margin, right: margin },
  });

  yPos = (doc as any).lastAutoTable.finalY + 20;

  // Legend section - on same page if space allows
  if (yPos < pageHeight - 80) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...darkColor);
    doc.text("Legenda", margin, yPos);
    yPos += 10;

    const legends = [
      { color: "green" as HealthStatus, label: "Atualizado", desc: "Dados recebidos nos últimos 5 minutos" },
      { color: "yellow" as HealthStatus, label: "Verificar", desc: "Sem atualização entre 5 e 60 minutos" },
      { color: "red" as HealthStatus, label: "Ação Necessária", desc: "Sem atualização há mais de 60 minutos" },
    ];

    for (const legend of legends) {
      drawStatusIndicator(margin + 5, yPos, legend.color);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...darkColor);
      doc.text(legend.label, margin + 12, yPos + 3);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text(`- ${legend.desc}`, margin + 50, yPos + 3);
      yPos += 10;
    }
  }

  // Add footer
  addFooter(1, 1);

  // Save
  doc.save(fileName);
  return fileName;
}

// Excel Export
export function exportDbMonitorExcel(stats: DatabaseStats): string {
  const { areas, summary } = transformToExportable(stats);
  const now = new Date();
  const fileName = `relatorio-monitoramento-${format(now, "yyyy-MM-dd-HHmm")}.xlsx`;

  const wb = XLSX.utils.book_new();

  // Styles
  const headerStyle = {
    font: { bold: true, color: { rgb: "1E1E23" }, sz: 11 },
    fill: { fgColor: { rgb: "FFC800" } },
    alignment: { horizontal: "center", vertical: "center" },
    border: {
      top: { style: "thin", color: { rgb: "CCCCCC" } },
      bottom: { style: "thin", color: { rgb: "CCCCCC" } },
      left: { style: "thin", color: { rgb: "CCCCCC" } },
      right: { style: "thin", color: { rgb: "CCCCCC" } },
    },
  };

  const titleStyle = {
    font: { bold: true, sz: 14, color: { rgb: "1E1E23" } },
    alignment: { horizontal: "left" },
  };

  const subtitleStyle = {
    font: { bold: false, sz: 10, color: { rgb: "666666" } },
    alignment: { horizontal: "left" },
  };

  const numberStyle = {
    numFmt: "#,##0",
    alignment: { horizontal: "right" },
  };

  const greenStyle = {
    font: { color: { rgb: "22C55E" }, bold: true },
    alignment: { horizontal: "center" },
  };

  const yellowStyle = {
    font: { color: { rgb: "F59E0B" }, bold: true },
    alignment: { horizontal: "center" },
  };

  const redStyle = {
    font: { color: { rgb: "EF4444" }, bold: true },
    alignment: { horizontal: "center" },
  };

  // Single Sheet: Relatório Completo
  const data: (string | number)[][] = [
    ["RELATÓRIO DE MONITORAMENTO DE DADOS - DACHSER"],
    [`Gerado em: ${format(now, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`],
    [],
    ["RESUMO"],
    ["Áreas Monitoradas", summary.areasCount, "", "Áreas OK", summary.healthyCount],
    ["Processados (24h)", summary.totalInserts24h, "", "Áreas Atenção", summary.warningCount],
    ["", "", "", "Áreas Críticas", summary.criticalCount],
    [],
    ["SITUAÇÃO POR ÁREA"],
    ["Área", "Status", "Última Atualização", "Processados (24h)"],
    ...areas.map((area) => [
      area.name,
      area.status,
      area.lastUpdateFormatted,
      area.recentInserts,
    ]),
    [],
    ["LEGENDA"],
    ["Atualizado", "Dados recebidos nos últimos 5 minutos"],
    ["Verificar", "Sem atualização entre 5 e 60 minutos"],
    ["Ação Necessária", "Sem atualização há mais de 60 minutos"],
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);

  // Apply styles
  if (ws["A1"]) ws["A1"].s = titleStyle;
  if (ws["A2"]) ws["A2"].s = subtitleStyle;
  if (ws["A4"]) ws["A4"].s = { font: { bold: true, sz: 12 } };
  if (ws["A9"]) ws["A9"].s = { font: { bold: true, sz: 12 } };

  // Header row for table
  ["A10", "B10", "C10", "D10"].forEach((cell) => {
    if (ws[cell]) ws[cell].s = headerStyle;
  });

  // Style status cells
  for (let i = 11; i <= 11 + areas.length - 1; i++) {
    const statusCell = ws[`B${i}`];
    if (statusCell) {
      const value = statusCell.v as string;
      if (value === "Atualizado") statusCell.s = greenStyle;
      else if (value === "Verificar") statusCell.s = yellowStyle;
      else if (value === "Ação Necessária") statusCell.s = redStyle;
    }

    if (ws[`D${i}`]) ws[`D${i}`].s = { ...numberStyle, font: { color: { rgb: "22C55E" } } };
  }

  // Legend styles
  const legendStartRow = 11 + areas.length + 2;
  if (ws[`A${legendStartRow}`]) ws[`A${legendStartRow}`].s = { font: { bold: true, sz: 12 } };

  ws["!cols"] = [{ wch: 25 }, { wch: 20 }, { wch: 25 }, { wch: 20 }, { wch: 15 }];
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Monitoramento");

  // Save
  XLSX.writeFile(wb, fileName);
  return fileName;
}
