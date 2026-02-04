import * as XLSX from "xlsx";

// Reutilizar constantes do parseExcelMaster
export const ACCEPTED_EXTENSIONS = [".xlsx", ".xls", ".xlsm", ".xlsb", ".csv", ".ods"];
export const ACCEPT_STRING = ".xlsx,.xls,.xlsm,.xlsb,.csv,.ods";

// Colunas do banco para Clientes Base
export const CLIENTES_BASE_COLUMNS = [
  "ativo",
  "classificacao",
  "cod_rm",
  "dchr_customer_number",
  "cnpj",
  "nome_cliente",
  "cidade_uf",
  "pais",
  "logradouro",
  "cep",
  "info_complementar",
];

// Aliases de colunas do Excel → banco de dados
const CLIENTES_BASE_ALIASES: Record<string, string[]> = {
  ativo: ["ativo", "status", "active"],
  classificacao: ["classificacao", "classificação", "categoria", "classification"],
  cod_rm: ["cod_rm", "cód_rm", "codigo_rm", "rm", "rm_code"],
  dchr_customer_number: [
    "dchr_customer_number", "dchr customer number", "customer_number", 
    "customer_no", "customer no", "numero_cliente", "numero cliente"
  ],
  cnpj: ["cnpj", "cnpj_cliente", "documento", "document"],
  nome_cliente: [
    "nome_cliente", "nome_do_cliente", "nome do cliente", "cliente", 
    "razao_social", "razão_social", "razao social", "company_name", "nome"
  ],
  cidade_uf: ["cidade_uf", "cidade / uf", "cidade_uf", "city_state", "cidade", "uf"],
  pais: ["pais", "país", "country"],
  logradouro: ["logradouro", "endereco", "endereço", "address", "rua"],
  cep: ["cep", "postal_code", "zip", "zipcode", "codigo_postal"],
  info_complementar: [
    "info_complementar", "informacao_complementar", "informação complementar",
    "complemento", "obs", "observacao", "observação", "notes", "observações"
  ],
};

export interface ClienteBaseRow {
  ativo?: number | null;           // tinyint(1)
  classificacao?: string;          // varchar(50)
  cod_rm?: number | null;          // int
  dchr_customer_number?: string;   // varchar(50)
  cnpj?: string;                   // varchar(20)
  nome_cliente?: string;           // varchar(200)
  cidade_uf?: string;              // varchar(50)
  pais?: string;                   // varchar(50)
  logradouro?: string;             // varchar(200)
  cep?: string;                    // varchar(15)
  info_complementar?: string;      // varchar(255)
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

export interface ParseClientesBaseResult {
  success: boolean;
  rows: ClienteBaseRow[];
  columnMappings: ColumnMapping[];
  unmappedColumns: string[];
  errors: ParseValidationError[];
  totalRows: number;
  previewRows: ClienteBaseRow[];
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
  // Prioridade 1: Correspondência exata com CLIENTES_BASE_COLUMNS
  if (CLIENTES_BASE_COLUMNS.includes(normalizedHeader)) {
    return normalizedHeader;
  }
  
  // Prioridade 2: Correspondência exata com aliases
  for (const [dbCol, aliases] of Object.entries(CLIENTES_BASE_ALIASES)) {
    for (const alias of aliases) {
      const normalizedAlias = normalizeColumnName(alias);
      if (normalizedHeader === normalizedAlias) {
        return dbCol;
      }
    }
  }
  
  // Prioridade 3: Header começa com nome do campo
  for (const [dbCol, aliases] of Object.entries(CLIENTES_BASE_ALIASES)) {
    for (const alias of aliases) {
      const normalizedAlias = normalizeColumnName(alias);
      if (normalizedHeader.startsWith(normalizedAlias) && normalizedAlias.length >= 3) {
        return dbCol;
      }
    }
  }
  
