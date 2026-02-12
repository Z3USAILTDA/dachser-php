/**
 * Extracts only divergence lines from a sea/air analysis result text.
 * Used by "Copiar Divergências" button across SubmeterManifestHbl, SubmeterHblMbl, InvoicesDraftHbl.
 */
export function extractDivergences(text: string): string {
  const lines = text.split('\n');
  const output: string[] = [];

  // Lines that ARE divergences
  const isDivergence = (l: string): boolean => {
    const t = l.trim();
    // Explicit match → never a divergence
    if (/Status:\s*MATCH/i.test(t)) return false;
    // "Missing: none" / "Extra: none" → not a divergence
    if (/(?:Missing|Extra).*?:\s*none/i.test(t)) return false;
    // No changes required
    if (/No changes required|No discrepancies/i.test(t)) return false;

    // Actual divergence indicators
    if (/Status:\s*(UPDATE REQUIRED|DIVERGENCE|DIFFERENT|MISMATCH|NOT FOUND)/i.test(t)) return true;
    if (/UPDATE REQUIRED/i.test(t)) return true;
    // Action lines
    if (/^→\s*(Update|Action|Adjust|Change|Correct):/i.test(t)) return true;
    // Missing/Extra with actual values (already excluded "none" above)
    if (/(?:Missing|Extra)\s+in\s+\w+:/i.test(t)) return true;
    // Container warning
    if (/⚠️\s*WARNING.*MISMATCH/i.test(t)) return true;
    // Non-zero delta
    if (/Delta:\s*[+-]?[1-9]/i.test(t)) return true;

    return false;
  };

  // Context headers worth keeping when they precede divergences
  const isContextHeader = (l: string): boolean => {
    const t = l.trim();
    return /^(EXPORTER\s*#\d+|Item\s+\d+|Subtotals|NCM CODES|CONTAINER|SEAL NUMBER|INVOICE REFERENCES)/i.test(t);
  };

  // Skip JSON blocks, metadata, summary section
  let skip = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip JSON code blocks
    if (/^```json/i.test(trimmed)) { skip = true; continue; }
    if (skip && /^```/.test(trimmed)) { skip = false; continue; }
    if (skip) continue;

    // Skip analysis summary section (it summarises, not actionable)
    if (/^ANALYSIS SUMMARY:/i.test(trimmed)) break;

    if (isDivergence(line)) {
      // Add preceding context header if not already added
      if (i > 0 && isContextHeader(lines[i - 1])) {
        const prev = lines[i - 1];
        if (output.length === 0 || output[output.length - 1] !== prev) {
          output.push('');
          output.push(prev);
        }
      }
      output.push(line);
    }
  }

  if (output.length === 0) {
    return 'Nenhuma divergência encontrada - todos os documentos estão reconciliados.';
  }

  return output.join('\n').trim();
}
