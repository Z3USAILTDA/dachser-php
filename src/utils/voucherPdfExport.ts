import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Voucher } from "@/types/voucher";

export const exportVouchersToPDF = (data: Voucher[]) => {
  // Criar documento PDF em modo paisagem
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  // Adicionar título
  doc.setFillColor(212, 175, 55); // Dourado
  doc.rect(0, 0, doc.internal.pageSize.width, 25, "F");

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("Z3US.AI - Relatório de Vouchers", 15, 12);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(
    `Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`,
    15,
    19
  );

  // Preparar dados para tabela
  const tableData = data.map((v) => [
    v.numeroSPO,
    format(new Date(v.vencimento), "dd/MM/yyyy", { locale: ptBR }),
    v.cobrancaEmNomeDe === "DACHSER" ? "Dachser" : "Cliente",
    v.formaPagamento,
    v.urgente ? "Sim" : "Não",
    v.etapaAtual,
    v.statusBaixa || "PENDENTE",
    v.criadoPorUserName || "-",
    v.responsavelOperacaoUserName || "-",
    format(new Date(v.createdAt), "dd/MM/yyyy", { locale: ptBR }),
  ]);

  // Criar tabela
  autoTable(doc, {
    startY: 30,
    head: [
      [
        "Nº SPO",
        "Vencimento",
        "Cobrança",
        "Forma Pagto",
        "Urgente",
        "Etapa",
        "Status",
        "Criado Por",
        "Resp. Operação",
        "Data Criação",
      ],
    ],
    body: tableData,
    theme: "grid",
    headStyles: {
      fillColor: [212, 175, 55], // Dourado
      textColor: [0, 0, 0],
      fontStyle: "bold",
      fontSize: 9,
      halign: "center",
    },
    bodyStyles: {
      fontSize: 8,
      cellPadding: 2,
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245],
    },
    columnStyles: {
      0: { cellWidth: 25, halign: "center" }, // Nº SPO
      1: { cellWidth: 22, halign: "center" }, // Vencimento
      2: { cellWidth: 18, halign: "center" }, // Cobrança
      3: { cellWidth: 30 }, // Forma Pagto
      4: { cellWidth: 15, halign: "center" }, // Urgente
      5: { cellWidth: 25 }, // Etapa
      6: { cellWidth: 25 }, // Status
      7: { cellWidth: 30 }, // Criado Por
      8: { cellWidth: 30 }, // Resp. Operação
      9: { cellWidth: 22, halign: "center" }, // Data Criação
    },
    didParseCell: (cellData) => {
      // Destacar linhas urgentes
      if (cellData.section === "body") {
        const rowIndex = cellData.row.index;
        if (data[rowIndex]?.urgente) {
          cellData.cell.styles.fillColor = [255, 229, 229]; // Vermelho claro
          cellData.cell.styles.fontStyle = "bold";
        }
      }
    },
    didDrawPage: (pageData) => {
      // Adicionar rodapé
      const pageCount = doc.getNumberOfPages();
      const pageSize = doc.internal.pageSize;
      const pageHeight = pageSize.height || pageSize.getHeight();

      doc.setFontSize(8);
      doc.setTextColor(128, 128, 128);
      doc.text(
        `Página ${pageData.pageNumber} de ${pageCount}`,
        pageSize.width / 2,
        pageHeight - 10,
        { align: "center" }
      );

      doc.text(
        "Sistema de Gestão Financeira Dachser",
        pageSize.width - 15,
        pageHeight - 10,
        { align: "right" }
      );
    },
    margin: { top: 30, right: 10, bottom: 15, left: 10 },
  });

  // Adicionar página de resumo se houver dados
  if (data.length > 0) {
    doc.addPage();

    doc.setFillColor(212, 175, 55);
    doc.rect(0, 0, doc.internal.pageSize.width, 25, "F");

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Resumo do Relatório", 15, 15);

    let yPosition = 40;

    // Estatísticas
    const stats = {
      total: data.length,
      urgentes: data.filter((v) => v.urgente).length,
      porEtapa: data.reduce((acc, v) => {
        acc[v.etapaAtual] = (acc[v.etapaAtual] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      porStatus: data.reduce((acc, v) => {
        const status = v.statusBaixa || "PENDENTE";
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(`Total de Vouchers: ${stats.total}`, 15, yPosition);
    yPosition += 8;

    doc.text(`Vouchers Urgentes: ${stats.urgentes}`, 15, yPosition);
    yPosition += 15;

    // Por Etapa
    doc.setFontSize(14);
    doc.text("Por Etapa:", 15, yPosition);
    yPosition += 8;

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    Object.entries(stats.porEtapa).forEach(([etapa, count]) => {
      doc.text(`• ${etapa}: ${count}`, 20, yPosition);
      yPosition += 7;
    });

    yPosition += 8;

    // Por Status
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Por Status de Baixa:", 15, yPosition);
    yPosition += 8;

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    Object.entries(stats.porStatus).forEach(([status, count]) => {
      doc.text(`• ${status}: ${count}`, 20, yPosition);
      yPosition += 7;
    });
  }

  // Salvar arquivo
  const fileName = `vouchers_${format(new Date(), "yyyy-MM-dd_HH-mm")}.pdf`;
  doc.save(fileName);

  return fileName;
};
