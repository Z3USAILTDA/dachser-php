/**
 * XLSX text extraction - complete data extraction for maritime manifests
 */

export interface XlsxReadResult {
  text: string;
  sheetCount: number;
  rowCount: number;
  readable: boolean;
}

// Full extraction limits for complete manifest data
const MAX_SHEETS = 10;
const MAX_ROWS_PER_SHEET = 2000;
const MAX_TOTAL_CHARS = 200000;

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
    
    console.log(`[XLSX] ${workbook.SheetNames.length} sheets found`);
    
    // Prioritize maritime-relevant sheets
    const highPriority = ['ncm', 'container', 'package', 'supplier', 'resumo', 'summary', 'item', 'product', 'cargo'];
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
    
    for (const sheetName of sheetsToProcess) {
      if (fullText.length >= MAX_TOTAL_CHARS) {
        console.log(`[XLSX] Char limit reached`);
        break;
      }
      
      const sheet = workbook.Sheets[sheetName];
      if (sheet) {
        const csv = XLSX.utils.sheet_to_csv(sheet);
        const lines = csv.split('\n')
          .filter(line => line.trim().length > 0)
          .slice(0, MAX_ROWS_PER_SHEET);
        
        if (lines.length > 0) {
          const sheetText = `\n=== ${sheetName} ===\n${lines.join('\n')}`;
          const remainingChars = MAX_TOTAL_CHARS - fullText.length;
          fullText += sheetText.substring(0, remainingChars);
          totalRows += lines.length;
        }
        
        console.log(`[XLSX] "${sheetName}": ${lines.length} rows`);
      }
    }
    
    console.log(`[XLSX] Done: ${fullText.length} chars, ${totalRows} rows`);
    
    return {
      text: fullText.trim(),
      sheetCount: sheetsToProcess.length,
      rowCount: totalRows,
      readable: fullText.length > 30
    };
    
  } catch (error) {
    console.error(`[XLSX] Error:`, error);
    return {
      text: '',
      sheetCount: 0,
      rowCount: 0,
      readable: false
    };
  }
}
