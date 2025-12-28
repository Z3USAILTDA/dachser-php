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
/**
 * Extract NCM codes from text - ONLY NCM, never HS Code
 * NCM codes are typically 4 or 8 digits
 * HS Codes should NOT be extracted as they are a different system
 */
function extractNCMCodes(text: string): string[] {
  // ONLY extract values that are labeled as NCM - NEVER HS Code
  const ncmPatterns = [
    /NCM[:\s]*(\d{4,10})/gi, // After "NCM:" label explicitly
    /NCM\s*Code[:\s]*(\d{4,10})/gi, // After "NCM Code:" label
    /Codigo\s*NCM[:\s]*(\d{4,10})/gi, // Portuguese variation
    /Código\s*NCM[:\s]*(\d{4,10})/gi, // Portuguese variation with accent
  ];
  
  // Patterns to EXCLUDE - these are HS Codes, not NCMs
  const hsCodeContext = /HS\s*CODE/gi;
  
  const ncmSet = new Set<string>();
  
  // First check if text contains explicit NCM labels
  let hasExplicitNCM = false;
  for (const pattern of ncmPatterns) {
    if (pattern.test(text)) {
      hasExplicitNCM = true;
      break;
    }
  }
  
  // Extract from explicit NCM labels
  for (const pattern of ncmPatterns) {
    // Reset regex lastIndex
    pattern.lastIndex = 0;
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const cleanNCM = match[1].replace(/[\.\-\s]/g, '');
      
      // Validate it looks like an NCM (4-10 digits)
      if (cleanNCM.length >= 4 && cleanNCM.length <= 10) {
        const chapter = parseInt(cleanNCM.substring(0, 2));
        if (chapter >= 1 && chapter <= 99) {
          ncmSet.add(cleanNCM);
        }
      }
    }
  }
  
  // Only extract from general number patterns if no explicit NCM labels found
  // AND if text doesn't contain HS Code context (to avoid mixing systems)
  if (ncmSet.size === 0 && !hasExplicitNCM && !hsCodeContext.test(text)) {
    // Look for 4-digit codes in cells (typical short NCM)
    const shortNCMPattern = /\b(\d{4})\b/g;
    const matches = text.matchAll(shortNCMPattern);
    for (const match of matches) {
      const cleanNCM = match[1];
      const chapter = parseInt(cleanNCM.substring(0, 2));
      if (chapter >= 1 && chapter <= 99) {
        ncmSet.add(cleanNCM);
      }
    }
  }
  
  return Array.from(ncmSet).sort();
}

/**
 * Find columns that contain NCM data
 * IMPORTANT: Only use "NCM Code" columns - NEVER use "HS Code" columns
 * HS Code is a different classification system (4 digits) that should not be mixed with NCM (8 digits)
 */
function findNCMColumns(headers: string[]): number[] {
  // ONLY look for NCM-specific columns - never HS Code
  const ncmKeywords = ['ncm code', 'ncm_code', 'ncmcode', 'codigo ncm', 'código ncm'];
  // Columns to explicitly EXCLUDE (these contain HS codes, not NCMs)
  const excludeKeywords = ['hs code', 'hscode', 'hs-code', 'hs_code', 'harmonized'];
  
  const ncmIndices: number[] = [];
  
  headers.forEach((header, index) => {
    const lowerHeader = header.toLowerCase().trim();
    
    // Skip if this is an HS Code column
    if (excludeKeywords.some(kw => lowerHeader.includes(kw))) {
      console.log(`[XLSX] SKIPPING HS Code column at index ${index}: "${header}" (not NCM)`);
      return;
    }
    
    // Check for NCM-specific columns only
    if (ncmKeywords.some(kw => lowerHeader.includes(kw))) {
      ncmIndices.push(index);
      console.log(`[XLSX] Found NCM column at index ${index}: "${header}"`);
    }
    // Also check for standalone "ncm" but NOT if it's part of "hs" context
    else if (lowerHeader === 'ncm' || (lowerHeader.includes('ncm') && !lowerHeader.includes('hs'))) {
      ncmIndices.push(index);
      console.log(`[XLSX] Found NCM column at index ${index}: "${header}"`);
    }
  });
  
  if (ncmIndices.length > 0) {
    console.log(`[XLSX] Using NCM columns ONLY: ${ncmIndices.join(', ')}`);
    return ncmIndices;
  }
  
  console.log(`[XLSX] WARNING: No NCM Code columns found in headers - HS Code columns are NOT used`);
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
          
          // Convert to CSV for full text extraction (for AI analysis context)
          const csv = XLSX.utils.sheet_to_csv(sheet);
          const lines = csv.split('\n')
            .filter(line => line.trim().length > 0)
            .slice(0, MAX_ROWS_PER_SHEET);
          
          if (lines.length > 0) {
            const sheetText = `\n=== ${sheetName} ===\n${lines.join('\n')}`;
            const remainingChars = MAX_TOTAL_CHARS - fullText.length;
            fullText += sheetText.substring(0, remainingChars);
            totalRows += lines.length;
            
            // DO NOT extract NCMs from full text - ONLY use identified NCM columns
            // The HS Code column values would pollute the NCM list
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
