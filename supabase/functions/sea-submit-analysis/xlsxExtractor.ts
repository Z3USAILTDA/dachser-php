/**
 * xlsxExtractor.ts — XLSX → Structured JSON extractor
 * Supports both programmatic extraction and LLM-based extraction via Claude.
 * Processes ALL rows without character limits.
 */

// ============ TYPES ============

export interface ExporterData {
  name: string;
  invoice_numbers: string[];
  gross_weight_kg: number;
  weighed_weight_kg: number;
  net_weight_kg: number;
  cbm: number;
  packages: { qty: number; type: string };
  ncm_codes: string[];
  container: string;
  seal: string;
  cnpj: string;
  items: ExporterItem[];
}

export interface ExporterItem {
  description: string;
  gross_weight_kg: number;
  weighed_weight_kg: number;
  net_weight_kg: number;
  cbm: number;
  packages_qty: number;
  packages_type: string;
  ncm_codes: string[];
  invoice_ref: string;
  extra_columns: Record<string, string>;
}

export interface ManifestData {
  exporters: ExporterData[];
  totals: {
    gross_weight_kg: number;
    weighed_weight_kg: number;
    net_weight_kg: number;
    cbm: number;
    packages: number;
    ncm_codes: string[];
  };
  container: string;
  seal: string;
  raw_headers: string[];
  sheet_names: string[];
  total_rows: number;
}

// ============ COLUMN MAPPING ============

interface ColumnMap {
  supplier: number;
  gross_weight: number;
  weighed_weight: number;
  net_weight: number;
  cbm: number;
  ncm: number;
  hs_code: number;
  packages_qty: number;
  packages_type: number;
  invoice_ref: number;
  description: number;
  container: number;
  seal: number;
  cnpj: number;
}

const COLUMN_ALIASES: Record<keyof ColumnMap, string[]> = {
  supplier: [
    'supplier name', 'supplier', 'exporter', 'shipper', 'exportador', 'fornecedor',
    'lieferant', 'lieferantenname', 'absender', 'sender', 'vendor', 'vendor name',
    'hersteller', 'manufacturer', 'company', 'company name', 'firm', 'firma',
    'remetente', 'expedidor', 'consignor',
  ],
  gross_weight: [
    'total gross weight', 'gross weight', 'gross wt', 'gw',
    'peso bruto', 'peso bruto total', 'bruttogewicht', 'brutto', 'brutto gewicht',
    'brutto kg', 'total weight', 'weight kg', 'gesamtgewicht', 'weight',
    'gross weight kg', 'gross weight kgs', 'g.w.', 'g.w', 'peso bruto kg',
  ],
  weighed_weight: [
    'weighed weight', 'weight after weighting', 'weighted weight', 'peso aferido',
    'peso pesado', 'peso balanca', 'peso balança', 'verified weight', 'actual weight',
    'peso conferido', 'peso real',
  ],
  net_weight: [
    'net weight', 'nett weight', 'net wt', 'nw', 'peso liquido',
    'nettogewicht', 'netto', 'netto gewicht', 'netto kg', 'n.w.', 'n.w',
    'peso liquido kg', 'net weight kg', 'net weight kgs',
  ],
  cbm: [
    'cbm', 'cbm [m³]', 'cbm [m3]', 'measurement', 'volume m3', 'cubagem',
    'volumen', 'volume', 'kubikmeter', 'm3', 'cubic meter', 'cubic metres',
    'metragem cubica', 'medida', 'cbm m3',
  ],
  ncm: [
    'ncm code', 'ncm', 'código ncm', 'codigo ncm', 'ncm-code',
    'ncm nr', 'ncm code 8 digits', 'ncm 8', 'codigo ncm 8',
  ],
  hs_code: [
    'hs code', 'hs', 'hs-code', 'h.s.', 'hs code 6 digits',
    'harmonized code', 'harmonized system',
    'tariff code', 'tariff', 'taric', 'warentarifnummer', 'zolltarif',
  ],
  packages_qty: [
    'qty packages', 'packages', 'qty', 'quantity', 'volumes', 'no. of packages',
    'number of packages', 'anzahl', 'stueck', 'stuck', 'pcs', 'colli', 'collis',
    'no of packages', 'package qty', 'qtd', 'qtde', 'quantidade',
    'number of cartons', 'cartons', 'pieces', 'units',
  ],
  packages_type: [
    'kind of packaging', 'packaging', 'packing type', 'package type', 'tipo embalagem',
    'verpackungsart', 'art der verpackung', 'pack type', 'embalagem', 'tipo de embalagem',
  ],
  invoice_ref: [
    'delivery note', 'reference', 'invoice', 'invoice no', 'invoice number', 'ref',
    'referencia', 'lieferschein', 'rechnung', 'bestellnummer', 'order', 'order no',
    'order number', 'po', 'po number', 'auftrags nr', 'auftragsnummer',
    'nota fiscal', 'nf', 'invoice ref', 'delivery note no',
  ],
  description: [
    'description', 'product description', 'goods description', 'descricao', 'commodity',
    'bezeichnung', 'beschreibung', 'waren', 'warenbezeichnung', 'article',
    'artikelbeschreibung', 'material', 'item description', 'goods', 'product',
    'descricao do produto', 'mercadoria',
  ],
  container: [
    'container', 'container no', 'container number', 'container no.',
    'container nr', 'container id', 'behaelter', 'contentor', 'contenedor',
  ],
  seal: [
    'seal', 'seal no', 'seal number', 'seal no.', 'lacre',
    'plombe', 'siegelnummer', 'plombennummer', 'seal nr', 'numero do lacre',
  ],
  cnpj: [
    'vat no.', 'vat no', 'cnpj', 'tax id', 'cnpj/cpf',
    'steuernummer', 'ust id', 'vat', 'vat number', 'tax number',
    'cpf/cnpj', 'cnpj/cpf do importador',
  ],
};

