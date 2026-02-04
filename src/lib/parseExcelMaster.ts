import * as XLSX from "xlsx";

// Extensões aceitas
export const ACCEPTED_EXTENSIONS = [".xlsx", ".xls", ".xlsm", ".xlsb", ".csv", ".ods"];
export const ACCEPT_STRING = ".xlsx,.xls,.xlsm,.xlsb,.csv,.ods";

// Aliases de colunas do Excel → banco de dados
const COLUMN_ALIASES: Record<string, string[]> = {
  // Campos comuns (AIR e SEA)
  nome_analista: ["nome_analista", "analista", "clerk", "operator", "responsavel", "responsável"],
  customer_no: ["customer_no", "customer", "customer_number", "customer_id", "cliente", "cod_cliente", "codigo_cliente"],
  po: ["po", "p_o", "purchase_order", "pedido", "pedido_compra"],
  master: [
    "master", "mawb", "mawb_no", "master_awb", "master_awb_no", "master_number",
    "master_no", "master_id", "mawb_number", "master_awb_number", "masterawb", "no_master", "mbl", "mbl_no"
  ],
  etd: ["etd", "e_t_d", "estimated_time_departure", "data_etd", "departure", "data_saida", "data_saida_prevista"],
  pre_alert_sent: ["pre_alert_sent", "prealert_sent", "pre_alert", "prealert", "sent_prealert", "enviado_prealert"],
  oea_cl_doc: ["oea_cl_doc", "oea", "cl_doc", "cldoc", "doc_ok", "docs_ok", "documentos_ok", "docs"],
  remarks: ["remarks", "remark", "remarks_1", "observacao", "observacoes", "observacao_1", "observations", "notes", "note"],
  
  // Campos AIR específicos
  hawb: ["hawb", "hawb_no", "hawb_number", "house", "house_awb", "house_awb_no", "house_no"],
  cargo_departed: ["cargo_departed", "departed", "data_departed", "data_embarque", "embarque", "departure_date", "data_saida_real"],
  d_term: ["d_term", "dterm", "delivery_term", "incoterm", "incoterms", "termo", "termo_entrega"],
  pod_dn_available: ["pod_dn_available", "pod", "dn_available", "dn", "pod_dn", "document_available", "doc_available"],
  
  // Campos SEA específicos
  hbl: ["hbl", "hbl_no", "hbl_number", "house_bl", "house_bill", "house_bill_of_lading"],
  customer_order: ["customer_order", "order", "order_no", "order_number", "pedido_cliente"],
  accrual: ["accrual", "provisao", "prov"],
  dep: ["dep", "departed", "partiu"],
  eta_ata: ["eta_ata", "e_t_a_a_t_a", "eta", "e_t_a", "ata", "a_t_a", "arrival", "chegada"],
  email_title: ["email_title", "email_title_pre_alert", "titulo_email"],
  te: ["te", "t_e", "transit_time", "tempo_transito"],
  at: ["at", "a_t", "arrival_time"],
  wh_treatment: ["wh_treatment", "wh", "warehouse_treatment", "tratamento_armazem"],
  cct_transm: ["cct_transm", "cct", "transmissao_cct"],
};

// Colunas do banco - comuns e específicas por modal
export const DB_COLUMNS = [
  // Campos comuns
  "nome_analista",
  "customer_no", 
  "po",
  "master",
  "etd",
  "pre_alert_sent",
  "oea_cl_doc",
  "remarks",
  
  // Campos AIR
  "hawb",
  "cargo_departed",
  "d_term",
  "pod_dn_available",
  
  // Campos SEA
  "hbl",
  "customer_order",
  "accrual",
  "dep",
  "eta_ata",
  "email_title",
  "te",
  "at",
  "wh_treatment",
  "cct_transm",
];

export interface MasterRow {
  // Campos comuns (AIR e SEA)
  nome_analista?: string;
  customer_no?: string;
  po?: string;
  master?: string;
  etd?: string;
  pre_alert_sent?: string;
  oea_cl_doc?: number | null;
  remarks?: string;
  tipo_processo?: string;
  data_insert?: string;
  
  // Campos AIR específicos
  hawb?: string;
  cargo_departed?: string;
  d_term?: string;
  pod_dn_available?: string;
  
  // Campos SEA específicos
  hbl?: string;
  customer_order?: string;
  accrual?: number | null;
  dep?: number | null;
  eta_ata?: string;
  email_title?: string;
  te?: string;
  at?: string;
  wh_treatment?: string;
  cct_transm?: string;
}

