import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Voucher, ETAPA_LABELS } from "@/types/voucher";

const formatNumber = (value: number): string =>
  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

const formatCurrency = (value: number, moeda: string = "BRL"): string => {
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda }).format(value);
  } catch {
    return `${moeda} ${formatNumber(value)}`;
  }
};

export const exportVouchersToPDF = (data: Voucher[]) => {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.width;

  // Title bar (gold)
  doc.setFillColor(212, 175, 55);
  doc.rect(0, 0, pageWidth, 22, "F");
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Relatório de Vouchers — DACHSER", pageWidth / 2, 11, { align: "center" });

  doc.setFontSize(10);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(102, 102, 102);
  doc.text(
    `Gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} • ${data.length} voucher(s)`,
    pageWidth / 2,
    19,
    { align: "center" }
  );

  // Table data — 10 columns matching Excel
  const tableData = data.map((v) => [
    v.numeroSPO || "-",
    v.fornecedor || "-",
    v.cnpjFornecedor || "-",
    formatNumber(Number(v.valor) || 0),
    v.moeda || "BRL",
    v.vencimento ? format(new Date(v.vencimento), "dd/MM/yyyy", { locale: ptBR }) : "-",
    v.formaPagamento || "-",
    v.urgente ? "Sim" : "Não",
    ETAPA_LABELS[v.etapaAtual as keyof typeof ETAPA_LABELS] || v.etapaAtual || "-",
    v.criadoPorDfv || v.criadoPorUserName || "-",
  ]);

  // Total row
  const valorTotal = data.reduce((s, v) => s + (Number(v.valor) || 0), 0);
  const moedas = new Set(data.map((d) => d.moeda || "BRL").filter(Boolean));
  const mixedMoedas = moedas.size > 1;
  const totalRow = [
    "TOTAL",
    "",
    "",
    formatNumber(valorTotal),
    mixedMoedas ? "(moedas mistas)" : (Array.from(moedas)[0] || ""),
    "",
    "",
    "",
    "",
    "",
  ];
  tableData.push(totalRow);
  const totalRowIndex = tableData.length - 1;

  autoTable(doc, {
    startY: 26,
    head: [[
      "Número SPO/Voucher",
      "Fornecedor",
      "CNPJ Fornecedor",
      "Valor",
      "Moeda",
      "Vencimento",
      "Forma de Pagamento",
      "Urgente",
      "Etapa Atual",
      "Criado Por",
    ]],
    body: tableData,
    theme: "grid",
    headStyles: {
      fillColor: [212, 175, 55],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      fontSize: 8,
      halign: "center",
      valign: "middle",
    },
    bodyStyles: {
      fontSize: 7,
      cellPadding: 2,
      lineColor: [204, 204, 204],
      lineWidth: 0.1,
    },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    columnStyles: {
      0: { cellWidth: 28, halign: "center" },
      1: { cellWidth: 46 },
      2: { cellWidth: 30, halign: "center" },
      3: { cellWidth: 24, halign: "right" },
      4: { cellWidth: 16, halign: "center" },
      5: { cellWidth: 22, halign: "center" },
      6: { cellWidth: 30, halign: "center" },
      7: { cellWidth: 16, halign: "center" },
      8: { cellWidth: 32, halign: "center" },
      9: { cellWidth: 32 },
    },
    didParseCell: (cellData) => {
      if (cellData.section !== "body") return;
      const rowIndex = cellData.row.index;
      // Total row styling
      if (rowIndex === totalRowIndex) {
        cellData.cell.styles.fillColor = [255, 244, 214];
        cellData.cell.styles.fontStyle = "bold";
        cellData.cell.styles.lineWidth = 0.1;
        return;
      }
      // Urgent rows
      const v = data[rowIndex];
      if (v?.urgente) {
        cellData.cell.styles.fillColor = [255, 229, 229];
        cellData.cell.styles.fontStyle = "bold";
      }
    },
    didDrawPage: (pageData) => {
      const pageCount = doc.getNumberOfPages();
      const pageSize = doc.internal.pageSize;
      const pageHeight = pageSize.height || pageSize.getHeight();
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(128, 128, 128);
      doc.text(
        `Página ${pageData.pageNumber} de ${pageCount}`,
        pageSize.width / 2,
        pageHeight - 8,
        { align: "center" }
      );
      doc.text(
        "Sistema de Gestão Financeira Dachser",
        pageSize.width - 10,
        pageHeight - 8,
        { align: "right" }
      );
    },
    margin: { top: 26, right: 8, bottom: 12, left: 8 },
  });

  // Summary page
  if (data.length > 0) {
    doc.addPage();
    doc.setFillColor(212, 175, 55);
    doc.rect(0, 0, doc.internal.pageSize.width, 22, "F");
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("Resumo do Relatório", 15, 14);

    let y = 35;
    const stats = {
      total: data.length,
      urgentes: data.filter((v) => v.urgente).length,
      porMoeda: data.reduce((acc, v) => {
        const m = v.moeda || "BRL";
        acc[m] = (acc[m] || 0) + (Number(v.valor) || 0);
        return acc;
      }, {} as Record<string, number>),
      porEtapa: data.reduce((acc, v) => {
        const etapa = ETAPA_LABELS[v.etapaAtual as keyof typeof ETAPA_LABELS] || v.etapaAtual || "-";
        acc[etapa] = (acc[etapa] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(`Total de Vouchers: ${stats.total}`, 15, y); y += 8;
    doc.text(`Vouchers Urgentes: ${stats.urgentes}`, 15, y); y += 12;

    doc.setFontSize(13);
    doc.text("Valor Total por Moeda:", 15, y); y += 7;
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    Object.entries(stats.porMoeda).forEach(([m, total]) => {
      doc.text(`• ${formatCurrency(total, m)}`, 20, y); y += 6;
    });
    y += 6;

    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("Por Etapa:", 15, y); y += 7;
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    Object.entries(stats.porEtapa).forEach(([etapa, count]) => {
      doc.text(`• ${etapa}: ${count}`, 20, y); y += 6;
    });
  }

  const fileName = `vouchers_${format(new Date(), "yyyy-MM-dd_HH-mm")}.pdf`;
  doc.save(fileName);
  return fileName;
};