function normalizeHeader(h: string): string {
  return h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function mapColumns(headers: string[]): ColumnMap {
  const map: ColumnMap = {
    supplier: -1, gross_weight: -1, weighed_weight: -1, net_weight: -1, cbm: -1,
    ncm: -1, hs_code: -1, packages_qty: -1, packages_type: -1,
    invoice_ref: -1, description: -1, container: -1, seal: -1, cnpj: -1,
  };

  const normalizedHeaders = headers.map(normalizeHeader);
  const usedColumns = new Set<number>();

  // Pass 1: Exact matches only (highest priority)
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (let i = 0; i < normalizedHeaders.length; i++) {
      if (usedColumns.has(i)) continue;
      if (aliases.includes(normalizedHeaders[i])) {
        (map as any)[field] = i;
        usedColumns.add(i);
        break;
      }
    }
  }

  // Pass 2: Best partial match for fields still unmapped
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    if ((map as any)[field] >= 0) continue; // already mapped in Pass 1
    let bestCol = -1;
    let bestAliasLen = 0;
    for (let i = 0; i < normalizedHeaders.length; i++) {
      if (usedColumns.has(i)) continue;
      const nh = normalizedHeaders[i];
      // Find the longest alias that partial-matches this header
      for (const a of aliases) {
        const isMatch = (nh.includes(a) && a.length >= 3) || (a.includes(nh) && nh.length >= 4);
        if (isMatch && a.length > bestAliasLen) {
          bestAliasLen = a.length;
          bestCol = i;
        }
      }
    }
    if (bestCol >= 0) {
      (map as any)[field] = bestCol;
      usedColumns.add(bestCol);
    }
  }

  return map;
}

// ============ VALUE PARSERS ============

