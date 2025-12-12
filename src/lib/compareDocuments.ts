import type { ComparisonRow } from "@/components/analise-documental/ComparisonResults";

interface DocumentItem {
  itemName: string;
  value: number;
}

/**
 * Normalize item name for comparison
 */
function normalizeItemName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[^a-z0-9]/g, " ") // Keep only alphanumeric
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Calculate similarity between two strings (Jaccard index)
 */
function calculateSimilarity(a: string, b: string): number {
  const wordsA = new Set(normalizeItemName(a).split(" ").filter(Boolean));
  const wordsB = new Set(normalizeItemName(b).split(" ").filter(Boolean));

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  const intersection = new Set([...wordsA].filter((x) => wordsB.has(x)));
  const union = new Set([...wordsA, ...wordsB]);

  return intersection.size / union.size;
}

/**
 * Find the best match for an item in a list
 */
function findBestMatch(
  item: DocumentItem,
  candidates: DocumentItem[],
  usedIndices: Set<number>
): { index: number; similarity: number } | null {
  let bestIndex = -1;
  let bestSimilarity = 0;

  for (let i = 0; i < candidates.length; i++) {
    if (usedIndices.has(i)) continue;

    const similarity = calculateSimilarity(item.itemName, candidates[i].itemName);

    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestIndex = i;
    }
  }

  // Require at least 40% similarity to consider a match
  if (bestSimilarity >= 0.4) {
    return { index: bestIndex, similarity: bestSimilarity };
  }

  return null;
}

/**
 * Determine status based on difference
 */
function getStatus(difference: number): "success" | "warning" | "error" {
  if (difference === 0) return "success";
  if (difference <= 50) return "warning";
  return "error";
}

/**
 * Compare items from PDF and Excel documents
 */
export function compareDocuments(
  pdfItems: DocumentItem[],
  excelItems: DocumentItem[]
): ComparisonRow[] {
  const results: ComparisonRow[] = [];
  const usedExcelIndices = new Set<number>();
  let rowNumber = 1;

  // First pass: match PDF items to Excel items
  for (const pdfItem of pdfItems) {
    const match = findBestMatch(pdfItem, excelItems, usedExcelIndices);

    if (match) {
      usedExcelIndices.add(match.index);
      const excelItem = excelItems[match.index];
      const difference = Math.abs(pdfItem.value - excelItem.value);

      results.push({
        rowNumber: rowNumber++,
        itemName: pdfItem.itemName,
        pdfValue: pdfItem.value,
        excelValue: excelItem.value,
        difference: Math.round(difference * 100) / 100,
        status: getStatus(difference),
      });
    } else {
      // PDF item not found in Excel
      results.push({
        rowNumber: rowNumber++,
        itemName: `${pdfItem.itemName} (apenas no PDF)`,
        pdfValue: pdfItem.value,
        excelValue: 0,
        difference: pdfItem.value,
        status: "error",
      });
    }
  }

  // Second pass: add unmatched Excel items
  for (let i = 0; i < excelItems.length; i++) {
    if (usedExcelIndices.has(i)) continue;

    const excelItem = excelItems[i];
    results.push({
      rowNumber: rowNumber++,
      itemName: `${excelItem.itemName} (apenas no Excel)`,
      pdfValue: 0,
      excelValue: excelItem.value,
      difference: excelItem.value,
      status: "error",
    });
  }

  // Sort by status (errors first, then warnings, then success)
  const statusOrder = { error: 0, warning: 1, success: 2 };
  results.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

  // Renumber after sorting
  results.forEach((r, i) => (r.rowNumber = i + 1));

  return results;
}
