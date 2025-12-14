import * as XLSX from "xlsx-js-style";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface VoucherData {
  numero_spo: string;
  vencimento: string;
  cobranca_em_nome_de: string;
  forma_pagamento: string;
  remessa: string;
  urgente: boolean;
  etapa_atual: string;
  status_baixa: string;
  criado_por?: { name: string };
  responsavel_operacao?: { name: string };
  responsavel_fiscal?: { name: string };
  responsavel_financeiro?: { name: string };
  comentarios_operacao?: string;
  comentarios_fiscal?: string;
  comentarios_financeiro?: string;
  created_at: string;
  updated_at: string;
}

const COLORS = {
  header: { fgColor: { rgb: "D4AF37" } }, // Dourado
  headerText: { color: { rgb: "000000" } },
  urgentRow: { fgColor: { rgb: "FFE5E5" } }, // Vermelho claro
  alternateRow: { fgColor: { rgb: "F5F5F5" } }, // Cinza claro
  border: {
    top: { style: "thin", color: { rgb: "CCCCCC" } },
    bottom: { style: "thin", color: { rgb: "CCCCCC" } },
    left: { style: "thin", color: { rgb: "CCCCCC" } },
    right: { style: "thin", color: { rgb: "CCCCCC" } },
  },
};

export const exportVouchersToExcel = (data: VoucherData[]) => {
  // Preparar dados
  const excelData = data.map((v) => ({
    "Número SPO": v.numero_spo,
    Vencimento: format(new Date(v.vencimento), "dd/MM/yyyy", { locale: ptBR }),
    Cobrança: v.cobranca_em_nome_de === "DACHSER" ? "Dachser" : "Cliente",
    "Forma Pagamento": v.forma_pagamento,
    Remessa: v.remessa,
    Urgente: v.urgente ? "Sim" : "Não",
    "Etapa Atual": v.etapa_atual,
    "Status Baixa": v.status_baixa,
    "Criado Por": v.criado_por?.name || "-",
    "Resp. Operação": v.responsavel_operacao?.name || "-",
    "Resp. Fiscal": v.responsavel_fiscal?.name || "-",
    "Resp. Financeiro": v.responsavel_financeiro?.name || "-",
    "Comentários Operação": v.comentarios_operacao || "-",
    "Comentários Fiscal": v.comentarios_fiscal || "-",
    "Comentários Financeiro": v.comentarios_financeiro || "-",
    "Data Criação": format(new Date(v.created_at), "dd/MM/yyyy HH:mm", {
      locale: ptBR,
    }),
    "Última Atualização": format(new Date(v.updated_at), "dd/MM/yyyy HH:mm", {
      locale: ptBR,
    }),
  }));

  // Criar worksheet
  const ws = XLSX.utils.json_to_sheet(excelData);

  // Obter range
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");

  // Estilizar cabeçalho
  for (let col = range.s.c; col <= range.e.c; col++) {
    const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
    if (!ws[cellAddress]) continue;

    ws[cellAddress].s = {
      fill: COLORS.header,
      font: {
        bold: true,
        sz: 12,
        color: COLORS.headerText.color,
      },
      alignment: {
        horizontal: "center",
        vertical: "center",
      },
      border: COLORS.border,
    };
  }

  // Estilizar linhas de dados
  for (let row = range.s.r + 1; row <= range.e.r; row++) {
    const isUrgent = data[row - 1]?.urgente;
    const isAlternate = row % 2 === 0;

    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
      if (!ws[cellAddress]) continue;

      ws[cellAddress].s = {
        fill: isUrgent
          ? COLORS.urgentRow
          : isAlternate
          ? COLORS.alternateRow
          : { fgColor: { rgb: "FFFFFF" } },
        font: {
          sz: 10,
          bold: isUrgent,
        },
        alignment: {
          horizontal: col === 0 ? "center" : "left",
          vertical: "center",
          wrapText: col >= 12, // Wrap text para comentários
        },
        border: COLORS.border,
      };
    }
  }

  // Ajustar largura das colunas
  const colWidths = [
    { wch: 15 }, // Número SPO
    { wch: 12 }, // Vencimento
    { wch: 12 }, // Cobrança
    { wch: 20 }, // Forma Pagamento
    { wch: 15 }, // Remessa
    { wch: 8 }, // Urgente
    { wch: 18 }, // Etapa Atual
    { wch: 15 }, // Status Baixa
    { wch: 25 }, // Criado Por
    { wch: 25 }, // Resp. Operação
    { wch: 25 }, // Resp. Fiscal
    { wch: 25 }, // Resp. Financeiro
    { wch: 40 }, // Comentários Operação
    { wch: 40 }, // Comentários Fiscal
    { wch: 40 }, // Comentários Financeiro
    { wch: 18 }, // Data Criação
    { wch: 18 }, // Última Atualização
  ];
  ws["!cols"] = colWidths;

  // Ajustar altura das linhas
  const rowHeights: { hpt: number }[] = [];
  rowHeights[0] = { hpt: 25 }; // Header height
  for (let row = 1; row <= range.e.r; row++) {
    rowHeights[row] = { hpt: 20 }; // Data row height
  }
  ws["!rows"] = rowHeights;

  // Criar workbook
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Vouchers");

  // Adicionar informações do documento
  wb.Props = {
    Title: "Relatório de Vouchers",
    Subject: "Vouchers Z3US.AI",
    Author: "Sistema Z3US.AI Workflow Voucher",
    CreatedDate: new Date(),
  };

  // Gerar arquivo
  const fileName = `vouchers_${format(new Date(), "yyyy-MM-dd_HH-mm")}.xlsx`;
  XLSX.writeFile(wb, fileName, { cellStyles: true });

  return fileName;
};
