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
  yPos += 10;

  // Summary title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...darkColor);
  doc.text("Resumo Executivo", margin, yPos);
  yPos += 10;

  // Summary cards
  const cardWidth = (pageWidth - margin * 2 - 10) / 3;
  const cardHeight = 35;

  // Card 1: Total Records
  doc.setFillColor(245, 245, 250);
  doc.roundedRect(margin, yPos, cardWidth, cardHeight, 3, 3, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text("TOTAL DE REGISTROS", margin + 5, yPos + 10);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...darkColor);
  doc.text(formatNumber(summary.totalRecords), margin + 5, yPos + 25);

  // Card 2: Processed 24h
  doc.setFillColor(245, 245, 250);
  doc.roundedRect(margin + cardWidth + 5, yPos, cardWidth, cardHeight, 3, 3, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text("PROCESSADOS (24H)", margin + cardWidth + 10, yPos + 10);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...greenColor);
  doc.text(`+${formatNumber(summary.totalInserts24h)}`, margin + cardWidth + 10, yPos + 25);

  // Card 3: Status Overview
  doc.setFillColor(245, 245, 250);
  doc.roundedRect(margin + (cardWidth + 5) * 2, yPos, cardWidth, cardHeight, 3, 3, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text("SITUAÇÃO DAS ÁREAS", margin + (cardWidth + 5) * 2 + 5, yPos + 10);

  const statusY = yPos + 20;
  const statusX = margin + (cardWidth + 5) * 2 + 5;

  drawStatusIndicator(statusX + 3, statusY, "green");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...darkColor);
  doc.text(`${summary.healthyCount}`, statusX + 10, statusY + 3);

  drawStatusIndicator(statusX + 28, statusY, "yellow");
  doc.text(`${summary.warningCount}`, statusX + 35, statusY + 3);

  drawStatusIndicator(statusX + 53, statusY, "red");
  doc.text(`${summary.criticalCount}`, statusX + 60, statusY + 3);

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
    formatNumber(area.totalRecords),
    `+${formatNumber(area.recentInserts)}`,
  ]);

  autoTable(doc, {
    startY: yPos,
    head: [["Área", "Status", "Última Atualização", "Total Registros", "Processados (24h)"]],
    body: tableData,
    theme: "grid",
    styles: {
      fontSize: 9,
      cellPadding: 4,
    },
    headStyles: {
      fillColor: primaryColor,
      textColor: darkColor,
      fontStyle: "bold",
    },
    columnStyles: {
      0: { fontStyle: "bold" },
      1: { halign: "center" },
      2: { halign: "center" },
      3: { halign: "right" },
      4: { halign: "right", textColor: greenColor },
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

  yPos = (doc as any).lastAutoTable.finalY + 15;

  // PAGE 2: Detailed Areas
  doc.addPage();
  addHeader();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...darkColor);
  doc.text("Detalhamento por Área", margin, yPos);
  yPos += 12;

  for (const area of areas) {
    if (yPos > pageHeight - 70) {
      doc.addPage();
      addHeader();
    }

    // Area card
    const areaCardHeight = area.details ? 55 : 40;
    doc.setFillColor(250, 250, 252);
    doc.setDrawColor(220, 220, 230);
    doc.roundedRect(margin, yPos, pageWidth - margin * 2, areaCardHeight, 3, 3, "FD");

    // Status indicator
    drawStatusIndicator(margin + 8, yPos + 10, area.statusColor);

    // Area name
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...darkColor);
    doc.text(area.name.toUpperCase(), margin + 15, yPos + 12);

    // Status label
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...statusColors[area.statusColor]);
    doc.text(`Status: ${area.status}`, pageWidth - margin - 50, yPos + 12);

    // Description
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(area.description, margin + 15, yPos + 22);

    // Stats
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text(`Última atualização: ${formatRelativeTime(area.lastUpdate)}`, margin + 15, yPos + 32);
    doc.text(`Total de registros: ${formatNumber(area.totalRecords)}`, margin + 100, yPos + 32);
    doc.setTextColor(...greenColor);
    doc.text(`Processados (24h): +${formatNumber(area.recentInserts)}`, pageWidth - margin - 55, yPos + 32);

    // Modal breakdown for t_master_dados
    if (area.details) {
      doc.setTextColor(80, 80, 80);
      doc.setFontSize(8);
      if (area.details.air) {
        doc.text(`Operações Aéreas: ${formatNumber(area.details.air.total)} registros`, margin + 15, yPos + 45);
      }
      if (area.details.sea) {
        doc.text(`Operações Marítimas: ${formatNumber(area.details.sea.total)} registros`, margin + 100, yPos + 45);
      }
    }

    yPos += areaCardHeight + 8;
  }

  // PAGE 3: Legend
  doc.addPage();
  addHeader();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...darkColor);
  doc.text("Legenda e Observações", margin, yPos);
  yPos += 15;

  // Status legend
  const legends = [
    { color: "green" as HealthStatus, label: "Atualizado", desc: "Dados atualizados nos últimos 5 minutos. Funcionando normalmente." },
    { color: "yellow" as HealthStatus, label: "Verificar", desc: "Sem atualização entre 5 e 60 minutos. Recomenda-se verificação." },
    { color: "red" as HealthStatus, label: "Ação Necessária", desc: "Sem atualização há mais de 60 minutos. Possível problema de sincronização." },
  ];

  for (const legend of legends) {
    drawStatusIndicator(margin + 5, yPos, legend.color);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...darkColor);
    doc.text(legend.label, margin + 12, yPos + 3);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(legend.desc, margin + 12, yPos + 12);
    yPos += 22;
  }

  yPos += 15;

  // Additional info
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...darkColor);
  doc.text("Informações Adicionais", margin, yPos);
  yPos += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  const infoLines = [
    "• Os dados são atualizados automaticamente a cada sincronização com os sistemas operacionais.",
    "• A coluna 'Processados (24h)' mostra o volume de novos registros nas últimas 24 horas.",
    "• Em caso de status 'Ação Necessária', entre em contato com a equipe técnica.",
    "",
    "Suporte Técnico: z3us.ai@dachser.com",
  ];

  for (const line of infoLines) {
    doc.text(line, margin, yPos);
    yPos += 6;
  }

  // Add footers to all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addFooter(i, totalPages);
  }

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

  // Sheet 1: Resumo Executivo
  const summaryData = [
    ["RELATÓRIO DE MONITORAMENTO DE DADOS - DACHSER"],
    [`Gerado em: ${format(now, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`],
    [],
    ["RESUMO EXECUTIVO"],
    [],
    ["Indicador", "Valor"],
    ["Total de Registros", summary.totalRecords],
    ["Áreas Monitoradas", summary.areasCount],
    ["Áreas Atualizadas (Verde)", summary.healthyCount],
    ["Áreas em Verificação (Amarelo)", summary.warningCount],
    ["Áreas Críticas (Vermelho)", summary.criticalCount],
    ["Registros Processados (24h)", summary.totalInserts24h],
  ];

  const ws1 = XLSX.utils.aoa_to_sheet(summaryData);

  // Apply styles
  ws1["A1"].s = titleStyle;
  ws1["A2"].s = subtitleStyle;
  ws1["A4"].s = { font: { bold: true, sz: 12 } };
  ws1["A6"].s = headerStyle;
  ws1["B6"].s = headerStyle;

  // Number formatting
  for (let i = 7; i <= 12; i++) {
    if (ws1[`B${i}`]) {
      ws1[`B${i}`].s = numberStyle;
    }
  }

  ws1["!cols"] = [{ wch: 35 }, { wch: 20 }];
  ws1["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 1 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 1 } },
  ];

  XLSX.utils.book_append_sheet(wb, ws1, "Resumo Executivo");

  // Sheet 2: Situação por Área
  const areaData = [
    ["SITUAÇÃO POR ÁREA"],
    [`Atualizado em: ${format(now, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`],
    [],
    ["Área", "Status", "Última Atualização", "Total Registros", "Processados (24h)", "Sistemas"],
    ...areas.map((area) => [
      area.name,
      area.status,
      area.lastUpdateFormatted,
      area.totalRecords,
      area.recentInserts,
      area.applications.join(", "),
    ]),
  ];

  const ws2 = XLSX.utils.aoa_to_sheet(areaData);

  ws2["A1"].s = titleStyle;
  ws2["A2"].s = subtitleStyle;

  // Header row
  ["A4", "B4", "C4", "D4", "E4", "F4"].forEach((cell) => {
    if (ws2[cell]) ws2[cell].s = headerStyle;
  });

  // Style status cells and numbers
  for (let i = 5; i <= 5 + areas.length - 1; i++) {
    const statusCell = ws2[`B${i}`];
    if (statusCell) {
      const value = statusCell.v as string;
      if (value === "Atualizado") statusCell.s = greenStyle;
      else if (value === "Verificar") statusCell.s = yellowStyle;
      else if (value === "Ação Necessária") statusCell.s = redStyle;
    }

    if (ws2[`D${i}`]) ws2[`D${i}`].s = numberStyle;
    if (ws2[`E${i}`]) ws2[`E${i}`].s = { ...numberStyle, font: { color: { rgb: "22C55E" } } };
  }

  ws2["!cols"] = [{ wch: 25 }, { wch: 18 }, { wch: 25 }, { wch: 18 }, { wch: 18 }, { wch: 40 }];
  ws2["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } },
  ];

  XLSX.utils.book_append_sheet(wb, ws2, "Situação por Área");

  // Sheet 3: Operações Detalhadas (for t_master_dados)
  const masterArea = areas.find((a) => a.technicalName === "t_master_dados");
  if (masterArea?.details) {
    const detailData = [
      ["DETALHAMENTO DE OPERAÇÕES"],
      [`Atualizado em: ${format(now, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`],
      [],
      ["OPERAÇÕES AÉREAS"],
      ["Tipo", "Total de Registros"],
    ];

    if (masterArea.details.air?.breakdown) {
      Object.entries(masterArea.details.air.breakdown).forEach(([tipo, count]) => {
        detailData.push([tipo, String(count)]);
      });
    }
    detailData.push(["Total Aéreo", String(masterArea.details.air?.total || 0)]);

    detailData.push([]);
    detailData.push(["OPERAÇÕES MARÍTIMAS"]);
    detailData.push(["Tipo", "Total de Registros"]);

    if (masterArea.details.sea?.breakdown) {
      Object.entries(masterArea.details.sea.breakdown).forEach(([tipo, count]) => {
        detailData.push([tipo, String(count)]);
      });
    }
    detailData.push(["Total Marítimo", String(masterArea.details.sea?.total || 0)]);

    const ws3 = XLSX.utils.aoa_to_sheet(detailData);

    ws3["A1"].s = titleStyle;
    ws3["A2"].s = subtitleStyle;
    ws3["A4"].s = { font: { bold: true, sz: 11 } };

    ws3["!cols"] = [{ wch: 25 }, { wch: 20 }];

    XLSX.utils.book_append_sheet(wb, ws3, "Operações Detalhadas");
  }

  // Save
  XLSX.writeFile(wb, fileName);
  return fileName;
}
