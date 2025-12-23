import * as XLSX from "xlsx-js-style";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Voucher, ETAPA_LABELS, STATUS_INTEGRACAO_RM_LABELS } from "@/types/voucher";

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

const formatCurrency = (value: number | undefined, moeda: string = "BRL"): string => {
  if (value === undefined || value === null) return "-";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: moeda,
  }).format(value);
};

export const exportVouchersToExcel = (data: Voucher[]) => {
  // Preparar dados com novas colunas
  const excelData = data.map((v) => ({
    "Número SPO": v.numeroSPO,
    "Fornecedor": v.fornecedor || "-",
    "CNPJ Fornecedor": v.cnpjFornecedor || "-",
    "Valor": formatCurrency(v.valor, v.moeda),
    "Moeda": v.moeda || "BRL",
    "Vencimento": format(new Date(v.vencimento), "dd/MM/yyyy", { locale: ptBR }),
    "Cobrança": v.cobrancaEmNomeDe === "DACHSER" ? "Dachser" : "Cliente",
    "Forma Pagamento": v.formaPagamento,
    "Tipo Execução": v.tipoExecucaoPagamento || "-",
    "Filial": v.filial || "-",
    "Remessa": v.remessa || "NENHUM",
    "Urgente": v.urgente ? "Sim" : "Não",
    "Etapa Atual": ETAPA_LABELS[v.etapaAtual as keyof typeof ETAPA_LABELS] || v.etapaAtual,
    "Status Baixa": v.statusBaixa || "PENDENTE",
    "Status Integração RM": STATUS_INTEGRACAO_RM_LABELS[v.statusIntegracaoRm as keyof typeof STATUS_INTEGRACAO_RM_LABELS] || v.statusIntegracaoRm || "PENDENTE",
    "Criado Por": v.criadoPorUserName || "-",
    "Resp. Operação": v.responsavelOperacaoUserName || "-",
    "Resp. Fiscal": v.responsavelFiscalUserName || "-",
    "Resp. Financeiro": v.responsavelFinanceiroUserName || "-",
    "Comentários Operação": v.comentariosOperacao || "-",
    "Comentários Fiscal": v.comentariosFiscal || "-",
    "Comentários Financeiro": v.comentariosFinanceiro || "-",
    "Data Criação": format(new Date(v.createdAt), "dd/MM/yyyy HH:mm", {
      locale: ptBR,
    }),
    "Última Atualização": format(new Date(v.updatedAt), "dd/MM/yyyy HH:mm", {
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
          wrapText: col >= 19, // Wrap text para comentários
        },
        border: COLORS.border,
      };
    }
  }

  // Ajustar largura das colunas (24 colunas agora)
  const colWidths = [
    { wch: 15 }, // Número SPO
    { wch: 30 }, // Fornecedor
    { wch: 18 }, // CNPJ Fornecedor
    { wch: 15 }, // Valor
    { wch: 8 },  // Moeda
    { wch: 12 }, // Vencimento
    { wch: 12 }, // Cobrança
    { wch: 20 }, // Forma Pagamento
    { wch: 15 }, // Tipo Execução
    { wch: 10 }, // Filial
    { wch: 15 }, // Remessa
    { wch: 8 },  // Urgente
    { wch: 18 }, // Etapa Atual
    { wch: 15 }, // Status Baixa
    { wch: 18 }, // Status Integração RM
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