  // Prioridade 4: Header contém nome do campo (ou vice-versa)
  for (const [dbCol, aliases] of Object.entries(CLIENTES_BASE_ALIASES)) {
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
 * Converte valor para booleano (0 ou 1)
 */
export function parseBoolean(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  
  if (typeof value === "number") {
    return value === 0 ? 0 : 1;
  }
  
  const str = String(value).toLowerCase().trim();
  if (["1", "true", "sim", "yes", "ok", "s", "y", "x", "ativo", "active"].includes(str)) return 1;
  if (["0", "false", "nao", "não", "no", "n", "", "inativo", "inactive"].includes(str)) return 0;
  
  return null;
}

/**
 * Converte valor para inteiro (para cod_rm)
 */
export function parseInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  
  if (typeof value === "number") {
    return Math.floor(value);
  }
  
  const str = String(value).trim();
  const parsed = parseInt(str, 10);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Limpa texto preservando zeros à esquerda (para CNPJ, CEP)
 */
export function cleanText(value: unknown, maxLength?: number): string | undefined {
  if (value === null || value === undefined) return undefined;
  
  let str = String(value).trim();
  
  // Remove espaços extras
  str = str.replace(/\s+/g, " ");
  
  // Limita tamanho se especificado
  if (maxLength && str.length > maxLength) {
    str = str.substring(0, maxLength);
  }
  
  return str || undefined;
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
 * Verifica se uma linha é de resumo/total (Grand Summary, etc.) que deve ser ignorada
 */
function isSummaryRow(row: Record<string, unknown>): boolean {
  const summaryPatterns = [
    /grand\s*summary/i,
    /^total$/i,
    /^subtotal$/i,
    /^sum$/i,
  ];
  
  return Object.values(row).some((v) => {
    if (typeof v === "string") {
      return summaryPatterns.some((pattern) => pattern.test(v.trim()));
    }
    return false;
  });
}

/**
 * Parse arquivo Excel e retorna dados estruturados para Clientes Base
 */
export async function parseExcelClientesBaseFile(
  file: File
): Promise<ParseClientesBaseResult> {
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
          raw: false, // Importante: preserva valores como strings para CNPJ/CEP
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
        console.log("[parseExcelClientesBase] Headers detectados:", excelHeaders);
        console.log("[parseExcelClientesBase] Headers normalizados:", excelHeaders.map(h => `${h} → ${normalizeColumnName(h)}`));
        
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
        
        // Processar linhas
        const rows: ClienteBaseRow[] = [];
        const errors: ParseValidationError[] = [];
        
        for (let i = 0; i < rawRows.length; i++) {
          const rawRow = rawRows[i];
          const rowNumber = i + 2; // +2 porque linha 1 é header
          
          // Ignorar linhas vazias ou de resumo
          if (isEmptyRow(rawRow) || isSummaryRow(rawRow)) continue;
          
          const row: ClienteBaseRow = {};
          
          // Mapear valores
          for (const mapping of columnMappings) {
            const value = rawRow[mapping.originalHeader];
            
            switch (mapping.dbColumn) {
              case "ativo":
                row.ativo = parseBoolean(value);
                break;
              case "cod_rm":
                row.cod_rm = parseInteger(value);
                break;
              case "classificacao":
                row.classificacao = cleanText(value, 50);
                break;
              case "dchr_customer_number":
                row.dchr_customer_number = cleanText(value, 50);
                break;
              case "cnpj":
                row.cnpj = cleanText(value, 20);
                break;
              case "nome_cliente":
                row.nome_cliente = cleanText(value, 200);
                break;
              case "cidade_uf":
                row.cidade_uf = cleanText(value, 50);
                break;
              case "pais":
                row.pais = cleanText(value, 50);
                break;
              case "logradouro":
                row.logradouro = cleanText(value, 200);
                break;
              case "cep":
                row.cep = cleanText(value, 15);
                break;
              case "info_complementar":
                row.info_complementar = cleanText(value, 255);
                break;
            }
          }
          
          // Validação obrigatória: nome_cliente + (cnpj OU dchr_customer_number)
          const hasNomeCliente = row.nome_cliente && row.nome_cliente.trim().length > 0;
          const hasIdentificador = (row.cnpj && row.cnpj.trim().length > 0) || 
                                   (row.dchr_customer_number && row.dchr_customer_number.trim().length > 0);
          
          if (!hasNomeCliente) {
            errors.push({
              row: rowNumber,
              message: "Campo 'nome_cliente' é obrigatório"
            });
          } else if (!hasIdentificador) {
            errors.push({
              row: rowNumber,
              message: "É necessário CNPJ ou Customer Number"
            });
          }
          
          // Se ativo não foi definido, assume 1 (ativo)
          if (row.ativo === null || row.ativo === undefined) {
            row.ativo = 1;
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
