import * as XLSX from "xlsx";

export interface BatchRawRow {
  [key: string]: any;
}

export async function parseBatchSpreadsheet(file: File): Promise<BatchRawRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buf), { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<BatchRawRow>(sheet, { defval: "", raw: false });
}

export const FORMA_PAGAMENTO_OPTIONS = [
  "BOLETO", "PIX", "TRANSFERENCIA", "DEPOSITO", "DARF", "GPS", "CAMBIO", "ADF", "CARTAO",
];

export const TIPOS_ANEXO = [
  "FATURA",
  "BOLETO",
  "OUTROS",
];
