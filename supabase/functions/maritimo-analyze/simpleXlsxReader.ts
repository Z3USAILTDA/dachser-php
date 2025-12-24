/**
 * XLSX text extraction - complete data extraction for maritime manifests
 * Enhanced NCM extraction for maritime analysis
 */

export interface XlsxReadResult {
  text: string;
  sheetCount: number;
  rowCount: number;
  readable: boolean;
  ncmCodes?: string[];  // Extracted NCM codes for debugging
  debugInfo?: string;   // Debug information about extraction
}

// Full extraction limits for complete manifest data
const MAX_SHEETS = 10;
const MAX_ROWS_PER_SHEET = 2000;
const MAX_TOTAL_CHARS = 200000;

/**
 * Extract NCM codes from text using various patterns
 */
function extractNCMCodes(text: string): string[] {
  const ncmPatterns = [
    /\b(\d{4}[\.\-\s]?\d{2}[\.\-\s]?\d{2}(?:[\.\-\s]?\d{2})?)\b/g, // 8-10 digit NCM with optional separators
    /\b(\d{8,10})\b/g, // Plain 8-10 digit numbers
    /NCM[:\s]*(\d{4,10})/gi, // After "NCM:" label
    /HS\s*CODE[:\s]*(\d{4,10})/gi, // HS Code variations
  ];
  
  const ncmSet = new Set<string>();
  
  for (const pattern of ncmPatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      // Clean the NCM code - remove dots, dashes, spaces
      const cleanNCM = match[1].replace(/[\.\-\s]/g, '');
      
      // Validate it looks like an NCM (4-10 digits starting with valid chapters)
      if (cleanNCM.length >= 4 && cleanNCM.length <= 10) {
        const chapter = parseInt(cleanNCM.substring(0, 2));
        // Valid HS chapters are 01-99
        if (chapter >= 1 && chapter <= 99) {
          ncmSet.add(cleanNCM);
        }
      }
    }
  }
  
  return Array.from(ncmSet).sort();
}

/**
 * Find columns that likely contain NCM data
 * PRIORITY: "NCM Code" columns take precedence over "HS Code" columns
 */
function findNCMColumns(headers: string[]): number[] {
  // Priority 1: Exact NCM columns (highest priority)
  const ncmPrimaryKeywords = ['ncm code', 'ncm_code', 'ncmcode', 'codigo ncm', 'código ncm', 'ncm'];
  // Priority 2: HS Code columns (only if no NCM columns found)
  const hsCodeKeywords = ['hscode', 'hs code', 'hs-code', 'hs_code', 'tariff', 'harmonized'];
  
  const ncmIndices: number[] = [];
  const hsIndices: number[] = [];
  
  headers.forEach((header, index) => {
    const lowerHeader = header.toLowerCase().trim();
    
    // Check for NCM-specific columns first
    if (ncmPrimaryKeywords.some(kw => lowerHeader.includes(kw) && !lowerHeader.includes('hs'))) {
      ncmIndices.push(index);
      console.log(`[XLSX] Found NCM column at index ${index}: "${header}"`);
    }
    // Check for HS Code columns separately
    else if (hsCodeKeywords.some(kw => lowerHeader.includes(kw))) {
      hsIndices.push(index);
      console.log(`[XLSX] Found HS Code column at index ${index}: "${header}"`);
    }
  });
  
  // Return NCM columns if found, otherwise fall back to HS Code columns
  if (ncmIndices.length > 0) {
    console.log(`[XLSX] Using NCM columns: ${ncmIndices.join(', ')}`);
    return ncmIndices;
  }
  
  if (hsIndices.length > 0) {
    console.log(`[XLSX] No NCM columns found, falling back to HS Code columns: ${hsIndices.join(', ')}`);
    return hsIndices;
  }
  
  console.log(`[XLSX] WARNING: No NCM or HS Code columns found in headers`);
  return [];
}

