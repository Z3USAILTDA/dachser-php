/**
 * resultFormatter.ts — Converts ComparisonResult JSON into the text format
 * expected by AnalysisResultDisplay (color highlighting, "Copiar Divergências" button).
 * Also appends the hbl_shipping_data JSON block for metadata extraction.
 */

import type { ComparisonResult, FieldComparison, ExporterComparison } from './deterministicCompare.ts';

// ============ HELPERS ============

function formatField(f: FieldComparison, sourceLabel: string, targetLabel: string): string {
  const lines: string[] = [];

  if (f.field === 'NCM Codes') {
    lines.push(`NCM CODES:`);
    lines.push(`- ${sourceLabel} NCMs: [${f.source_value}]`);
    lines.push(`- ${targetLabel} NCMs: [${f.target_value}]`);
    lines.push(`- Missing in ${targetLabel}: ${f.missing && f.missing.length > 0 ? f.missing.join(', ') : 'none'}`);
    lines.push(`- Extra in ${targetLabel}: ${f.extra && f.extra.length > 0 ? f.extra.join(', ') : 'none'}`);
    lines.push(`- Status: ${f.status === 'MATCH' ? 'MATCH' : 'UPDATE REQUIRED'}`);
    if (f.action) lines.push(`  → Update: ${f.action}`);
  } else if (f.field === 'Invoice References') {
    lines.push(`- ${f.field}: ${sourceLabel}: ${f.source_value} | ${targetLabel}: ${f.target_value} | Status: ${f.status === 'MATCH' ? 'MATCH' : 'UPDATE REQUIRED'}`);
    if (f.missing && f.missing.length > 0) lines.push(`  Missing: ${f.missing.join(', ')}`);
    if (f.extra && f.extra.length > 0) lines.push(`  Extra: ${f.extra.join(', ')}`);
    if (f.action) lines.push(`  → Update: ${f.action}`);
  } else {
    let line = `- ${f.field}: ${sourceLabel}: ${f.source_value} | ${targetLabel}: ${f.target_value}`;
    if (f.delta) line += ` | Delta: ${f.delta}`;
    line += ` | Status: ${f.status === 'MATCH' ? 'MATCH' : f.status === 'NOT_FOUND' ? 'NOT FOUND' : 'UPDATE REQUIRED'}`;
    lines.push(line);
    if (f.action) lines.push(`  → Update: ${f.action}`);
  }

  return lines.join('\n');
}

function formatExporter(exp: ExporterComparison, idx: number, sourceLabel: string, targetLabel: string): string {
  const lines: string[] = [];
  lines.push(`EXPORTER #${idx + 1}: ${exp.exporter_name}`);

  if (exp.match_similarity > 0 && exp.match_similarity < 1) {
    lines.push(`  (matched with ${Math.round(exp.match_similarity * 100)}% similarity)`);
  }

  for (const f of exp.fields) {
    lines.push(formatField(f, sourceLabel, targetLabel));
  }

  if (exp.items.length > 0) {
    for (let i = 0; i < exp.items.length; i++) {
      lines.push(`\nItem ${i + 1}: ${exp.items[i].description}`);
      for (const f of exp.items[i].fields) {
        lines.push(formatField(f, sourceLabel, targetLabel));
      }
    }
  }

  if (exp.subtotals.length > 0) {
    lines.push(`\nSubtotals EXPORTER #${idx + 1}:`);
    for (const f of exp.subtotals) {
      lines.push(formatField(f, sourceLabel, targetLabel));
    }
  }

  return lines.join('\n');
}

// ============ MAIN FORMATTER ============

export function formatComparisonResult(result: ComparisonResult): string {
  const lines: string[] = [];
  const isMatch = result.overall_status === 'MATCH';

  const sourceLabel = result.analysis_type === 'manifest_hbl' ? 'Manifest'
    : result.analysis_type === 'hbl_mbl' ? 'HBL'
    : 'Invoices';
  
  const targetLabel = result.analysis_type === 'manifest_hbl' ? 'HBL'
    : result.analysis_type === 'hbl_mbl' ? 'MBL'
    : 'HBL';

  if (isMatch) {
    lines.push('Hello, team.');
    lines.push('');
    lines.push(`No changes required — all submitted documents match.`);
    lines.push('');
    lines.push('VERIFICATION CHECKLIST (ALL PASSED):');
  } else {
    lines.push('Hello, team.');
    lines.push('');
    lines.push(`Please update ${targetLabel} as follows:`);
    lines.push('');
  }

  // Container check
  if (result.container_check) {
    if (result.container_check.status === 'DIVERGENCE') {
      lines.push(`⚠️ WARNING: POSSIBLE PROCESS MISMATCH ⚠️`);
      lines.push(`Container in ${sourceLabel}: ${result.container_check.source_value}`);
      lines.push(`Container in ${targetLabel}: ${result.container_check.target_value}`);
      lines.push('');
    }
  }

  // Per-exporter analysis (manifest_hbl)
  if (result.exporters.length > 0) {
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    for (let i = 0; i < result.exporters.length; i++) {
      if (i > 0) lines.push('');
      lines.push(formatExporter(result.exporters[i], i, sourceLabel, targetLabel));
    }
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('');
  }

  // Totals
  if (result.totals.length > 0) {
    if (result.analysis_type === 'hbl_mbl') {
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      lines.push('HBL × MBL COMPARISON');
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }

    for (const f of result.totals) {
      lines.push(formatField(f, sourceLabel, targetLabel));
    }
    lines.push('');
  }

  // NCM Summary
  lines.push(formatField(result.ncm_summary, sourceLabel, targetLabel));
  lines.push('');

  // Analysis Summary
  const divergences = [
    ...result.exporters.flatMap(e => [...e.fields, ...e.subtotals]),
    ...result.totals,
    result.ncm_summary,
    result.container_check,
  ].filter(f => f && f.status === 'DIVERGENCE');

  lines.push('ANALYSIS SUMMARY:');
  lines.push(`- Total exporters identified: ${result.exporters.length || 'N/A'}`);
  lines.push(`- Fields with discrepancies: ${divergences.length}`);
  lines.push(`- Overall status: ${result.overall_status}`);

  // Append shipping data JSON for extractHblShippingData compatibility
  const sd = result.shipping_data;
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify({
    hbl_shipping_data: {
      container: sd.container,
      consignee: sd.consignee,
      vessel: sd.vessel,
      voyage: sd.voyage,
      origem: sd.origem,
      destino: sd.destino,
    }
  }));
  lines.push('```');

  if (sd.mbl_number || sd.carrier) {
    lines.push('```json');
    lines.push(JSON.stringify({
      document_metadata: {
        mbl_number: sd.mbl_number,
        carrier: sd.carrier,
        ata_date: '',
      }
    }));
    lines.push('```');
  }

  return lines.join('\n');
}