function parseNumber(val: any): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return val;
  const s = String(val).trim();
  if (s === '' || s === '-') return 0;

  // Handle European/US locale: e.g. "1.980,000" or "1,980.000"
  const hasDot = s.includes('.');
  const hasComma = s.includes(',');

  let cleaned = s.replace(/[^0-9.,\-]/g, '');
  if (hasDot && hasComma) {
    const lastDot = cleaned.lastIndexOf('.');
    const lastComma = cleaned.lastIndexOf(',');
    if (lastComma > lastDot) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (hasComma) {
    const parts = cleaned.split(',');
    if (parts.length === 2 && parts[1].length === 3) {
      cleaned = cleaned.replace(',', '');
    } else {
      cleaned = cleaned.replace(',', '.');
    }
  }

  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parseString(val: any): string {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

function isSkipRow(row: any[]): boolean {
  const joined = row.map(c => String(c || '').trim()).join(' ').toLowerCase();
  const skipPatterns = [
    'grand summary', 'grand total', 'total:', 'subtotal', 'sum:',
    'total gross', 'total net', 'total cbm',
  ];
  return skipPatterns.some(p => joined.includes(p));
}

function normalizeNcm(code: string): string {
  return code.replace(/[\.\-\s\/]/g, '').trim();
}

function extractNcmCodes(val: any): string[] {
  const s = parseString(val);
  if (!s) return [];
  // Split by comma, semicolon, space, or newline
  const parts = s.split(/[,;\s\n]+/).map(p => normalizeNcm(p)).filter(p => /^\d{4}$/.test(p) || /^\d{6}$/.test(p) || /^\d{8}$/.test(p));
  return parts;
}

// ============ HEADER SCORING ============

function scoreHeaderRow(row: any[]): number {
  let score = 0;
  const allAliases = Object.values(COLUMN_ALIASES).flat();
  for (const cell of row) {
    const nh = normalizeHeader(String(cell || ''));
    if (!nh) continue;
    // Exact match
    if (allAliases.includes(nh)) { score++; continue; }
    // Partial match
    const found = allAliases.find(a => (nh.includes(a) && a.length >= 3) || (a.includes(nh) && nh.length >= 4));
    if (found) { score++; }
  }
  return score;
}

// ============ MAIN EXTRACTOR ============

export async function extractXlsxStructured(fileUrl: string, fileName: string): Promise<ManifestData> {
  console.log(`📊 [XLSX Extractor] Starting structured extraction: ${fileName}`);
  const startTime = Date.now();

  const response = await fetch(fileUrl);
  if (!response.ok) throw new Error(`Failed to fetch XLSX: ${response.statusText}`);

  let arrayBuffer: ArrayBuffer | null = await response.arrayBuffer();
  const fileSizeKB = Math.round(arrayBuffer.byteLength / 1024);
  console.log(`📊 [XLSX Extractor] File: ${fileSizeKB} KB`);

  const XLSX = await import('https://esm.sh/xlsx@0.18.5');
  
  // Read ALL rows (no truncation)
  const workbook = XLSX.read(arrayBuffer, {
    type: 'array',
    cellFormula: false,
    cellStyles: false,
    cellNF: false,
    cellDates: false,
    dense: true,
  });

  // Free memory
  // @ts-ignore
  arrayBuffer = null;

  const skipPatterns = ['instruction', 'info', 'guide', 'readme', 'help', 'template'];
  const sheetsToProcess = workbook.SheetNames.filter(
    (name: string) => !skipPatterns.some(p => name.toLowerCase().includes(p))
  );

  console.log(`📊 [XLSX Extractor] ${sheetsToProcess.length} sheets: ${sheetsToProcess.join(', ')}`);

  let allHeaders: string[] = [];
  let totalRowsProcessed = 0;
  const exporterMap = new Map<string, ExporterData>();
  let globalContainer = '';
  let globalSeal = '';

  for (const sheetName of sheetsToProcess) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    // Convert to array of arrays
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });
    if (rows.length < 2) continue;

    // Find header row using intelligent scoring against known aliases
    let headerRowIdx = 0;
    let bestScore = 0;
    let fallbackIdx = -1;
    for (let i = 0; i < Math.min(rows.length, 20); i++) {
      const nonEmpty = rows[i].filter((c: any) => String(c || '').trim() !== '').length;
      if (nonEmpty >= 3) {
        if (fallbackIdx < 0) fallbackIdx = i;
        const score = scoreHeaderRow(rows[i]);
        if (score > bestScore) {
          bestScore = score;
          headerRowIdx = i;
        }
      }
    }
    if (bestScore < 2 && fallbackIdx >= 0) {
      headerRowIdx = fallbackIdx;
      console.log(`⚠️ [XLSX Extractor] Sheet "${sheetName}": Low header score (${bestScore}), using fallback row ${fallbackIdx}`);
    } else {
      console.log(`📊 [XLSX Extractor] Sheet "${sheetName}": Header row=${headerRowIdx}, score=${bestScore}`);
    }

    const headers = rows[headerRowIdx].map((h: any) => String(h || ''));
    allHeaders = [...new Set([...allHeaders, ...headers.filter((h: string) => h.trim())])];
    const colMap = mapColumns(headers);
    // Pass 2 map: NCM only from NCM column (no HS Code fallback)
    const colMapNcmOnly = { ...colMap, hs_code: -1 };

    console.log(`📊 [XLSX Extractor] Sheet "${sheetName}" RAW HEADERS: [${headers.join(' | ')}]`);
    console.log(`📊 [XLSX Extractor] Sheet "${sheetName}": ${rows.length - headerRowIdx - 1} data rows, supplier col: ${colMap.supplier}, weight col: ${colMap.gross_weight}, weighed_weight col: ${colMap.weighed_weight}, cbm col: ${colMap.cbm}, ncm col: ${colMap.ncm}, hs_code col: ${colMap.hs_code}, desc col: ${colMap.description}`);

    // Determine fallback grouping column when supplier is not found
    const useSupplierCol = colMap.supplier >= 0;
    const useDescriptionFallback = !useSupplierCol && colMap.description >= 0;
    if (!useSupplierCol) {
      console.log(`⚠️ [XLSX Extractor] No supplier column found! ${useDescriptionFallback ? 'Using description as fallback grouping key' : 'Aggregating all rows into single exporter'}`);
    }

    // Process data rows
    for (let r = headerRowIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length === 0) continue;
      if (isSkipRow(row)) continue;

      // Increment AFTER filtering (not before)
      totalRowsProcessed++;
      // Determine row grouping key: supplier > description > fallback
      let supplierName = '';
      if (useSupplierCol) {
        supplierName = parseString(row[colMap.supplier]);
      } else if (useDescriptionFallback) {
        supplierName = parseString(row[colMap.description]);
      }
      if (!supplierName) {
        supplierName = 'UNKNOWN EXPORTER';
      }

      const grossWeight = colMap.gross_weight >= 0 ? parseNumber(row[colMap.gross_weight]) : 0;
      const weighedWeight = colMap.weighed_weight >= 0 ? parseNumber(row[colMap.weighed_weight]) : 0;
      const netWeight = colMap.net_weight >= 0 ? parseNumber(row[colMap.net_weight]) : 0;
      const cbm = colMap.cbm >= 0 ? parseNumber(row[colMap.cbm]) : 0;
      const packagesQty = colMap.packages_qty >= 0 ? parseNumber(row[colMap.packages_qty]) : 0;
      const packagesType = colMap.packages_type >= 0 ? parseString(row[colMap.packages_type]) : '';
      const invoiceRef = colMap.invoice_ref >= 0 ? parseString(row[colMap.invoice_ref]) : '';
      const description = colMap.description >= 0 ? parseString(row[colMap.description]) : '';
      const container = colMap.container >= 0 ? parseString(row[colMap.container]) : '';
      const seal = colMap.seal >= 0 ? parseString(row[colMap.seal]) : '';
      const cnpj = colMap.cnpj >= 0 ? parseString(row[colMap.cnpj]) : '';

      // PASS 1: All fields (supplier, weight, cbm, etc.) use colMap — already extracted above
      // PASS 2: NCM codes ONLY from NCM column, ignoring HS Code (correct extraction)
      const ncmCodes = colMapNcmOnly.ncm >= 0 ? extractNcmCodes(row[colMapNcmOnly.ncm]) : [];

      // Debug: log first 5 data rows
      if (totalRowsProcessed <= 5) {
        console.log(`📊 [XLSX Extractor] Row ${r}: supplier="${supplierName}", weight=${grossWeight}, weighedWeight=${weighedWeight}, cbm=${cbm}, pkgs=${packagesQty}, ncm=[${ncmCodes.join(',')}], desc="${description.substring(0, 50)}"`);
      }

      // Capture global container/seal
      if (container && !globalContainer) {
        const isoMatch = container.match(/[A-Z]{4}\d{7}/);
        if (isoMatch) globalContainer = isoMatch[0];
      }
      if (seal && !globalSeal) globalSeal = seal;

      // Aggregate by supplier
      const key = supplierName.toUpperCase().trim();
      if (!exporterMap.has(key)) {
        exporterMap.set(key, {
          name: supplierName,
          invoice_numbers: [],
          gross_weight_kg: 0,
          weighed_weight_kg: 0,
          net_weight_kg: 0,
          cbm: 0,
          packages: { qty: 0, type: '' },
          ncm_codes: [],
          container: container,
          seal: seal,
          cnpj: cnpj,
          items: [],
        });
      }

      const exporter = exporterMap.get(key)!;
      exporter.gross_weight_kg += grossWeight;
      exporter.weighed_weight_kg += weighedWeight;
      exporter.net_weight_kg += netWeight;
      exporter.cbm += cbm;
      exporter.packages.qty += packagesQty;
      if (packagesType && !exporter.packages.type) exporter.packages.type = packagesType;
      if (invoiceRef && !exporter.invoice_numbers.includes(invoiceRef)) {
        exporter.invoice_numbers.push(invoiceRef);
      }
      for (const ncm of ncmCodes) {
        if (!exporter.ncm_codes.includes(ncm)) {
          exporter.ncm_codes.push(ncm);
        }
      }
      if (cnpj && !exporter.cnpj) exporter.cnpj = cnpj;
      if (container && !exporter.container) exporter.container = container;
      if (seal && !exporter.seal) exporter.seal = seal;

      // Capture unmapped columns
      const mappedIndices = new Set(Object.values(colMap).filter(v => v >= 0));
      const extraCols: Record<string, string> = {};
      for (let c = 0; c < headers.length; c++) {
        if (!mappedIndices.has(c) && headers[c].trim()) {
          const val = parseString(row[c]);
          if (val) extraCols[headers[c].trim()] = val;
        }
      }

      exporter.items.push({
        description,
        gross_weight_kg: grossWeight,
        weighed_weight_kg: weighedWeight,
        net_weight_kg: netWeight,
        cbm,
        packages_qty: packagesQty,
        packages_type: packagesType,
        ncm_codes: ncmCodes,
        invoice_ref: invoiceRef,
        extra_columns: extraCols,
      });
    }
  }

  const exporters = Array.from(exporterMap.values());

  // Calculate totals
  const allNcms: string[] = [];
  let totalGross = 0, totalWeighed = 0, totalNet = 0, totalCbm = 0, totalPkgs = 0;
  for (const exp of exporters) {
    totalGross += exp.gross_weight_kg;
    totalWeighed += exp.weighed_weight_kg;
    totalNet += exp.net_weight_kg;
    totalCbm += exp.cbm;
    totalPkgs += exp.packages.qty;
    for (const ncm of exp.ncm_codes) {
      if (!allNcms.includes(ncm)) allNcms.push(ncm);
    }
  }

  const elapsed = Date.now() - startTime;
  console.log(`📊 [XLSX Extractor] Done: ${exporters.length} exporters, ${totalRowsProcessed} rows, ${allNcms.length} unique NCMs in ${elapsed}ms`);

  return {
    exporters,
    totals: {
      gross_weight_kg: Math.round(totalGross * 1000) / 1000,
      weighed_weight_kg: Math.round(totalWeighed * 1000) / 1000,
      net_weight_kg: Math.round(totalNet * 1000) / 1000,
      cbm: Math.round(totalCbm * 1000) / 1000,
      packages: totalPkgs,
      ncm_codes: allNcms.sort(),
    },
    container: globalContainer,
    seal: globalSeal,
    raw_headers: allHeaders,
    sheet_names: sheetsToProcess,
    total_rows: totalRowsProcessed,
  };
}

