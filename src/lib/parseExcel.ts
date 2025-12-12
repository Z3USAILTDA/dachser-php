import * as XLSX from "xlsx";

export interface ExcelItem {
  itemName: string;
  value: number;
}

export interface ParseExcelResult {
  items: ExcelItem[];
  totalExtracted: number;
}

/**
 * Parse an Excel file and extract items with values
 * Attempts to find columns containing item names and monetary values
 */
export function parseExcelFile(file: File): Promise<ParseExcelResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });

        // Get the first sheet
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        // Convert to JSON
        const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        if (rows.length === 0) {
          resolve({ items: [], totalExtracted: 0 });
          return;
        }

        // Try to identify header row and columns
        const { nameColIndex, valueColIndex, dataStartRow } = identifyColumns(rows);

        if (nameColIndex === -1 || valueColIndex === -1) {
          // Fallback: assume first column is name, last numeric column is value
          const items = extractItemsFallback(rows);
          resolve({
            items,
            totalExtracted: items.reduce((sum, item) => sum + item.value, 0),
          });
          return;
        }

        // Extract items from identified columns
        const items: ExcelItem[] = [];

        for (let i = dataStartRow; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0) continue;

          const itemName = String(row[nameColIndex] || "").trim();
          const rawValue = row[valueColIndex];

          if (!itemName || itemName.toLowerCase().includes("total")) continue;

          const value = parseMonetaryValue(rawValue);
          if (value > 0) {
            items.push({ itemName, value });
          }
        }

        resolve({
          items,
          totalExtracted: items.reduce((sum, item) => sum + item.value, 0),
        });
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(new Error("Failed to read Excel file"));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Identify columns containing item names and values
 */
function identifyColumns(rows: any[][]): {
  nameColIndex: number;
  valueColIndex: number;
  dataStartRow: number;
} {
  // Common header patterns for item names
  const namePatterns = [
    /descri[çc][ãa]o/i,
    /item/i,
    /produto/i,
    /servi[çc]o/i,
    /nome/i,
    /specification/i,
    /description/i,
  ];

  // Common header patterns for values
  const valuePatterns = [
    /valor\s*total/i,
    /total/i,
    /valor/i,
    /pre[çc]o/i,
    /amount/i,
    /value/i,
    /vlr/i,
  ];

  let nameColIndex = -1;
  let valueColIndex = -1;
  let dataStartRow = 1;

  // Search in first 5 rows for headers
  for (let rowIdx = 0; rowIdx < Math.min(5, rows.length); rowIdx++) {
    const row = rows[rowIdx];
    if (!row) continue;

    for (let colIdx = 0; colIdx < row.length; colIdx++) {
      const cell = String(row[colIdx] || "").toLowerCase();

      if (nameColIndex === -1) {
        for (const pattern of namePatterns) {
          if (pattern.test(cell)) {
            nameColIndex = colIdx;
            dataStartRow = rowIdx + 1;
            break;
          }
        }
      }

      if (valueColIndex === -1 || colIdx !== nameColIndex) {
        for (const pattern of valuePatterns) {
          if (pattern.test(cell)) {
            valueColIndex = colIdx;
            dataStartRow = rowIdx + 1;
            break;
          }
        }
      }
    }

    if (nameColIndex !== -1 && valueColIndex !== -1) break;
  }

  return { nameColIndex, valueColIndex, dataStartRow };
}

/**
 * Fallback extraction when headers are not found
 */
function extractItemsFallback(rows: any[][]): ExcelItem[] {
  const items: ExcelItem[] = [];

  // Skip potential header row
  const startRow = rows.length > 1 ? 1 : 0;

  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 2) continue;

    // First non-empty string column is name
    let itemName = "";
    let value = 0;

    for (let j = 0; j < row.length; j++) {
      const cell = row[j];

      if (!itemName && typeof cell === "string" && cell.trim()) {
        itemName = cell.trim();
      }

      // Last numeric value in row is likely the total
      const numValue = parseMonetaryValue(cell);
      if (numValue > 0) {
        value = numValue;
      }
    }

    if (itemName && value > 0 && !itemName.toLowerCase().includes("total")) {
      items.push({ itemName, value });
    }
  }

  return items;
}

/**
 * Parse a monetary value from various formats
 */
function parseMonetaryValue(value: any): number {
  if (typeof value === "number") return value;
  if (!value) return 0;

  const str = String(value);

  // Remove currency symbols and spaces
  let cleaned = str.replace(/[R$€£¥\s]/g, "");

  // Handle Brazilian format (1.234,56) vs US format (1,234.56)
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");

  if (lastComma > lastDot) {
    // Brazilian format: 1.234,56
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    // US format: 1,234.56
    cleaned = cleaned.replace(/,/g, "");
  }

  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}
