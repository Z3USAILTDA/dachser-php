import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DemurrageContainer, PreInvoice, PreInvoiceItem } from "@/hooks/useDemurrageData";

const formatCurrency = (value: number | undefined): string => {
  if (value === undefined || value === null || value === 0) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(value);
};

const formatCurrencyBRL = (value: number | undefined): string => {
  if (value === undefined || value === null || value === 0) return "-";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(value);
};

const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return "-";
  try {
    return format(new Date(dateStr), "dd/MM/yyyy", { locale: ptBR });
  } catch {
    return dateStr;
  }
};

const getRiskLabel = (status: string): string => {
  switch (status) {
    case "safe": return "OK";
    case "at_risk": return "Em Risco";
    case "critical": return "Crítico";
    case "exceeded": return "Excedido";
    default: return "Pendente";
  }
};

export const exportDemurrageReportPDF = (data: DemurrageContainer[]) => {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  // Header
  doc.setFillColor(255, 200, 0); // Dachser Yellow
  doc.rect(0, 0, doc.internal.pageSize.width, 30, "F");

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("DACHSER - Relatório de Demurrage", 15, 14);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(
    `Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`,
    15,
    22
  );

  doc.text(`Total de Containers: ${data.length}`, 200, 14);
  
  const totalDemurrage = data.reduce((sum, c) => sum + (c.expected_cost_usd || 0), 0);
  doc.text(`Demurrage Total: ${formatCurrency(totalDemurrage)}`, 200, 22);

  // Main Table
  const tableData = data.map((c) => [
    c.numero,
    c.mbl,
    c.cliente || "-",
    c.armador || "-",
    c.tipo_conteiner || "-",
    c.free_time_days.toString(),
    c.days_remaining !== null ? c.days_remaining.toString() : "-",
    c.excedente_dias > 0 ? c.excedente_dias.toString() : "-",
    getRiskLabel(c.risk_status),
    formatCurrency(c.expected_cost_usd),
    formatDate(c.eta),
  ]);

  autoTable(doc, {
    startY: 35,
    head: [[
      "Container",
      "MBL",
      "Cliente",
      "Armador",
      "Tipo",
      "FT (dias)",
      "Restantes",
      "Excedidos",
      "Status",
      "Demurrage",
      "ETA",
    ]],
    body: tableData,
    theme: "grid",
    headStyles: {
      fillColor: [255, 200, 0],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      fontSize: 8,
      halign: "center",
    },
    bodyStyles: {
      fontSize: 7,
      cellPadding: 2,
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245],
    },
    columnStyles: {
      0: { cellWidth: 22, fontStyle: "bold", halign: "center" },
      1: { cellWidth: 28 },
      2: { cellWidth: 35 },
      3: { cellWidth: 20 },
      4: { cellWidth: 18, halign: "center" },
      5: { cellWidth: 15, halign: "center" },
      6: { cellWidth: 18, halign: "center" },
      7: { cellWidth: 18, halign: "center" },
      8: { cellWidth: 20, halign: "center" },
      9: { cellWidth: 25, halign: "right" },
      10: { cellWidth: 22, halign: "center" },
    },
    didParseCell: (cellData) => {
      if (cellData.section === "body") {
        const rowIndex = cellData.row.index;
        const container = data[rowIndex];
        
        // Color code based on risk
        if (container?.risk_status === "exceeded" || container?.risk_status === "critical") {
          cellData.cell.styles.fillColor = [255, 205, 210]; // Red light
        } else if (container?.risk_status === "at_risk") {
          cellData.cell.styles.fillColor = [255, 249, 196]; // Yellow light
        } else if (container?.risk_status === "safe") {
          cellData.cell.styles.fillColor = [200, 230, 201]; // Green light
        }
      }
    },
    didDrawPage: (pageData) => {
      const pageCount = doc.getNumberOfPages();
      const pageSize = doc.internal.pageSize;
      const pageHeight = pageSize.height || pageSize.getHeight();

      doc.setFontSize(8);
      doc.setTextColor(128, 128, 128);
      doc.text(
        `Página ${pageData.pageNumber} de ${pageCount}`,
        pageSize.width / 2,
        pageHeight - 8,
        { align: "center" }
      );

      doc.text(
        "Sistema Z3US.AI - Módulo Demurrage",
        pageSize.width - 15,
        pageHeight - 8,
        { align: "right" }
      );
    },
    margin: { top: 35, right: 10, bottom: 15, left: 10 },
  });

  // Summary Page
  doc.addPage();

  doc.setFillColor(255, 200, 0);
  doc.rect(0, 0, doc.internal.pageSize.width, 25, "F");

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Resumo Gerencial", 15, 15);

  let y = 40;

  // Stats
  const stats = {
    total: data.length,
    safe: data.filter(c => c.risk_status === "safe").length,
    atRisk: data.filter(c => c.risk_status === "at_risk").length,
    critical: data.filter(c => c.risk_status === "critical").length,
    exceeded: data.filter(c => c.risk_status === "exceeded").length,
    totalDemurrage: data.reduce((sum, c) => sum + (c.expected_cost_usd || 0), 0),
    avgDaysExceeded: data.filter(c => c.excedente_dias > 0).length > 0
      ? (data.filter(c => c.excedente_dias > 0).reduce((sum, c) => sum + c.excedente_dias, 0) / data.filter(c => c.excedente_dias > 0).length).toFixed(1)
      : "0",
  };

  // KPI Cards simulation
  const kpiY = y;
  const kpiWidth = 55;
  const kpiHeight = 35;
  const kpiGap = 10;

  // Total Containers
  doc.setFillColor(240, 240, 240);
  doc.roundedRect(15, kpiY, kpiWidth, kpiHeight, 3, 3, "F");
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Total Containers", 15 + kpiWidth/2, kpiY + 10, { align: "center" });
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text(stats.total.toString(), 15 + kpiWidth/2, kpiY + 25, { align: "center" });

  // Demurrage Total
  doc.setFillColor(255, 248, 220);
  doc.roundedRect(15 + kpiWidth + kpiGap, kpiY, kpiWidth, kpiHeight, 3, 3, "F");
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Demurrage Total", 15 + kpiWidth + kpiGap + kpiWidth/2, kpiY + 10, { align: "center" });
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(formatCurrency(stats.totalDemurrage), 15 + kpiWidth + kpiGap + kpiWidth/2, kpiY + 25, { align: "center" });

  // Em Alerta
  doc.setFillColor(255, 235, 235);
  doc.roundedRect(15 + (kpiWidth + kpiGap) * 2, kpiY, kpiWidth, kpiHeight, 3, 3, "F");
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Em Alerta", 15 + (kpiWidth + kpiGap) * 2 + kpiWidth/2, kpiY + 10, { align: "center" });
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(200, 0, 0);
  doc.text((stats.atRisk + stats.critical + stats.exceeded).toString(), 15 + (kpiWidth + kpiGap) * 2 + kpiWidth/2, kpiY + 25, { align: "center" });
  doc.setTextColor(0, 0, 0);

  // Média Dias Excedidos
  doc.setFillColor(240, 240, 240);
  doc.roundedRect(15 + (kpiWidth + kpiGap) * 3, kpiY, kpiWidth, kpiHeight, 3, 3, "F");
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Média Dias Exc.", 15 + (kpiWidth + kpiGap) * 3 + kpiWidth/2, kpiY + 10, { align: "center" });
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text(stats.avgDaysExceeded, 15 + (kpiWidth + kpiGap) * 3 + kpiWidth/2, kpiY + 25, { align: "center" });

  y = kpiY + kpiHeight + 20;

  // Status Distribution
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Distribuição por Status", 15, y);
  y += 10;

  const statusData = [
    { label: "OK (dentro do free time)", value: stats.safe, color: [34, 197, 94] },
    { label: "Em Risco (próximo do vencimento)", value: stats.atRisk, color: [234, 179, 8] },
    { label: "Crítico (vencendo)", value: stats.critical, color: [249, 115, 22] },
    { label: "Excedido (gerando demurrage)", value: stats.exceeded, color: [239, 68, 68] },
  ];

  statusData.forEach((item, i) => {
    doc.setFillColor(item.color[0], item.color[1], item.color[2]);
    doc.rect(20, y + (i * 12), 8, 8, "F");
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`${item.label}: ${item.value}`, 32, y + (i * 12) + 6);
  });

  y += statusData.length * 12 + 15;

  // Top 5 Clients
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Top 5 Clientes por Demurrage", 15, y);
  y += 5;

  const clientMap = new Map<string, number>();
  data.forEach(c => {
    const client = c.cliente || "Sem cliente";
    clientMap.set(client, (clientMap.get(client) || 0) + (c.expected_cost_usd || 0));
  });

  const topClients = Array.from(clientMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  autoTable(doc, {
    startY: y,
    head: [["Cliente", "Demurrage (USD)"]],
    body: topClients.map(([client, value]) => [client, formatCurrency(value)]),
    theme: "striped",
    headStyles: {
      fillColor: [255, 200, 0],
      textColor: [0, 0, 0],
      fontStyle: "bold",
    },
    columnStyles: {
      0: { cellWidth: 100 },
      1: { cellWidth: 50, halign: "right" },
    },
    margin: { left: 15 },
  });

  // Top 5 Carriers
  const finalY = (doc as any).lastAutoTable.finalY + 15;

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Top 5 Armadores por Demurrage", 15, finalY);

  const carrierMap = new Map<string, number>();
  data.forEach(c => {
    const carrier = c.armador || "Não informado";
    carrierMap.set(carrier, (carrierMap.get(carrier) || 0) + (c.expected_cost_usd || 0));
  });

  const topCarriers = Array.from(carrierMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  autoTable(doc, {
    startY: finalY + 5,
    head: [["Armador", "Demurrage (USD)"]],
    body: topCarriers.map(([carrier, value]) => [carrier, formatCurrency(value)]),
    theme: "striped",
    headStyles: {
      fillColor: [255, 200, 0],
      textColor: [0, 0, 0],
      fontStyle: "bold",
    },
    columnStyles: {
      0: { cellWidth: 100 },
      1: { cellWidth: 50, halign: "right" },
    },
    margin: { left: 15 },
  });

  // Save
  const fileName = `demurrage_report_${format(new Date(), "yyyy-MM-dd_HH-mm")}.pdf`;
  doc.save(fileName);

  return fileName;
};

// =====================================================
// PRE-INVOICE PDF EXPORT
// =====================================================

export const exportPreInvoicePDF = (
  preInvoice: PreInvoice, 
  items: PreInvoiceItem[]
) => {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.width;

  // Header with Dachser branding
  doc.setFillColor(255, 200, 0);
  doc.rect(0, 0, pageWidth, 35, "F");

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("PRÉ-FATURA DE DEMURRAGE", pageWidth / 2, 15, { align: "center" });

  doc.setFontSize(14);
  doc.setFont("helvetica", "normal");
  doc.text(preInvoice.invoice_number, pageWidth / 2, 25, { align: "center" });

  doc.setFontSize(10);
  doc.text(`Emissão: ${formatDate(preInvoice.issue_date)}`, pageWidth / 2, 32, { align: "center" });

  // Invoice Details Box
  let y = 45;

  doc.setFillColor(245, 245, 245);
  doc.roundedRect(15, y, pageWidth - 30, 45, 3, 3, "F");

  doc.setTextColor(80, 80, 80);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");

  // Left column
  doc.text("Cliente:", 20, y + 10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(preInvoice.client_name || "-", 45, y + 10);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  doc.text("MBL:", 20, y + 18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(preInvoice.shipment_mbl || "-", 45, y + 18);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  doc.text("Navio:", 20, y + 26);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(preInvoice.vessel_name || "-", 45, y + 26);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  doc.text("Viagem:", 20, y + 34);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(preInvoice.voyage_number || "-", 45, y + 34);

  // Right column
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  doc.text("BL:", 110, y + 10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(preInvoice.bl_number || "-", 130, y + 10);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  doc.text("Origem:", 110, y + 18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(preInvoice.origin_port || "-", 130, y + 18);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  doc.text("Destino:", 110, y + 26);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(preInvoice.destination_port || "-", 130, y + 26);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  doc.text("Vencimento:", 110, y + 34);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(formatDate(preInvoice.due_date), 140, y + 34);

  y += 55;

  // Items Table Header
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Detalhamento por Container", 15, y);

  y += 5;

  // Items Table
  const tableData = items.map((item) => [
    item.container_number || "-",
    item.container_type || "-",
    item.free_time_days?.toString() || "-",
    item.days_count?.toString() || "0",
    formatCurrency(item.daily_rate_usd || 0),
    formatCurrency(item.total_usd || 0),
  ]);

  autoTable(doc, {
    startY: y,
    head: [[
      "Container",
      "Tipo",
      "Free Time",
      "Dias",
      "Taxa/Dia",
      "Total USD",
    ]],
    body: tableData,
    theme: "grid",
    headStyles: {
      fillColor: [255, 200, 0],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      fontSize: 9,
      halign: "center",
    },
    bodyStyles: {
      fontSize: 8,
      cellPadding: 3,
    },
    alternateRowStyles: {
      fillColor: [250, 250, 250],
    },
    columnStyles: {
      0: { cellWidth: 35, halign: "center", fontStyle: "bold" },
      1: { cellWidth: 25, halign: "center" },
      2: { cellWidth: 25, halign: "center" },
      3: { cellWidth: 20, halign: "center" },
      4: { cellWidth: 30, halign: "right" },
      5: { cellWidth: 35, halign: "right", fontStyle: "bold" },
    },
    margin: { left: 15, right: 15 },
  });

  const afterTableY = (doc as any).lastAutoTable.finalY + 10;

  // Totals Box
  doc.setFillColor(255, 248, 220);
  doc.roundedRect(pageWidth - 95, afterTableY, 80, 35, 3, 3, "F");
  doc.setDrawColor(255, 200, 0);
  doc.setLineWidth(0.5);
  doc.roundedRect(pageWidth - 95, afterTableY, 80, 35, 3, 3, "S");

  doc.setTextColor(80, 80, 80);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Total USD:", pageWidth - 90, afterTableY + 12);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(formatCurrency(preInvoice.total_usd), pageWidth - 20, afterTableY + 12, { align: "right" });

  if (preInvoice.total_brl > 0 && preInvoice.exchange_rate) {
    doc.setTextColor(80, 80, 80);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("Total BRL:", pageWidth - 90, afterTableY + 22);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(formatCurrencyBRL(preInvoice.total_brl), pageWidth - 20, afterTableY + 22, { align: "right" });

    doc.setTextColor(120, 120, 120);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text(`Taxa: ${preInvoice.exchange_rate.toFixed(4)}`, pageWidth - 20, afterTableY + 30, { align: "right" });
  }

  // Footer
  const pageHeight = doc.internal.pageSize.height;
  doc.setFontSize(8);
  doc.setTextColor(128, 128, 128);
  doc.text(
    `Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`,
    15,
    pageHeight - 10
  );
  doc.text(
    "Sistema Z3US.AI - Módulo Demurrage",
    pageWidth - 15,
    pageHeight - 10,
    { align: "right" }
  );

  // Save
  const fileName = `pre_fatura_${preInvoice.invoice_number}_${format(new Date(), "yyyy-MM-dd")}.pdf`;
  doc.save(fileName);

  return fileName;
};
