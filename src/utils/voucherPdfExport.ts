import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Voucher, ETAPA_LABELS, STATUS_INTEGRACAO_RM_LABELS } from "@/types/voucher";

const formatCurrency = (value: number | undefined, moeda: string = "BRL"): string => {
  if (value === undefined || value === null) return "-";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: moeda,
  }).format(value);
};

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

  // Preparar dados para tabela (12 colunas principais)
  const tableData = data.map((v) => [
    v.numeroSPO,
    v.fornecedor || "-",
    formatCurrency(v.valor, v.moeda),
    format(new Date(v.vencimento), "dd/MM/yyyy", { locale: ptBR }),
    v.cobrancaEmNomeDe === "DACHSER" ? "Dachser" : "Cliente",
    v.tipoExecucaoPagamento || "-",
    v.urgente ? "Sim" : "Não",
    ETAPA_LABELS[v.etapaAtual as keyof typeof ETAPA_LABELS] || v.etapaAtual,
    v.statusBaixa || "PENDENTE",
    STATUS_INTEGRACAO_RM_LABELS[v.statusIntegracaoRm as keyof typeof STATUS_INTEGRACAO_RM_LABELS] || v.statusIntegracaoRm || "-",
    v.criadoPorUserName || "-",
    format(new Date(v.createdAt), "dd/MM/yyyy", { locale: ptBR }),
  ]);

  // Criar tabela
  autoTable(doc, {
    startY: 30,
    head: [
      [
        "Nº SPO",
        "Fornecedor",
        "Valor",
        "Vencimento",
        "Cobrança",
        "Tipo Exec.",
        "Urgente",
        "Etapa",
        "Status",
        "Status RM",
        "Criado Por",
        "Data Criação",
      ],
    ],
    body: tableData,
    theme: "grid",
    headStyles: {
      fillColor: [212, 175, 55], // Dourado
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
      0: { cellWidth: 20, halign: "center" }, // Nº SPO
      1: { cellWidth: 30 }, // Fornecedor
      2: { cellWidth: 22, halign: "right" }, // Valor
      3: { cellWidth: 20, halign: "center" }, // Vencimento
      4: { cellWidth: 16, halign: "center" }, // Cobrança
      5: { cellWidth: 18, halign: "center" }, // Tipo Exec.
      6: { cellWidth: 14, halign: "center" }, // Urgente
      7: { cellWidth: 22 }, // Etapa
      8: { cellWidth: 22 }, // Status
      9: { cellWidth: 22 }, // Status RM
      10: { cellWidth: 28 }, // Criado Por
      11: { cellWidth: 20, halign: "center" }, // Data Criação
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
      valorTotal: data.reduce((acc, v) => acc + (v.valor || 0), 0),
      porEtapa: data.reduce((acc, v) => {
        const etapa = ETAPA_LABELS[v.etapaAtual as keyof typeof ETAPA_LABELS] || v.etapaAtual;
        acc[etapa] = (acc[etapa] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      porStatus: data.reduce((acc, v) => {
        const status = v.statusBaixa || "PENDENTE";
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      porStatusRm: data.reduce((acc, v) => {
        const statusRm = STATUS_INTEGRACAO_RM_LABELS[v.statusIntegracaoRm as keyof typeof STATUS_INTEGRACAO_RM_LABELS] || v.statusIntegracaoRm || "PENDENTE";
        acc[statusRm] = (acc[statusRm] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      porTipoExecucao: data.reduce((acc, v) => {
        const tipo = v.tipoExecucaoPagamento || "Não definido";
        acc[tipo] = (acc[tipo] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(`Total de Vouchers: ${stats.total}`, 15, yPosition);
    yPosition += 8;

    doc.text(`Vouchers Urgentes: ${stats.urgentes}`, 15, yPosition);
    yPosition += 8;

    doc.text(`Valor Total: ${formatCurrency(stats.valorTotal)}`, 15, yPosition);
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

    // Por Status de Baixa
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

    yPosition += 8;

    // Por Status Integração RM
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Por Status Integração RM:", 15, yPosition);
    yPosition += 8;

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    Object.entries(stats.porStatusRm).forEach(([status, count]) => {
      doc.text(`• ${status}: ${count}`, 20, yPosition);
      yPosition += 7;
    });

    // Segunda coluna - começar do lado direito
    const xCol2 = 150;
    let yCol2 = 40;

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Por Tipo Execução Pagamento:", xCol2, yCol2);
    yCol2 += 8;

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    Object.entries(stats.porTipoExecucao).forEach(([tipo, count]) => {
      doc.text(`• ${tipo}: ${count}`, xCol2 + 5, yCol2);
      yCol2 += 7;
    });
  }

  // Salvar arquivo
  const fileName = `vouchers_${format(new Date(), "yyyy-MM-dd_HH-mm")}.pdf`;
  doc.save(fileName);

  return fileName;
};