export interface ColumnMapping {
  excelColumn: string;
  dbColumn: string;
  originalHeader: string;
}

export interface ParseValidationError {
  row: number;
  message: string;
}

export interface ParseMasterResult {
  success: boolean;
  rows: MasterRow[];
  columnMappings: ColumnMapping[];
  unmappedColumns: string[];
  errors: ParseValidationError[];
  totalRows: number;
  previewRows: MasterRow[];
}

export interface TipoProcesso {
  modal: "AIR" | "SEA";
  direction: "IMPORT" | "EXPORT";
  full: string;
  dataInsert?: string;
}

/**
 * Normaliza nome de coluna removendo acentos, espaços e caracteres especiais
 */
export function normalizeColumnName(name: string): string {
  if (!name || typeof name !== "string") return "";
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

/**
 * Encontra a coluna do banco correspondente ao header do Excel
 */
export function findDbColumn(normalizedHeader: string): string | null {
  // Prioridade 1: Correspondência exata com DB_COLUMNS
  if (DB_COLUMNS.includes(normalizedHeader)) {
    return normalizedHeader;
  }
  
  // Prioridade 2: Correspondência exata com aliases
  for (const [dbCol, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      const normalizedAlias = normalizeColumnName(alias);
      if (normalizedHeader === normalizedAlias) {
        return dbCol;
      }
    }
  }
  
  // Prioridade 3: Header começa com nome do campo
  for (const [dbCol, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      const normalizedAlias = normalizeColumnName(alias);
      if (normalizedHeader.startsWith(normalizedAlias) && normalizedAlias.length >= 3) {
        return dbCol;
      }
    }
  }
  
  // Prioridade 4: Header contém nome do campo (ou vice-versa)
  for (const [dbCol, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      const normalizedAlias = normalizeColumnName(alias);
      if (normalizedAlias.length >= 4 && (normalizedHeader.includes(normalizedAlias) || normalizedAlias.includes(normalizedHeader))) {
        return dbCol;
      }
    }
  }
  
  return null;
}

/**
 * Extrai data do nome do arquivo
 * Aceita formatos: 03fev, 03-fev, 03_fev, 03 fev, 2025-02-03, 03/02/2025, etc.
 */
export function extractDateFromFilename(filename: string): string | null {
  const normalized = filename.toLowerCase();
  
  // Mapa de meses em português
  const monthMap: Record<string, string> = {
    jan: "01", janeiro: "01",
    fev: "02", fevereiro: "02",
    mar: "03", marco: "03", março: "03",
    abr: "04", abril: "04",
    mai: "05", maio: "05",
    jun: "06", junho: "06",
    jul: "07", julho: "07",
    ago: "08", agosto: "08",
    set: "09", setembro: "09",
    out: "10", outubro: "10",
    nov: "11", novembro: "11",
    dez: "12", dezembro: "12",
  };
  
  // Padrão 1: dd + mês abreviado (03fev, 03-fev, 03_fev, 03 fev)
  const brShortMatch = normalized.match(/(\d{1,2})[\s_\-]?(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)/);
  if (brShortMatch) {
    const day = brShortMatch[1].padStart(2, "0");
    const month = monthMap[brShortMatch[2]];
    const year = new Date().getFullYear();
    return `${year}-${month}-${day} 00:00:00`;
  }
  
  // Padrão 2: mês abreviado + dd (fev03, fev-03)
  const brShortMatch2 = normalized.match(/(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[\s_\-]?(\d{1,2})/);
  if (brShortMatch2) {
    const month = monthMap[brShortMatch2[1]];
    const day = brShortMatch2[2].padStart(2, "0");
    const year = new Date().getFullYear();
    return `${year}-${month}-${day} 00:00:00`;
  }
  
  // Padrão 3: dd/mm/yyyy ou dd-mm-yyyy
  const brFullMatch = normalized.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (brFullMatch) {
    const day = brFullMatch[1].padStart(2, "0");
    const month = brFullMatch[2].padStart(2, "0");
    const year = brFullMatch[3];
    return `${year}-${month}-${day} 00:00:00`;
  }
  
  // Padrão 4: yyyy-mm-dd ou yyyy/mm/dd
  const isoMatch = normalized.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (isoMatch) {
    const year = isoMatch[1];
    const month = isoMatch[2].padStart(2, "0");
    const day = isoMatch[3].padStart(2, "0");
    return `${year}-${month}-${day} 00:00:00`;
  }
  
  return null;
}

/**
 * Extrai tipo_processo do nome do arquivo
 */
export function extractTipoProcesso(filename: string): TipoProcesso | null {
  const normalized = filename.toLowerCase();
  
  // Detectar modal
  let modal: "AIR" | "SEA" | null = null;
  if (/\bair\b/.test(normalized)) modal = "AIR";
  else if (/\bsea\b/.test(normalized)) modal = "SEA";
  
  // Detectar direção
  let direction: "IMPORT" | "EXPORT" | null = null;
  if (/\bimport\b/.test(normalized)) direction = "IMPORT";
  else if (/\bexport\b/.test(normalized)) direction = "EXPORT";
  
  if (!modal || !direction) return null;
  
  // Extrair data do nome do arquivo
  const dataInsert = extractDateFromFilename(filename);
  
  return {
    modal,
    direction,
    full: `${modal} ${direction}`,
    dataInsert: dataInsert || undefined,
  };
}

/**
 * Valida extensão do arquivo
 */
export function isValidExcelFile(file: File): boolean {
  const extension = "." + file.name.toLowerCase().split(".").pop();
  return ACCEPTED_EXTENSIONS.includes(extension);
}

/**
 * Retorna descrição do formato baseado na extensão
 */
export function getFileFormatDescription(filename: string): string {
  const extension = filename.toLowerCase().split(".").pop();
  const descriptions: Record<string, string> = {
    xlsx: "Excel 2007+ (.xlsx)",
    xls: "Excel 97-2003 (.xls)",
    xlsm: "Excel com Macros (.xlsm)",
    xlsb: "Excel Binário (.xlsb)",
    csv: "CSV",
    ods: "OpenDocument (.ods)",
  };
  return descriptions[extension || ""] || "Formato desconhecido";
}

/**
 * Formata data para DATETIME MySQL
 */
function formatDateTime(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * Converte valor para data MySQL DATETIME
 */
export function parseDate(value: unknown): string | null {
  if (!value && value !== 0) return null;
  
  // Data numérica Excel (dias desde 1899-12-30)
  if (typeof value === "number") {
    // Excel epoch: 30/12/1899
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(excelEpoch.getTime() + value * 86400000);
    return formatDateTime(date);
  }
  
  if (typeof value === "string") {
    const str = value.trim();
    if (!str) return null;
    
    // Formato dd/mm/yyyy ou dd-mm-yyyy
    const brMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (brMatch) {
      const [, d, m, y, hh, mm, ss] = brMatch;
      const date = new Date(
        parseInt(y),
        parseInt(m) - 1,
        parseInt(d),
        parseInt(hh || "0"),
        parseInt(mm || "0"),
        parseInt(ss || "0")
      );
      return formatDateTime(date);
    }
    
    // Formato yyyy-mm-dd
    const isoMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (isoMatch) {
      const [, y, m, d, hh, mm, ss] = isoMatch;
      const date = new Date(
        parseInt(y),
        parseInt(m) - 1,
        parseInt(d),
        parseInt(hh || "0"),
        parseInt(mm || "0"),
        parseInt(ss || "0")
      );
      return formatDateTime(date);
    }
    
    // Tentar parse nativo
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      return formatDateTime(parsed);
    }
  }
  
  if (value instanceof Date) {
    return formatDateTime(value);
  }
  
  return null;
}

/**
 * Converte valor para booleano (0 ou 1)
 */
export function parseBoolean(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  
  if (typeof value === "number") {
    return value === 0 ? 0 : 1;
  }
  
  const str = String(value).toLowerCase().trim();
  if (["1", "true", "sim", "yes", "ok", "s", "y", "x"].includes(str)) return 1;
  if (["0", "false", "nao", "não", "no", "n", ""].includes(str)) return 0;
  
  return null;
}

/**
 * Verifica se uma linha está completamente vazia
 */
function isEmptyRow(row: Record<string, unknown>): boolean {
  return Object.values(row).every(
    (v) => v === null || v === undefined || (typeof v === "string" && v.trim() === "")
  );
}

/**
 * Parse arquivo Excel e retorna dados estruturados
 */
export async function parseExcelMasterFile(
  file: File,
  tipoProcesso: TipoProcesso
): Promise<ParseMasterResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        
        // Pegar primeira planilha
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Converter para JSON com headers
        const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
          defval: null,
        });
        
        if (rawRows.length === 0) {
          resolve({
            success: false,
            rows: [],
            columnMappings: [],
            unmappedColumns: [],
            errors: [{ row: 0, message: "Arquivo vazio ou sem dados válidos" }],
            totalRows: 0,
            previewRows: [],
          });
          return;
        }
        
        // Mapear colunas
        const excelHeaders = Object.keys(rawRows[0] || {});
        const columnMappings: ColumnMapping[] = [];
        const unmappedColumns: string[] = [];
        
        // Debug: Log dos headers detectados
        console.log("[parseExcelMaster] Headers detectados:", excelHeaders);
        console.log("[parseExcelMaster] Headers normalizados:", excelHeaders.map(h => `${h} → ${normalizeColumnName(h)}`));
        
        for (const header of excelHeaders) {
          const normalized = normalizeColumnName(header);
          const dbColumn = findDbColumn(normalized);
          
          if (dbColumn) {
            columnMappings.push({
              excelColumn: normalized,
              dbColumn,
              originalHeader: header,
            });
          } else {
            unmappedColumns.push(header);
          }
        }
        
        // Verificar colunas essenciais (hawb, hbl ou master)
        const hasHawb = columnMappings.some((m) => m.dbColumn === "hawb");
        const hasHbl = columnMappings.some((m) => m.dbColumn === "hbl");
        const hasMaster = columnMappings.some((m) => m.dbColumn === "master");
        
        if (!hasHawb && !hasHbl && !hasMaster) {
          resolve({
            success: false,
            rows: [],
            columnMappings,
            unmappedColumns,
            errors: [{ row: 0, message: "Coluna HAWB, HBL ou MASTER é obrigatória" }],
            totalRows: 0,
            previewRows: [],
          });
          return;
        }
        
        // Processar linhas
        const rows: MasterRow[] = [];
        const errors: ParseValidationError[] = [];
        
        for (let i = 0; i < rawRows.length; i++) {
          const rawRow = rawRows[i];
          const rowNumber = i + 2; // +2 porque linha 1 é header
          
          // Ignorar linhas vazias
          if (isEmptyRow(rawRow)) continue;
          
          const row: MasterRow = {
            tipo_processo: tipoProcesso.full,
            data_insert: tipoProcesso.dataInsert,
          };
          
          // Mapear valores
          for (const mapping of columnMappings) {
            const value = rawRow[mapping.originalHeader];
            
            switch (mapping.dbColumn) {
              // Campos de data
              case "etd":
                row.etd = parseDate(value) || undefined;
                break;
              case "pre_alert_sent":
                row.pre_alert_sent = parseDate(value) || undefined;
                break;
              case "cargo_departed":
                row.cargo_departed = parseDate(value) || undefined;
                break;
              case "eta_ata":
                row.eta_ata = parseDate(value) || undefined;
                break;
              
              // Campos booleanos
              case "oea_cl_doc":
                row.oea_cl_doc = parseBoolean(value);
                break;
              case "accrual":
                row.accrual = parseBoolean(value);
                break;
              case "dep":
                row.dep = parseBoolean(value);
                break;
              
              // Campos de texto
              case "nome_analista":
                row.nome_analista = value != null ? String(value).trim() : undefined;
                break;
              case "customer_no":
                row.customer_no = value != null ? String(value).trim() : undefined;
                break;
              case "po":
                row.po = value != null ? String(value).trim() : undefined;
                break;
              case "hawb":
                row.hawb = value != null ? String(value).trim() : undefined;
                break;
              case "hbl":
                row.hbl = value != null ? String(value).trim() : undefined;
                break;
              case "master":
                row.master = value != null ? String(value).trim() : undefined;
                break;
              case "d_term":
                row.d_term = value != null ? String(value).trim() : undefined;
                break;
              case "pod_dn_available":
                row.pod_dn_available = value != null ? String(value).trim() : undefined;
                break;
              case "remarks":
                row.remarks = value != null ? String(value).trim() : undefined;
                break;
              case "customer_order":
                row.customer_order = value != null ? String(value).trim() : undefined;
                break;
              case "email_title":
                row.email_title = value != null ? String(value).trim() : undefined;
                break;
              case "te":
                row.te = value != null ? String(value).trim() : undefined;
                break;
              case "at":
                row.at = value != null ? String(value).trim() : undefined;
                break;
              case "wh_treatment":
                row.wh_treatment = value != null ? String(value).trim() : undefined;
                break;
              case "cct_transm":
                row.cct_transm = value != null ? String(value).trim() : undefined;
                break;
            }
          }
          
          // Validar linha - aceitar HAWB (air), HBL (sea) ou Master
          const hawbValue = row.hawb?.trim();
          const hblValue = row.hbl?.trim();
          const masterValue = row.master?.trim();
          
          if (!hawbValue && !hblValue && !masterValue) {
            errors.push({
              row: rowNumber,
              message: "HAWB, HBL ou MASTER deve estar preenchido",
            });
          }
          
          rows.push(row);
        }
        
        // Preview (primeiras 50 linhas)
        const previewRows = rows.slice(0, 50);
        
        resolve({
          success: errors.length === 0,
          rows,
          columnMappings,
          unmappedColumns,
          errors,
          totalRows: rows.length,
          previewRows,
        });
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Atualiza mapeamento de colunas manualmente
 */