// ============ LLM-BASED EXTRACTION ============

const LLM_EXTRACTION_PROMPT = `You will receive data from a maritime cargo manifest in CSV format.
Extract the following structured data as JSON. Be extremely precise with field mapping — read the actual column headers carefully.

For each unique exporter/supplier, return:
- name: the supplier/exporter company name (look for columns like "Supplier Name", "Exporter", "Shipper" — NOT "Supplier Country" or "Supplier Code")
- invoice_numbers: list of delivery note/invoice references
- gross_weight_kg: total gross weight in kg (numeric, already converted)
- weighed_weight_kg: total weighed/verified weight in kg (look for columns like "Weighed Weight", "Weight After Weighting", "Verified Weight", "Actual Weight"). If no such column exists, set to 0.
- net_weight_kg: total net weight in kg (numeric, already converted)
- cbm: total volume in cubic meters (numeric). This is the VOLUME measurement (m³), NOT weight. Look for columns labeled "CBM", "CBM [m³]", "Measurement", "Volume m3", "Cubagem". Do NOT confuse with weight or quantity columns.
- packages: { qty: number of packages, type: packaging type string }
- container: container number if present in the row
- seal: seal number if present in the row
- cnpj: VAT/tax ID if present
- items: array of line items, each with:
  - description: the product/goods description (look for columns like "Description", "Product Description", "Part Description" — NOT "QTY Material" or quantity columns)
  - gross_weight_kg: item gross weight in kg
  - weighed_weight_kg: item weighed/verified weight in kg (look for columns like "Weighed Weight", "Weight After Weighting", "Verified Weight", "Actual Weight"). If no such column exists, set to 0.
  - net_weight_kg: item net weight in kg
  - cbm: item volume in cubic meters (m³). This is the VOLUME measurement, NOT weight. Look for columns labeled "CBM", "CBM [m³]", "Measurement", "Volume m3", "Cubagem". Do NOT confuse with weight or quantity columns.
  - packages_qty: number of packages for this item
  - packages_type: packaging type for this item
  - invoice_ref: delivery note / invoice reference for this item

Also extract global data:
- container: container number in ISO format (4 letters + 7 digits, e.g., TCNU2673243)
- seal: seal number

IMPORTANT RULES:
1. DO NOT extract NCM codes — they will be added separately via programmatic extraction.
2. Aggregate numeric values (weight, cbm, packages) per supplier by summing all their rows.
3. Weights are in KG. If a value looks like it's in grams (e.g., 965226 for a single carton), convert to KG by dividing by 1000.
4. Skip summary/total rows (rows containing "Grand Total", "Subtotal", etc.).
5. Return ONLY valid JSON, no markdown, no explanation.

Return format:
{
  "exporters": [...],
  "container": "XXXX1234567",
  "seal": "seal_number"
}`;