export async function extractXlsxText(fileUrl: string, fileName: string): Promise<XlsxReadResult> {
  console.log(`[XLSX] Extracting from: ${fileName}`);
  
  try {
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch XLSX: ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    
    // Import xlsx library
    const XLSX = await import('https://esm.sh/xlsx@0.18.5');
    
    // Read workbook
    const workbook = XLSX.read(arrayBuffer, { 
      type: 'array',
      sheetRows: MAX_ROWS_PER_SHEET + 1
    });
    
    console.log(`[XLSX] ${workbook.SheetNames.length} sheets found: ${workbook.SheetNames.join(', ')}`);
    
    // Prioritize NCM-related sheets first, then maritime-relevant sheets
    const highPriority = ['ncm', 'item', 'product', 'cargo', 'container', 'package', 'supplier', 'resumo', 'summary', 'dados', 'data'];
    const skipPatterns = ['instruction', 'info', 'guide', 'readme', 'help', 'template'];
    
    const sortedSheets = workbook.SheetNames
      .filter(name => !skipPatterns.some(p => name.toLowerCase().includes(p)))
      .sort((a, b) => {
        const aHasPriority = highPriority.some(p => a.toLowerCase().includes(p));
        const bHasPriority = highPriority.some(p => b.toLowerCase().includes(p));
        if (aHasPriority && !bHasPriority) return -1;
        if (!aHasPriority && bHasPriority) return 1;
        return 0;
      });
    
    const sheetsToProcess = sortedSheets.slice(0, MAX_SHEETS);
    console.log(`[XLSX] Processing sheets: ${sheetsToProcess.join(', ')}`);
    
    let fullText = '';
    let totalRows = 0;
    let allNCMCodes: string[] = [];
    let debugInfo: string[] = [];
    
    for (const sheetName of sheetsToProcess) {
      if (fullText.length >= MAX_TOTAL_CHARS) {
        console.log(`[XLSX] Char limit reached`);
        break;
      }
      
      const sheet = workbook.Sheets[sheetName];
      if (sheet) {
        // Get data as array of arrays for better NCM detection
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as string[][];
        
        if (data.length > 0) {
          // Check first row for headers
          const headers = data[0]?.map(h => String(h)) || [];
          const ncmColumnIndices = findNCMColumns(headers);
          
          if (ncmColumnIndices.length > 0) {
            debugInfo.push(`Sheet "${sheetName}": NCM columns found at indices ${ncmColumnIndices.join(', ')} (${ncmColumnIndices.map(i => headers[i]).join(', ')})`);
            
            // Extract NCMs from identified columns
            for (let rowIdx = 1; rowIdx < data.length && rowIdx <= MAX_ROWS_PER_SHEET; rowIdx++) {
              const row = data[rowIdx];
              if (row) {
                for (const colIdx of ncmColumnIndices) {
                  const cellValue = String(row[colIdx] || '').trim();
                  if (cellValue) {
                    const ncms = extractNCMCodes(cellValue);
                    allNCMCodes.push(...ncms);
                  }
                }
              }
            }
          }
          
          // Convert to CSV for full text extraction
          const csv = XLSX.utils.sheet_to_csv(sheet);
          const lines = csv.split('\n')
            .filter(line => line.trim().length > 0)
            .slice(0, MAX_ROWS_PER_SHEET);
          
          if (lines.length > 0) {
            const sheetText = `\n=== ${sheetName} ===\n${lines.join('\n')}`;
            const remainingChars = MAX_TOTAL_CHARS - fullText.length;
            fullText += sheetText.substring(0, remainingChars);
            totalRows += lines.length;
            
            // Also extract NCMs from full text as fallback
            const textNCMs = extractNCMCodes(sheetText);
            allNCMCodes.push(...textNCMs);
          }
          
          console.log(`[XLSX] "${sheetName}": ${lines.length} rows`);
        }
      }
    }
    
    // Deduplicate NCM codes
    const uniqueNCMs = [...new Set(allNCMCodes)].sort();
    
    // Add NCM summary to the text if we found any
    if (uniqueNCMs.length > 0) {
      const ncmSummary = `\n\n=== EXTRACTED NCM CODES ===\n${uniqueNCMs.join(', ')}\nTotal NCMs found: ${uniqueNCMs.length}\n`;
      fullText += ncmSummary;
      debugInfo.push(`Total unique NCMs extracted: ${uniqueNCMs.length}`);
      console.log(`[XLSX] NCMs extracted: ${uniqueNCMs.length} - ${uniqueNCMs.slice(0, 10).join(', ')}${uniqueNCMs.length > 10 ? '...' : ''}`);
    } else {
      debugInfo.push('WARNING: No NCM codes found in manifest');
      console.warn(`[XLSX] WARNING: No NCM codes found in ${fileName}`);
    }
    
    console.log(`[XLSX] Done: ${fullText.length} chars, ${totalRows} rows`);
    
    return {
      text: fullText.trim(),
      sheetCount: sheetsToProcess.length,
      rowCount: totalRows,
      readable: fullText.length > 30,
      ncmCodes: uniqueNCMs,
      debugInfo: debugInfo.join('\n')
    };
    
  } catch (error) {
    console.error(`[XLSX] Error:`, error);
    return {
      text: '',
      sheetCount: 0,
      rowCount: 0,
      readable: false,
      ncmCodes: [],
      debugInfo: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}