export function updateColumnMapping(
  mappings: ColumnMapping[],
  excelColumn: string,
  newDbColumn: string
): ColumnMapping[] {
  return mappings.map((m) =>
    m.excelColumn === excelColumn ? { ...m, dbColumn: newDbColumn } : m
  );
}

/**
 * Reprocessa dados com novo mapeamento
 */
export function reprocessWithMapping(
  rawRows: Record<string, unknown>[],
  columnMappings: ColumnMapping[],
  tipoProcesso: TipoProcesso
): { rows: MasterRow[]; errors: ParseValidationError[] } {
  const rows: MasterRow[] = [];
  const errors: ParseValidationError[] = [];
  
  for (let i = 0; i < rawRows.length; i++) {
    const rawRow = rawRows[i];
    const rowNumber = i + 2;
    
    if (isEmptyRow(rawRow)) continue;
    
    const row: MasterRow = {
      tipo_processo: tipoProcesso.full,
      data_insert: tipoProcesso.dataInsert,
    };
    
    for (const mapping of columnMappings) {
      const value = rawRow[mapping.originalHeader];
      
      switch (mapping.dbColumn) {
        // Campos de data
        case "etd":
          row.etd = parseDate(value) || undefined;
          break;
        case "pre_alert_sent":
          row.pre_alert_sent = parseDate(value) || undefined;
          break;
        case "cargo_departed":
          row.cargo_departed = parseDate(value) || undefined;
          break;
        case "eta_ata":
          row.eta_ata = parseDate(value) || undefined;
          break;
        
        // Campos booleanos
        case "oea_cl_doc":
          row.oea_cl_doc = parseBoolean(value);
          break;
        case "accrual":
          row.accrual = parseBoolean(value);
          break;
        case "dep":
          row.dep = parseBoolean(value);
          break;
        
        // Campos de texto
        case "nome_analista":
          row.nome_analista = value != null ? String(value).trim() : undefined;
          break;
        case "customer_no":
          row.customer_no = value != null ? String(value).trim() : undefined;
          break;
        case "po":
          row.po = value != null ? String(value).trim() : undefined;
          break;
        case "hawb":
          row.hawb = value != null ? String(value).trim() : undefined;
          break;
        case "hbl":
          row.hbl = value != null ? String(value).trim() : undefined;
          break;
        case "master":
          row.master = value != null ? String(value).trim() : undefined;
          break;
        case "d_term":
          row.d_term = value != null ? String(value).trim() : undefined;
          break;
        case "pod_dn_available":
          row.pod_dn_available = value != null ? String(value).trim() : undefined;
          break;
        case "remarks":
          row.remarks = value != null ? String(value).trim() : undefined;
          break;
        case "customer_order":
          row.customer_order = value != null ? String(value).trim() : undefined;
          break;
        case "email_title":
          row.email_title = value != null ? String(value).trim() : undefined;
          break;
        case "te":
          row.te = value != null ? String(value).trim() : undefined;
          break;
        case "at":
          row.at = value != null ? String(value).trim() : undefined;
          break;
        case "wh_treatment":
          row.wh_treatment = value != null ? String(value).trim() : undefined;
          break;
        case "cct_transm":
          row.cct_transm = value != null ? String(value).trim() : undefined;
          break;
      }
    }
    
    // Validar linha - aceitar HAWB (air), HBL (sea) ou Master
    const hawbValue = row.hawb?.trim();
    const hblValue = row.hbl?.trim();
    const masterValue = row.master?.trim();
    
    if (!hawbValue && !hblValue && !masterValue) {
      errors.push({
        row: rowNumber,
        message: "HAWB, HBL ou MASTER deve estar preenchido",
      });
    }
    
    rows.push(row);
  }
  
  return { rows, errors };
}