export async function extractXlsxWithLLM(fileUrl: string, fileName: string): Promise<ManifestData> {
  console.log(`🤖 [XLSX LLM Extractor] Starting LLM-based extraction: ${fileName}`);
  const startTime = Date.now();

  const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
  if (!ANTHROPIC_API_KEY) {
    console.warn('⚠️ [XLSX LLM Extractor] No ANTHROPIC_API_KEY, falling back to programmatic extraction');
    return extractXlsxStructured(fileUrl, fileName);
  }

  // Step 1: Fetch and parse XLSX
  const response = await fetch(fileUrl);
  if (!response.ok) throw new Error(`Failed to fetch XLSX: ${response.statusText}`);

  let arrayBuffer: ArrayBuffer | null = await response.arrayBuffer();
  const fileSizeKB = Math.round(arrayBuffer.byteLength / 1024);
  console.log(`🤖 [XLSX LLM Extractor] File: ${fileSizeKB} KB`);

  const XLSX = await import('https://esm.sh/xlsx@0.18.5');
  const workbook = XLSX.read(arrayBuffer, {
    type: 'array',
    cellFormula: false,
    cellStyles: false,
    cellNF: false,
    cellDates: false,
    dense: true,
  });

  // @ts-ignore - free memory
  arrayBuffer = null;

  const skipPatterns = ['instruction', 'info', 'guide', 'readme', 'help', 'template'];
  const sheetsToProcess = workbook.SheetNames.filter(
    (name: string) => !skipPatterns.some(p => name.toLowerCase().includes(p))
  );

  // Step 2: Extract NCM codes programmatically (Pass 2 logic)
  const ncmBySupplier = new Map<string, string[]>();
  const allNcmCodes: string[] = [];
  let allHeaders: string[] = [];
  let totalRowsProcessed = 0;

  for (const sheetName of sheetsToProcess) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });
    if (rows.length < 2) continue;

    // Find header row
    let headerRowIdx = 0;
    let bestScore = 0;
    let fallbackIdx = -1;
    for (let i = 0; i < Math.min(rows.length, 20); i++) {
      const nonEmpty = rows[i].filter((c: any) => String(c || '').trim() !== '').length;
      if (nonEmpty >= 3) {
        if (fallbackIdx < 0) fallbackIdx = i;
        const score = scoreHeaderRow(rows[i]);
        if (score > bestScore) { bestScore = score; headerRowIdx = i; }
      }
    }
    if (bestScore < 2 && fallbackIdx >= 0) headerRowIdx = fallbackIdx;

    const headers = rows[headerRowIdx].map((h: any) => String(h || ''));
    allHeaders = [...new Set([...allHeaders, ...headers.filter((h: string) => h.trim())])];
    const colMap = mapColumns(headers);

    // Extract NCM only from NCM column (not HS Code)
    const ncmCol = colMap.ncm;
    const supplierCol = colMap.supplier >= 0 ? colMap.supplier : -1;

    if (ncmCol >= 0) {
      for (let r = headerRowIdx + 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length === 0 || isSkipRow(row)) continue;
        totalRowsProcessed++;

        const ncmCodes = extractNcmCodes(row[ncmCol]);
        if (ncmCodes.length > 0) {
          // Associate with supplier if possible
          const supplier = supplierCol >= 0 ? parseString(row[supplierCol]).toUpperCase().trim() : 'ALL';
          if (!ncmBySupplier.has(supplier)) ncmBySupplier.set(supplier, []);
          for (const ncm of ncmCodes) {
            if (!ncmBySupplier.get(supplier)!.includes(ncm)) ncmBySupplier.get(supplier)!.push(ncm);
            if (!allNcmCodes.includes(ncm)) allNcmCodes.push(ncm);
          }
        }
      }
    } else {
      for (let r = headerRowIdx + 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length === 0 || isSkipRow(row)) continue;
        totalRowsProcessed++;
      }
    }
  }

  console.log(`🤖 [XLSX LLM Extractor] NCM extracted programmatically: ${allNcmCodes.length} unique codes from ${totalRowsProcessed} rows`);

  // Step 3: Convert sheets to CSV text for Claude
  let csvText = '';
  for (const sheetName of sheetsToProcess) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const csv = XLSX.utils.sheet_to_csv(sheet, { FS: '\t', RS: '\n', blankrows: false });
    csvText += `=== Sheet: ${sheetName} ===\n${csv}\n\n`;
  }

  // Limit CSV size to avoid token limits (keep first ~80k chars)
  const maxChars = 80000;
  if (csvText.length > maxChars) {
    console.warn(`⚠️ [XLSX LLM Extractor] CSV text truncated from ${csvText.length} to ${maxChars} chars`);
    csvText = csvText.substring(0, maxChars) + '\n... [TRUNCATED]';
  }

  console.log(`🤖 [XLSX LLM Extractor] CSV text: ${csvText.length} chars, sending to Claude...`);

  // Step 4: Call Claude for structured extraction
  try {
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        messages: [
          {
            role: 'user',
            content: `${LLM_EXTRACTION_PROMPT}\n\n--- MANIFEST CSV DATA ---\n${csvText}`,
          },
        ],
      }),
    });

    if (!claudeResponse.ok) {
      const errText = await claudeResponse.text();
      console.error(`❌ [XLSX LLM Extractor] Claude API error ${claudeResponse.status}: ${errText}`);
      throw new Error(`Claude API error: ${claudeResponse.status}`);
    }

    const claudeResult = await claudeResponse.json();
    const responseText = claudeResult.content?.[0]?.text || '';
    console.log(`🤖 [XLSX LLM Extractor] Claude response: ${responseText.length} chars`);

    // Parse JSON from response (handle potential markdown wrapping)
    let jsonStr = responseText.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();
    // Also try to find raw JSON object
    if (!jsonStr.startsWith('{')) {
      const braceStart = jsonStr.indexOf('{');
      if (braceStart >= 0) jsonStr = jsonStr.substring(braceStart);
    }

    const parsed = JSON.parse(jsonStr);
    const llmExporters = parsed.exporters || [];
    const llmContainer = parsed.container || '';
    const llmSeal = parsed.seal || '';

    console.log(`🤖 [XLSX LLM Extractor] Claude extracted: ${llmExporters.length} exporters, container=${llmContainer}, seal=${llmSeal}`);

    // Step 5: Merge — add NCM codes to Claude's exporters
    const exporters: ExporterData[] = llmExporters.map((exp: any) => {
      const name = exp.name || 'UNKNOWN EXPORTER';
      const key = name.toUpperCase().trim();

      // Find NCM codes for this supplier
      let ncmCodes = ncmBySupplier.get(key) || [];
      if (ncmCodes.length === 0) {
        // Try partial match
        for (const [supplierKey, codes] of ncmBySupplier.entries()) {
          if (key.includes(supplierKey) || supplierKey.includes(key)) {
            ncmCodes = codes;
            break;
          }
        }
      }
      // Fallback: assign all NCM codes if only one exporter or no match found
      if (ncmCodes.length === 0 && (llmExporters.length === 1 || ncmBySupplier.size <= 1)) {
        ncmCodes = allNcmCodes;
      }

    const items: ExporterItem[] = (exp.items || []).map((item: any) => ({
        description: item.description || '',
        gross_weight_kg: item.gross_weight_kg || 0,
        weighed_weight_kg: item.weighed_weight_kg || 0,
        net_weight_kg: item.net_weight_kg || 0,
        cbm: item.cbm || 0,
        packages_qty: item.packages_qty || 0,
        packages_type: item.packages_type || '',
        ncm_codes: [], // NCM at exporter level, not item level
        invoice_ref: item.invoice_ref || '',
        extra_columns: {},
      }));

      return {
        name,
        invoice_numbers: exp.invoice_numbers || [],
        gross_weight_kg: exp.gross_weight_kg || 0,
        weighed_weight_kg: exp.weighed_weight_kg || 0,
        net_weight_kg: exp.net_weight_kg || 0,
        cbm: exp.cbm || 0,
        packages: { qty: exp.packages?.qty || 0, type: exp.packages?.type || '' },
        ncm_codes: ncmCodes,
        container: exp.container || llmContainer,
        seal: exp.seal || llmSeal,
        cnpj: exp.cnpj || '',
        items,
      };
    });

    // Calculate totals
    let totalGross = 0, totalWeighed = 0, totalNet = 0, totalCbm = 0, totalPkgs = 0;
    for (const exp of exporters) {
      totalGross += exp.gross_weight_kg;
      totalWeighed += exp.weighed_weight_kg;
      totalNet += exp.net_weight_kg;
      totalCbm += exp.cbm;
      totalPkgs += exp.packages.qty;
    }

    const elapsed = Date.now() - startTime;
    console.log(`🤖 [XLSX LLM Extractor] Done: ${exporters.length} exporters, ${allNcmCodes.length} NCMs, ${elapsed}ms`);

    return {
      exporters,
      totals: {
        gross_weight_kg: Math.round(totalGross * 1000) / 1000,
        weighed_weight_kg: Math.round(totalWeighed * 1000) / 1000,
        net_weight_kg: Math.round(totalNet * 1000) / 1000,
        cbm: Math.round(totalCbm * 1000) / 1000,
        packages: totalPkgs,
        ncm_codes: allNcmCodes.sort(),
      },
      container: llmContainer,
      seal: llmSeal,
      raw_headers: allHeaders,
      sheet_names: sheetsToProcess,
      total_rows: totalRowsProcessed,
    };
  } catch (llmError) {
    console.error(`❌ [XLSX LLM Extractor] LLM extraction failed, falling back to programmatic:`, llmError);
    return extractXlsxStructured(fileUrl, fileName);
  }
}
