/**
 * xlsxExtractor.ts — Programmatic XLSX → Structured JSON extractor
 * Replaces the old extractXlsxText() that truncated data.
 * Processes ALL rows without character limits.
 */

// ============ TYPES ============

export interface ExporterData {
  name: string;
  invoice_numbers: string[];
  gross_weight_kg: number;
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
    'total gross weight', 'gross weight', 'weight after weighting', 'gross wt', 'gw',
    'peso bruto', 'peso bruto total', 'bruttogewicht', 'brutto', 'brutto gewicht',
    'brutto kg', 'total weight', 'weight kg', 'gesamtgewicht', 'weight',
    'gross weight kg', 'gross weight kgs', 'g.w.', 'g.w', 'peso bruto kg',
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
    supplier: -1, gross_weight: -1, net_weight: -1, cbm: -1,
    ncm: -1, hs_code: -1, packages_qty: -1, packages_type: -1,
    invoice_ref: -1, description: -1, container: -1, seal: -1, cnpj: -1,
  };

  const normalizedHeaders = headers.map(normalizeHeader);

  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (let i = 0; i < normalizedHeaders.length; i++) {
      const nh = normalizedHeaders[i];
      // Exact match
      if (aliases.includes(nh)) {
        (map as any)[field] = i;
        break;
      }
      // Partial match (header contains alias or alias contains header)
      const found = aliases.find(a => (nh.includes(a) && a.length >= 3) || (a.includes(nh) && nh.length >= 4));
      if (found) {
        (map as any)[field] = i;
        break;
      }
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

    console.log(`📊 [XLSX Extractor] Sheet "${sheetName}" RAW HEADERS: [${headers.join(' | ')}]`);
    console.log(`📊 [XLSX Extractor] Sheet "${sheetName}": ${rows.length - headerRowIdx - 1} data rows, supplier col: ${colMap.supplier}, weight col: ${colMap.gross_weight}, ncm col: ${colMap.ncm}, desc col: ${colMap.description}`);

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
      const netWeight = colMap.net_weight >= 0 ? parseNumber(row[colMap.net_weight]) : 0;
      const cbm = colMap.cbm >= 0 ? parseNumber(row[colMap.cbm]) : 0;
      const packagesQty = colMap.packages_qty >= 0 ? parseNumber(row[colMap.packages_qty]) : 0;
      const packagesType = colMap.packages_type >= 0 ? parseString(row[colMap.packages_type]) : '';
      const invoiceRef = colMap.invoice_ref >= 0 ? parseString(row[colMap.invoice_ref]) : '';
      const description = colMap.description >= 0 ? parseString(row[colMap.description]) : '';
      const container = colMap.container >= 0 ? parseString(row[colMap.container]) : '';
      const seal = colMap.seal >= 0 ? parseString(row[colMap.seal]) : '';
      const cnpj = colMap.cnpj >= 0 ? parseString(row[colMap.cnpj]) : '';

      // Extract NCM from both NCM and HS Code columns, accept 4/6/8 digits
      const ncmFromNcmCol = colMap.ncm >= 0 ? extractNcmCodes(row[colMap.ncm]) : [];
      const ncmFromHsCol = colMap.hs_code >= 0 ? extractNcmCodes(row[colMap.hs_code]) : [];
      const ncmCodes = [...new Set([...ncmFromNcmCol, ...ncmFromHsCol])];

      // Debug: log first 5 data rows
      if (totalRowsProcessed <= 5) {
        console.log(`📊 [XLSX Extractor] Row ${r}: supplier="${supplierName}", weight=${grossWeight}, cbm=${cbm}, pkgs=${packagesQty}, ncm=[${ncmCodes.join(',')}], desc="${description.substring(0, 50)}"`);
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
  let totalGross = 0, totalNet = 0, totalCbm = 0, totalPkgs = 0;
  for (const exp of exporters) {
    totalGross += exp.gross_weight_kg;
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
