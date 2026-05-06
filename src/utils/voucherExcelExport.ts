import * as XLSX from "xlsx-js-style";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Voucher, ETAPA_LABELS } from "@/types/voucher";

const GOLD = "D4AF37";
const GOLD_LIGHT = "FFF4D6";
const ROW_ALT = "F5F5F5";
const URGENT = "FFE5E5";
const BORDER_GRAY = "CCCCCC";

const thinBorder = {
  top: { style: "thin", color: { rgb: BORDER_GRAY } },
  bottom: { style: "thin", color: { rgb: BORDER_GRAY } },
  left: { style: "thin", color: { rgb: BORDER_GRAY } },
  right: { style: "thin", color: { rgb: BORDER_GRAY } },
};

const HEADERS = [
  "Número SPO/Voucher",
  "Fornecedor",
  "CNPJ Fornecedor",
  "Valor",
  "Moeda",
  "Vencimento",
  "Necessita Fiscal",
  "Forma de Pagamento",
  "Urgente",
  "Etapa Atual",
  "Criado Por",
];

const COL_WIDTHS = [22, 38, 22, 18, 10, 14, 18, 22, 12, 26, 30];

export const exportVouchersToExcel = (data: Voucher[]) => {
  const ws: XLSX.WorkSheet = {};
  const lastCol = HEADERS.length - 1; // 10 (K)
  const lastColLetter = XLSX.utils.encode_col(lastCol);

  // Row 1: Title (merged A1:K1)
  ws["A1"] = {
    t: "s",
    v: "Relatório de Vouchers — DACHSER",
    s: {
      fill: { fgColor: { rgb: GOLD } },
      font: { bold: true, sz: 16, color: { rgb: "000000" } },
      alignment: { horizontal: "center", vertical: "center" },
      border: thinBorder,
    },
  };

  // Row 2: Subtitle with generation date
  ws["A2"] = {
    t: "s",
    v: `Gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} • ${data.length} voucher(s)`,
    s: {
      fill: { fgColor: { rgb: "FAFAFA" } },
      font: { italic: true, sz: 10, color: { rgb: "666666" } },
      alignment: { horizontal: "center", vertical: "center" },
    },
  };

  // Row 3: Headers
  HEADERS.forEach((h, idx) => {
    const addr = XLSX.utils.encode_cell({ r: 2, c: idx });
    ws[addr] = {
      t: "s",
      v: h,
      s: {
        fill: { fgColor: { rgb: GOLD } },
        font: { bold: true, sz: 12, color: { rgb: "000000" } },
        alignment: { horizontal: "center", vertical: "center", wrapText: true },
        border: thinBorder,
      },
    };
  });

  // Data rows starting at row 4 (index 3)
  data.forEach((v, i) => {
    const r = 3 + i;
    const isUrgent = !!v.urgente;
    const isAlt = i % 2 === 1;
    const rowFill = isUrgent ? URGENT : isAlt ? ROW_ALT : "FFFFFF";

    const baseStyle = {
      fill: { fgColor: { rgb: rowFill } },
      font: { sz: 10, bold: isUrgent, color: { rgb: "000000" } },
      alignment: { vertical: "center", wrapText: false },
      border: thinBorder,
    };

    const valorNum = v.valor != null && v.valor !== ('' as any) ? Number(v.valor) : 0;
    const cells: Array<{ v: any; t?: string; z?: string; align?: string }> = [
      { v: v.numeroSPO, align: "center" },
      { v: v.fornecedor || "-" },
      { v: v.cnpjFornecedor || "-", align: "center" },
      { v: Number.isFinite(valorNum) ? valorNum : 0, t: "n", z: "#,##0.00", align: "right" },
      { v: v.moeda || "BRL", align: "center" },
      {
        v: v.vencimento ? format(new Date(v.vencimento), "dd/MM/yyyy", { locale: ptBR }) : "-",
        align: "center",
      },
      { v: v.cobrancaEmNomeDe === "DACHSER" ? "Sim" : "Não", align: "center" },
      { v: v.formaPagamento || "-", align: "center" },
      { v: v.urgente ? "Sim" : "Não", align: "center" },
      {
        v: ETAPA_LABELS[v.etapaAtual as keyof typeof ETAPA_LABELS] || v.etapaAtual || "-",
        align: "center",
      },
      { v: v.criadoPorDfv || v.criadoPorUserName || "-" },
    ];

    cells.forEach((cell, c) => {
      const addr = XLSX.utils.encode_cell({ r, c });
      ws[addr] = {
        t: cell.t || "s",
        v: cell.v,
        ...(cell.z ? { z: cell.z } : {}),
        s: {
          ...baseStyle,
          alignment: { ...baseStyle.alignment, horizontal: cell.align || "left" },
        },
      };
    });
  });

  // Subtotal row
  const totalRowIdx = 3 + data.length; // 0-based
  const totalExcelRow = totalRowIdx + 1; // 1-based for formula
  const firstDataExcelRow = 4;
  const lastDataExcelRow = 3 + data.length;
  const moedas = new Set(data.map((d) => d.moeda || "BRL").filter(Boolean));
  const mixedMoedas = moedas.size > 1;

  const totalStyle = {
    fill: { fgColor: { rgb: GOLD_LIGHT } },
    font: { bold: true, sz: 11, color: { rgb: "000000" } },
    alignment: { vertical: "center" },
    border: {
      ...thinBorder,
      top: { style: "double", color: { rgb: GOLD } },
    },
  };

  for (let c = 0; c <= lastCol; c++) {
    const addr = XLSX.utils.encode_cell({ r: totalRowIdx, c });
    if (c === 0) {
      ws[addr] = {
        t: "s",
        v: "TOTAL",
        s: { ...totalStyle, alignment: { ...totalStyle.alignment, horizontal: "center" } },
      };
    } else if (c === 3) {
      ws[addr] = {
        t: "n",
        f: data.length > 0 ? `SUM(D${firstDataExcelRow}:D${lastDataExcelRow})` : undefined,
        v: data.reduce((s, x) => s + (Number(x.valor) || 0), 0),
        z: "#,##0.00",
        s: { ...totalStyle, alignment: { ...totalStyle.alignment, horizontal: "right" } },
      };
    } else if (c === 4 && mixedMoedas) {
      ws[addr] = {
        t: "s",
        v: "(moedas mistas)",
        s: {
          ...totalStyle,
          font: { italic: true, sz: 9, color: { rgb: "888888" } },
          alignment: { ...totalStyle.alignment, horizontal: "center" },
        },
      };
    } else {
      ws[addr] = { t: "s", v: "", s: totalStyle };
    }
  }

  // Worksheet metadata
  ws["!ref"] = `A1:${lastColLetter}${totalExcelRow}`;
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: lastCol } },
  ];
  ws["!cols"] = COL_WIDTHS.map((w) => ({ wch: w }));
  const rowHeights: { hpt: number }[] = [];
  rowHeights[0] = { hpt: 32 };
  rowHeights[1] = { hpt: 20 };
  rowHeights[2] = { hpt: 28 };
  for (let i = 0; i < data.length; i++) rowHeights[3 + i] = { hpt: 20 };
  rowHeights[totalRowIdx] = { hpt: 24 };
  ws["!rows"] = rowHeights;
  ws["!autofilter"] = { ref: `A3:${lastColLetter}${lastDataExcelRow > 3 ? lastDataExcelRow : 3}` };
  // Freeze header (row 3)
  (ws as any)["!views"] = [{ state: "frozen", ySplit: 3 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Vouchers");
  wb.Props = {
    Title: "Relatório de Vouchers",
    Subject: "Vouchers DACHSER",
    Author: "Sistema Z3US.AI Workflow Voucher",
    CreatedDate: new Date(),
  };

  const fileName = `vouchers_${format(new Date(), "yyyy-MM-dd_HH-mm")}.xlsx`;
  XLSX.writeFile(wb, fileName, { cellStyles: true });
  return fileName;
};
