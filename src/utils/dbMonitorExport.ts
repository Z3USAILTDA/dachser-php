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
    description: "Processos de importação e exportação (aéreo e marítimo) - CCT, Tracking, Olimpo",
  },
  t_dados_financeiro_nfs: {
    name: "Notas Fiscais",
    description: "Dados de faturamento para régua de cobrança automática",
  },
  t_dados_financeiro_voucher: {
    name: "Vouchers/SPO",
    description: "Solicitações de pagamento e despesas operacionais",
  },
  tbaixas: {
    name: "Baixas Financeiras",
    description: "Comprovantes de pagamento processados pelo robô financeiro",
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

// PDF Export via HTML/CSS
export function exportDbMonitorPDF(stats: DatabaseStats): string {
  const { areas, summary } = transformToExportable(stats);
  const now = new Date();
  const fileName = `relatorio-monitoramento-${format(now, "yyyy-MM-dd-HHmm")}.pdf`;
  const dateFormatted = format(now, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });

  // Helper to get status badge class
  const getStatusBadgeClass = (color: HealthStatus): string => {
    switch (color) {
      case "green": return "status-green";
      case "yellow": return "status-yellow";
      case "red": return "status-red";
    }
  };

  // Generate area cards HTML
  const areaCardsHTML = areas.map((area) => `
    <div class="area-card">
      <div class="area-info">
        <div class="area-name">${area.name}</div>
        <div class="area-update">Última atualização: ${formatRelativeTime(area.lastUpdate)}</div>
      </div>
      <div class="area-right">
        <div class="status-badge ${getStatusBadgeClass(area.statusColor)}">${area.status}</div>
        <div class="area-inserts">+${formatNumber(area.recentInserts)} processados</div>
      </div>
    </div>
  `).join("");

  // Generate descriptions HTML
  const descriptionsHTML = areas.map((area) => `
    <div class="desc-item">
      <span class="desc-name">• ${area.name}:</span>
      <span class="desc-text">${area.description}</span>
    </div>
  `).join("");

  // Open print window
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    throw new Error("Permita pop-ups para gerar o PDF");
  }

  // Write HTML document
  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Relatório de Monitoramento - DACHSER</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body { 
            font-family: 'Segoe UI', Arial, sans-serif; 
            padding: 0;
            color: #333;
            background: #fff;
            line-height: 1.5;
          }
          
          .page {
            max-width: 800px;
            margin: 0 auto;
            padding: 40px;
          }
          
          /* Header */
          .header { 
            background: #FFC800; 
            color: #1E1E23;
            padding: 25px 40px;
            margin: 0 0 30px 0;
          }
          
          .header-title {
            font-size: 22px;
            font-weight: bold;
            margin-bottom: 5px;
          }
          
          .header-subtitle {
            font-size: 14px;
            opacity: 0.8;
          }
          
          .header-date {
            font-size: 12px;
            margin-top: 8px;
            opacity: 0.7;
          }
          
          /* Section Title */
          .section-title {
            font-weight: bold;
            font-size: 14px;
            margin: 30px 0 15px 0;
            background: #f3f4f6;
            padding: 12px 15px;
            border-left: 4px solid #FFC800;
            color: #1E1E23;
          }
          
          /* Summary Cards */
          .summary-grid {
            display: flex;
            gap: 20px;
            margin-bottom: 10px;
          }
          
          .summary-card {
            flex: 1;
            background: #f9fafb;
            border: 1px solid #e5e7eb;
            border-radius: 10px;
            padding: 20px;
          }
          
          .summary-label {
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #6b7280;
            margin-bottom: 8px;
          }
          
          .summary-value {
            font-size: 28px;
            font-weight: bold;
            color: #22c55e;
          }
          
          .status-list {
            margin-top: 5px;
          }
          
          .status-row {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 4px 0;
            font-size: 14px;
          }
          
          .status-dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
          }
          
          .dot-green { background: #22c55e; }
          .dot-yellow { background: #f59e0b; }
          .dot-red { background: #ef4444; }
          
          /* Area Cards */
          .area-card {
            border: 1px solid #e5e7eb;
            border-radius: 10px;
            padding: 18px 20px;
            margin-bottom: 12px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #fff;
          }
          
          .area-info {
            flex: 1;
          }
          
          .area-name {
            font-weight: 600;
            font-size: 15px;
            color: #1E1E23;
            margin-bottom: 4px;
          }
          
          .area-update {
            font-size: 13px;
            color: #6b7280;
          }
          
          .area-right {
            text-align: right;
          }
          
          .area-inserts {
            font-size: 13px;
            color: #22c55e;
            font-weight: 500;
            margin-top: 6px;
          }
          
          /* Status Badges */
          .status-badge {
            display: inline-block;
            padding: 5px 14px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
          }
          
          .status-green { 
            background: #dcfce7; 
            color: #166534; 
          }
          .status-yellow { 
            background: #fef3c7; 
            color: #92400e; 
          }
          .status-red { 
            background: #fee2e2; 
            color: #991b1b; 
          }
          
          /* Description Section */
          .desc-item {
            padding: 8px 0;
            font-size: 13px;
            border-bottom: 1px solid #f3f4f6;
          }
          
          .desc-item:last-child {
            border-bottom: none;
          }
          
          .desc-name {
            font-weight: 600;
            color: #1E1E23;
          }
          
          .desc-text {
            color: #6b7280;
          }
          
          /* Legend Section */
          .legend-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 10px 0;
            font-size: 13px;
          }
          
          .legend-label {
            font-weight: 600;
            min-width: 120px;
          }
          
          .legend-desc {
            color: #6b7280;
          }
          
          /* Footer */
          .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            text-align: center;
            font-size: 11px;
            color: #9ca3af;
          }
          
          /* Print Styles */
          @media print {
            body { 
              padding: 0; 
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .page {
              padding: 20px 30px;
            }
            .header {
              margin: -20px -30px 25px -30px;
              padding: 20px 30px;
            }
            .area-card, .summary-card {
              break-inside: avoid;
              page-break-inside: avoid;
            }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="header-title">RELATÓRIO DE MONITORAMENTO DE DADOS</div>
          <div class="header-subtitle">Sistema Z3US.AI - DACHSER</div>
          <div class="header-date">Gerado em: ${dateFormatted}</div>
        </div>
        
        <div class="page">
          <div class="section-title">RESUMO EXECUTIVO</div>
          
          <div class="summary-grid">
            <div class="summary-card">
              <div class="summary-label">Processados nas últimas 24h</div>
              <div class="summary-value">+${formatNumber(summary.totalInserts24h)}</div>
            </div>
            
            <div class="summary-card">
              <div class="summary-label">Situação das Áreas</div>
              <div class="status-list">
                <div class="status-row">
                  <div class="status-dot dot-green"></div>
                  <span>${summary.healthyCount} OK</span>
                </div>
                <div class="status-row">
                  <div class="status-dot dot-yellow"></div>
                  <span>${summary.warningCount} Atenção</span>
                </div>
                <div class="status-row">
                  <div class="status-dot dot-red"></div>
                  <span>${summary.criticalCount} Crítico</span>
                </div>
              </div>
            </div>
          </div>
          
          <div class="section-title">SITUAÇÃO POR ÁREA</div>
          ${areaCardsHTML}
          
          <div class="section-title">O QUE CADA ÁREA REPRESENTA</div>
          ${descriptionsHTML}
          
          <div class="section-title">LEGENDA DE STATUS</div>
          <div class="legend-item">
            <div class="status-dot dot-green"></div>
            <span class="legend-label">Atualizado</span>
            <span class="legend-desc">Dados recebidos nos últimos 5 minutos</span>
          </div>
          <div class="legend-item">
            <div class="status-dot dot-yellow"></div>
            <span class="legend-label">Verificar</span>
            <span class="legend-desc">Sem atualização entre 5 e 60 minutos</span>
          </div>
          <div class="legend-item">
            <div class="status-dot dot-red"></div>
            <span class="legend-label">Ação Necessária</span>
            <span class="legend-desc">Sem atualização há mais de 60 minutos</span>
          </div>
          
          <div class="footer">
            Sistema Z3US.AI • Monitoramento de Dados • DACHSER
          </div>
        </div>
      </body>
    </html>
  `);

  printWindow.document.close();
  printWindow.focus();

  // Print after rendering
  setTimeout(() => {
    printWindow.print();
  }, 300);

  return fileName;
}

// Excel Export - Enhanced Visual Design
export function exportDbMonitorExcel(stats: DatabaseStats): string {
  const { areas, summary } = transformToExportable(stats);
  const now = new Date();
  const fileName = `relatorio-monitoramento-${format(now, "yyyy-MM-dd-HHmm")}.xlsx`;

  const wb = XLSX.utils.book_new();

  // ===== STYLES =====
  const dachserYellow = "FFC800";
  const darkText = "1E1E23";
  const grayBg = "F3F4F6";
  const lightGrayBg = "F9FAFB";
  const borderColor = "E5E7EB";
  
  const headerBannerStyle = {
    font: { bold: true, sz: 18, color: { rgb: darkText } },
    fill: { fgColor: { rgb: dachserYellow } },
    alignment: { horizontal: "left", vertical: "center" },
  };
  
  const headerSubtitleStyle = {
    font: { sz: 11, color: { rgb: "666666" } },
    fill: { fgColor: { rgb: dachserYellow } },
    alignment: { horizontal: "left", vertical: "center" },
  };
  
  const sectionTitleStyle = {
    font: { bold: true, sz: 12, color: { rgb: darkText } },
    fill: { fgColor: { rgb: grayBg } },
    alignment: { horizontal: "left", vertical: "center" },
    border: {
      left: { style: "thick", color: { rgb: dachserYellow } },
    },
  };
  
  const tableHeaderStyle = {
    font: { bold: true, sz: 10, color: { rgb: "FFFFFF" } },
    fill: { fgColor: { rgb: "374151" } },
    alignment: { horizontal: "center", vertical: "center" },
    border: {
      top: { style: "thin", color: { rgb: borderColor } },
      bottom: { style: "thin", color: { rgb: borderColor } },
      left: { style: "thin", color: { rgb: borderColor } },
      right: { style: "thin", color: { rgb: borderColor } },
    },
  };
  
  const cellStyle = {
    font: { sz: 10, color: { rgb: darkText } },
    alignment: { horizontal: "left", vertical: "center" },
    border: {
      top: { style: "thin", color: { rgb: borderColor } },
      bottom: { style: "thin", color: { rgb: borderColor } },
      left: { style: "thin", color: { rgb: borderColor } },
      right: { style: "thin", color: { rgb: borderColor } },
    },
  };
  
  const summaryCardStyle = {
    font: { sz: 10, color: { rgb: "6B7280" } },
    fill: { fgColor: { rgb: lightGrayBg } },
    alignment: { horizontal: "left", vertical: "center" },
    border: {
      top: { style: "thin", color: { rgb: borderColor } },
      bottom: { style: "thin", color: { rgb: borderColor } },
      left: { style: "thin", color: { rgb: borderColor } },
      right: { style: "thin", color: { rgb: borderColor } },
    },
  };
  
  const summaryValueStyle = {
    font: { bold: true, sz: 16, color: { rgb: "22C55E" } },
    fill: { fgColor: { rgb: lightGrayBg } },
    alignment: { horizontal: "left", vertical: "center" },
    border: {
      top: { style: "thin", color: { rgb: borderColor } },
      bottom: { style: "thin", color: { rgb: borderColor } },
      left: { style: "thin", color: { rgb: borderColor } },
      right: { style: "thin", color: { rgb: borderColor } },
    },
  };
  
  const statusGreenStyle = {
    font: { bold: true, sz: 10, color: { rgb: "166534" } },
    fill: { fgColor: { rgb: "DCFCE7" } },
    alignment: { horizontal: "center", vertical: "center" },
    border: {
      top: { style: "thin", color: { rgb: borderColor } },
      bottom: { style: "thin", color: { rgb: borderColor } },
      left: { style: "thin", color: { rgb: borderColor } },
      right: { style: "thin", color: { rgb: borderColor } },
    },
  };
  
  const statusYellowStyle = {
    font: { bold: true, sz: 10, color: { rgb: "92400E" } },
    fill: { fgColor: { rgb: "FEF3C7" } },
    alignment: { horizontal: "center", vertical: "center" },
    border: {
      top: { style: "thin", color: { rgb: borderColor } },
      bottom: { style: "thin", color: { rgb: borderColor } },
      left: { style: "thin", color: { rgb: borderColor } },
      right: { style: "thin", color: { rgb: borderColor } },
    },
  };
  
  const statusRedStyle = {
    font: { bold: true, sz: 10, color: { rgb: "991B1B" } },
    fill: { fgColor: { rgb: "FEE2E2" } },
    alignment: { horizontal: "center", vertical: "center" },
    border: {
      top: { style: "thin", color: { rgb: borderColor } },
      bottom: { style: "thin", color: { rgb: borderColor } },
      left: { style: "thin", color: { rgb: borderColor } },
      right: { style: "thin", color: { rgb: borderColor } },
    },
  };
  
  const insertsStyle = {
    font: { bold: true, sz: 10, color: { rgb: "22C55E" } },
    alignment: { horizontal: "right", vertical: "center" },
    border: {
      top: { style: "thin", color: { rgb: borderColor } },
      bottom: { style: "thin", color: { rgb: borderColor } },
      left: { style: "thin", color: { rgb: borderColor } },
      right: { style: "thin", color: { rgb: borderColor } },
    },
  };
  
  const legendLabelStyle = {
    font: { bold: true, sz: 10, color: { rgb: darkText } },
    alignment: { horizontal: "left", vertical: "center" },
  };
  
  const legendDescStyle = {
    font: { sz: 10, color: { rgb: "6B7280" } },
    alignment: { horizontal: "left", vertical: "center" },
  };

  // ===== BUILD DATA =====
  const data: (string | number)[][] = [
    // Header Banner (rows 1-2)
    ["RELATÓRIO DE MONITORAMENTO DE DADOS", "", "", "", ""],
    [`Sistema Z3US.AI - DACHSER  •  Gerado em: ${format(now, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`, "", "", "", ""],
    // Empty row
    ["", "", "", "", ""],
    // Summary Section Title (row 4)
    ["  RESUMO EXECUTIVO", "", "", "", ""],
    // Empty row
    ["", "", "", "", ""],
    // Summary Cards (rows 6-7)
    ["Processados nas últimas 24h", "", "Situação das Áreas", "", ""],
    [`+${formatNumber(summary.totalInserts24h)}`, "", `${summary.healthyCount} OK  •  ${summary.warningCount} Atenção  •  ${summary.criticalCount} Crítico`, "", ""],
    // Empty row
    ["", "", "", "", ""],
    // Areas Section Title (row 9)
    ["  SITUAÇÃO POR ÁREA", "", "", "", ""],
    // Table Header (row 10)
    ["Área", "Status", "Última Atualização", "Processados (24h)", ""],
    // Area rows (rows 11-14)
    ...areas.map((area) => [
      area.name,
      area.status,
      area.lastUpdateFormatted,
      `+${formatNumber(area.recentInserts)}`,
      "",
    ]),
    // Empty row
    ["", "", "", "", ""],
    // Description Section Title
    ["  O QUE CADA ÁREA REPRESENTA", "", "", "", ""],
    // Descriptions
    ...areas.map((area) => [
      `• ${area.name}`,
      area.description,
      "",
      "",
      "",
    ]),
    // Empty row
    ["", "", "", "", ""],
    // Legend Section Title
    ["  LEGENDA DE STATUS", "", "", "", ""],
    // Legend items
    ["Atualizado", "Dados recebidos nos últimos 5 minutos", "", "", ""],
    ["Verificar", "Sem atualização entre 5 e 60 minutos", "", "", ""],
    ["Ação Necessária", "Sem atualização há mais de 60 minutos", "", "", ""],
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);

  // ===== APPLY STYLES =====
  
  // Header banner (rows 1-2)
  ["A1", "B1", "C1", "D1", "E1"].forEach(cell => { if (ws[cell]) ws[cell].s = headerBannerStyle; });
  ["A2", "B2", "C2", "D2", "E2"].forEach(cell => { if (ws[cell]) ws[cell].s = headerSubtitleStyle; });
  
  // Summary section title (row 4)
  ["A4", "B4", "C4", "D4", "E4"].forEach(cell => { if (ws[cell]) ws[cell].s = sectionTitleStyle; });
  
  // Summary cards (rows 6-7)
  ["A6", "B6"].forEach(cell => { if (ws[cell]) ws[cell].s = summaryCardStyle; });
  ["C6", "D6"].forEach(cell => { if (ws[cell]) ws[cell].s = summaryCardStyle; });
  if (ws["A7"]) ws["A7"].s = summaryValueStyle;
  if (ws["C7"]) ws["C7"].s = { ...summaryCardStyle, font: { sz: 11, color: { rgb: darkText } } };
  
  // Areas section title (row 9)
  ["A9", "B9", "C9", "D9", "E9"].forEach(cell => { if (ws[cell]) ws[cell].s = sectionTitleStyle; });
  
  // Table header (row 10)
  ["A10", "B10", "C10", "D10"].forEach(cell => { if (ws[cell]) ws[cell].s = tableHeaderStyle; });
  
  // Area rows (rows 11-14)
  const areaStartRow = 11;
  for (let i = 0; i < areas.length; i++) {
    const row = areaStartRow + i;
    const area = areas[i];
    
    // Area name
    if (ws[`A${row}`]) ws[`A${row}`].s = { ...cellStyle, font: { bold: true, sz: 10, color: { rgb: darkText } } };
    
    // Status with colored background
    if (ws[`B${row}`]) {
      if (area.statusColor === "green") ws[`B${row}`].s = statusGreenStyle;
      else if (area.statusColor === "yellow") ws[`B${row}`].s = statusYellowStyle;
      else ws[`B${row}`].s = statusRedStyle;
    }
    
    // Last update
    if (ws[`C${row}`]) ws[`C${row}`].s = cellStyle;
    
    // Inserts
    if (ws[`D${row}`]) ws[`D${row}`].s = insertsStyle;
  }
  
  // Description section title
  const descTitleRow = areaStartRow + areas.length + 1;
  ["A", "B", "C", "D", "E"].forEach(col => {
    const cell = `${col}${descTitleRow}`;
    if (ws[cell]) ws[cell].s = sectionTitleStyle;
  });
  
  // Description rows
  const descStartRow = descTitleRow + 1;
  for (let i = 0; i < areas.length; i++) {
    const row = descStartRow + i;
    if (ws[`A${row}`]) ws[`A${row}`].s = legendLabelStyle;
    if (ws[`B${row}`]) ws[`B${row}`].s = legendDescStyle;
  }
  
  // Legend section title
  const legendTitleRow = descStartRow + areas.length + 1;
  ["A", "B", "C", "D", "E"].forEach(col => {
    const cell = `${col}${legendTitleRow}`;
    if (ws[cell]) ws[cell].s = sectionTitleStyle;
  });
  
  // Legend rows
  const legendStartRow = legendTitleRow + 1;
  for (let i = 0; i < 3; i++) {
    const row = legendStartRow + i;
    if (ws[`A${row}`]) {
      if (i === 0) ws[`A${row}`].s = { ...legendLabelStyle, font: { bold: true, sz: 10, color: { rgb: "166534" } } };
      else if (i === 1) ws[`A${row}`].s = { ...legendLabelStyle, font: { bold: true, sz: 10, color: { rgb: "92400E" } } };
      else ws[`A${row}`].s = { ...legendLabelStyle, font: { bold: true, sz: 10, color: { rgb: "991B1B" } } };
    }
    if (ws[`B${row}`]) ws[`B${row}`].s = legendDescStyle;
  }

  // ===== COLUMN WIDTHS =====
  ws["!cols"] = [
    { wch: 28 },  // A - Area names
    { wch: 45 },  // B - Status/Description
    { wch: 25 },  // C - Last update
    { wch: 18 },  // D - Inserts
    { wch: 5 },   // E - Spacer
  ];
  
  // ===== ROW HEIGHTS =====
  ws["!rows"] = [
    { hpt: 35 },  // Row 1 - Header
    { hpt: 22 },  // Row 2 - Subtitle
    { hpt: 15 },  // Row 3 - Empty
    { hpt: 28 },  // Row 4 - Section title
    { hpt: 10 },  // Row 5 - Empty
    { hpt: 20 },  // Row 6 - Summary label
    { hpt: 28 },  // Row 7 - Summary value
  ];

  // ===== MERGES =====
  ws["!merges"] = [
    // Header banner
    { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },
    // Section titles
    { s: { r: 3, c: 0 }, e: { r: 3, c: 4 } },
    { s: { r: 8, c: 0 }, e: { r: 8, c: 4 } },
    // Summary cards
    { s: { r: 5, c: 0 }, e: { r: 5, c: 1 } },
    { s: { r: 6, c: 0 }, e: { r: 6, c: 1 } },
    { s: { r: 5, c: 2 }, e: { r: 5, c: 4 } },
    { s: { r: 6, c: 2 }, e: { r: 6, c: 4 } },
    // Description section title
    { s: { r: descTitleRow - 1, c: 0 }, e: { r: descTitleRow - 1, c: 4 } },
    // Legend section title
    { s: { r: legendTitleRow - 1, c: 0 }, e: { r: legendTitleRow - 1, c: 4 } },
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Monitoramento");

  // Save
  XLSX.writeFile(wb, fileName);
  return fileName;
}
