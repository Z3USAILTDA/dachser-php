/**
 * deterministicCompare.ts — Pure TypeScript comparison logic.
 * Compares structured JSON from XLSX extractor and PDF extractor.
 * No LLM calls — deterministic, testable, zero API cost.
 */

import type { ManifestData, ExporterData } from './xlsxExtractor.ts';
import type { PdfExtractedData } from './pdfExtractor.ts';

// ============ TYPES ============

export type FieldStatus = 'MATCH' | 'DIVERGENCE' | 'NOT_FOUND';

export interface FieldComparison {
  field: string;
  source_value: string;
  target_value: string;
  delta?: string;
  missing?: string[];
  extra?: string[];
  status: FieldStatus;
  action?: string;
}

export interface ExporterComparison {
  exporter_name: string;
  manifest_exporter?: string;
  match_similarity: number;
  fields: FieldComparison[];
  items: ItemComparison[];
  subtotals: FieldComparison[];
}

export interface ItemComparison {
  description: string;
  fields: FieldComparison[];
}

export interface ComparisonResult {
  analysis_type: string;
  overall_status: 'MATCH' | 'UPDATE_REQUIRED';
  container_check: FieldComparison | null;
  exporters: ExporterComparison[];
  totals: FieldComparison[];
  ncm_summary: FieldComparison;
  shipping_data: {
    container: string;
    consignee: string;
    vessel: string;
    voyage: string;
    origem: string;
    destino: string;
    mbl_number: string;
    carrier: string;
  };
}

// ============ TOLERANCES ============

const WEIGHT_TOLERANCE_KG = 1;
const CBM_TOLERANCE = 0.01;

// ============ FUZZY MATCHING ============

function normalizeForMatch(name: string): string {
  return name
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function jaccardSimilarity(a: string, b: string): number {
  const wordsA = new Set(normalizeForMatch(a).split(' ').filter(Boolean));
  const wordsB = new Set(normalizeForMatch(b).split(' ').filter(Boolean));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
  const union = new Set([...wordsA, ...wordsB]);
  return intersection.size / union.size;
}

function findBestExporterMatch(
  pdfExporterName: string,
  manifestExporters: ExporterData[],
  usedIndices: Set<number>,
): { index: number; similarity: number } | null {
  let bestIdx = -1;
  let bestSim = 0;

  for (let i = 0; i < manifestExporters.length; i++) {
    if (usedIndices.has(i)) continue;
    const sim = jaccardSimilarity(pdfExporterName, manifestExporters[i].name);
    if (sim > bestSim) {
      bestSim = sim;
      bestIdx = i;
    }
  }

  return bestSim >= 0.4 ? { index: bestIdx, similarity: bestSim } : null;
}

// ============ FIELD COMPARISON HELPERS ============

function compareWeight(label: string, sourceVal: number, targetVal: number, sourceLabel: string, targetLabel: string): FieldComparison {
  const delta = Math.abs(sourceVal - targetVal);
  const status: FieldStatus = delta <= WEIGHT_TOLERANCE_KG ? 'MATCH' : 'DIVERGENCE';
  return {
    field: label,
    source_value: `${sourceVal.toFixed(3)} kg`,
    target_value: `${targetVal.toFixed(3)} kg`,
    delta: `${(targetVal - sourceVal).toFixed(3)} kg`,
    status,
    action: status === 'DIVERGENCE' ? `Update ${targetLabel} weight to ${sourceVal.toFixed(3)} kg` : undefined,
  };
}

function compareCbm(label: string, sourceVal: number, targetVal: number, targetLabel: string): FieldComparison {
  const delta = Math.abs(sourceVal - targetVal);
  const status: FieldStatus = delta <= CBM_TOLERANCE ? 'MATCH' : 'DIVERGENCE';
  return {
    field: label,
    source_value: `${sourceVal.toFixed(3)} m³`,
    target_value: `${targetVal.toFixed(3)} m³`,
    delta: `${(targetVal - sourceVal).toFixed(3)} m³`,
    status,
    action: status === 'DIVERGENCE' ? `Update ${targetLabel} CBM to ${sourceVal.toFixed(3)} m³` : undefined,
  };
}

function compareExact(label: string, sourceVal: string, targetVal: string, targetLabel: string): FieldComparison {
  const normS = sourceVal.replace(/[\s\-\.]/g, '').toUpperCase();
  const normT = targetVal.replace(/[\s\-\.]/g, '').toUpperCase();
  const status: FieldStatus = !normS && !normT ? 'MATCH' : normS === normT ? 'MATCH' : !normT ? 'NOT_FOUND' : 'DIVERGENCE';
  return {
    field: label,
    source_value: sourceVal || '(empty)',
    target_value: targetVal || '(empty)',
    status,
    action: status === 'DIVERGENCE' ? `Update ${targetLabel} ${label} to "${sourceVal}"` : undefined,
  };
}

function compareNcmCodes(sourceNcms: string[], targetNcms: string[], sourceLabel: string, targetLabel: string): FieldComparison {
  const normSource = [...new Set(sourceNcms.map(c => c.replace(/[\.\-\s]/g, '')))].sort();
  const normTarget = [...new Set(targetNcms.map(c => c.replace(/[\.\-\s]/g, '')))].sort();
  
  const missing = normSource.filter(c => !normTarget.includes(c));
  const extra = normTarget.filter(c => !normSource.includes(c));
  const status: FieldStatus = missing.length === 0 && extra.length === 0 ? 'MATCH' : 'DIVERGENCE';

  let action: string | undefined;
  if (missing.length > 0 && extra.length > 0) {
    action = `Add missing NCM codes to ${targetLabel}: ${missing.join(', ')}. Remove extra NCM codes: ${extra.join(', ')}`;
  } else if (missing.length > 0) {
    action = `Add missing NCM codes to ${targetLabel} that are in ${sourceLabel}.`;
  } else if (extra.length > 0) {
    action = `Remove extra NCM codes from ${targetLabel} that are not in ${sourceLabel}.`;
  }

  return {
    field: 'NCM Codes',
    source_value: normSource.join(', ') || 'none',
    target_value: normTarget.join(', ') || 'none',
    missing,
    extra,
    status,
    action,
  };
}

function compareInvoices(sourceInvs: string[], targetInvs: string[]): FieldComparison {
  // Step 1: Try full-string matching first (only strip spaces/dashes)
  const normFull = (ref: string): string => ref.replace(/[\s\-]/g, '').toUpperCase();
  
  const sourceFullNorms = sourceInvs.map(normFull);
  const targetFullNorms = targetInvs.map(normFull);

  // Check if full-string matching resolves everything
  const missingFull = sourceInvs.filter((_, i) => !targetFullNorms.includes(sourceFullNorms[i]));
  const extraFull = targetInvs.filter((_, i) => !sourceFullNorms.includes(targetFullNorms[i]));

  if (missingFull.length === 0 && extraFull.length === 0) {
    return {
      field: 'Invoice References',
      source_value: sourceInvs.join(', ') || 'none',
      target_value: targetInvs.join(', ') || 'none',
      missing: [],
      extra: [],
      status: 'MATCH',
    };
  }

  // Step 2: For unmatched items only, try suffix matching
  // CRITICAL: Suffix matching must preserve the full numeric value (different zeros = different numbers)
  const normSuffix = (ref: string): string => {
    const matches = ref.match(/\d{2,}$/);
    if (!matches) return ref.replace(/^0+/, '') || ref;
    const num = matches[0];
    // Only strip leading zeros — internal/trailing zeros are significant
    return num.replace(/^0+/, '') || '0';
  };

  const unmatchedSourceIdxs = missingFull.map(inv => sourceInvs.indexOf(inv));
  const unmatchedTargetIdxs = extraFull.map(inv => targetInvs.indexOf(inv));

  const unmatchedSourceSuffixes = unmatchedSourceIdxs.map(i => normSuffix(sourceInvs[i]));
  const unmatchedTargetSuffixes = unmatchedTargetIdxs.map(i => normSuffix(targetInvs[i]));

  const missing = missingFull.filter((_, i) => !unmatchedTargetSuffixes.includes(unmatchedSourceSuffixes[i]));
  const extra = extraFull.filter((_, i) => !unmatchedSourceSuffixes.includes(unmatchedTargetSuffixes[i]));

  const status: FieldStatus = missing.length === 0 && extra.length === 0 ? 'MATCH' : 'DIVERGENCE';

  return {
    field: 'Invoice References',
    source_value: sourceInvs.join(', ') || 'none',
    target_value: targetInvs.join(', ') || 'none',
    missing,
    extra,
    status,
    action: status === 'DIVERGENCE'
      ? (missing.length > 0 ? `Add missing invoices: ${missing.join(', ')}` : '') +
        (extra.length > 0 ? `Remove extra invoices: ${extra.join(', ')}` : '')
      : undefined,
  };
}

function comparePackages(sourceQty: number, targetQty: number, targetLabel: string): FieldComparison {
  const status: FieldStatus = sourceQty === targetQty ? 'MATCH' : 'DIVERGENCE';
  return {
    field: 'Packages',
    source_value: String(sourceQty),
    target_value: String(targetQty),
    delta: String(targetQty - sourceQty),
    status,
    action: status === 'DIVERGENCE' ? `Update ${targetLabel} package count to ${sourceQty}` : undefined,
  };
}

// ============ MANIFEST × HBL COMPARISON ============

export function compareManifestHbl(manifest: ManifestData, hbls: PdfExtractedData[]): ComparisonResult {
  console.log(`🔍 [Compare] Manifest × HBL: ${manifest.exporters.length} manifest exporters, ${hbls.length} HBLs`);

  const exporterComparisons: ExporterComparison[] = [];
  const allFields: FieldComparison[] = [];

  // Container check
  const hblContainer = hbls[0]?.container || '';
  const containerCheck = manifest.container
    ? compareExact('Container', manifest.container, hblContainer, 'HBL')
    : null;

  // For multi-HBL: sum weights/CBM across all HBLs for total comparison
  const hblTotalWeight = hbls.reduce((sum, h) => sum + h.gross_weight_kg, 0);
  const hblTotalCbm = hbls.reduce((sum, h) => sum + h.cbm, 0);
  const hblTotalPkgs = hbls.reduce((sum, h) => sum + h.packages.qty, 0);

  // Collect all HBL NCMs
  const allHblNcms: string[] = [];
  for (const hbl of hbls) {
    for (const ncm of hbl.ncm_codes) {
      if (!allHblNcms.includes(ncm)) allHblNcms.push(ncm);
    }
    for (const exp of hbl.exporters) {
      for (const ncm of exp.ncm_codes) {
        if (!allHblNcms.includes(ncm)) allHblNcms.push(ncm);
      }
    }
  }

  // Per-HBL exporter matching
  for (const hbl of hbls) {
    const usedManifestIndices = new Set<number>();
    const hblExporters = hbl.exporters.length > 0 ? hbl.exporters : [{
      name: hbl.shipper || 'Unknown',
      gross_weight_kg: hbl.gross_weight_kg,
      net_weight_kg: hbl.net_weight_kg,
      cbm: hbl.cbm,
      packages_qty: hbl.packages.qty,
      packages_type: hbl.packages.type,
      ncm_codes: hbl.ncm_codes,
      invoice_ref: hbl.invoice_numbers.join(', '),
    }];

    for (const hblExp of hblExporters) {
      const match = findBestExporterMatch(hblExp.name, manifest.exporters, usedManifestIndices);
      
      if (match) {
        usedManifestIndices.add(match.index);
        const mExp = manifest.exporters[match.index];
        
        const fields: FieldComparison[] = [
          compareExact('CNPJ', mExp.cnpj, '', 'HBL'),
          compareExact('Seal', mExp.seal || manifest.seal, hbl.seal, 'HBL'),
        ];

        const subtotals: FieldComparison[] = [
          compareWeight('Gross Weight', mExp.gross_weight_kg, hblExp.gross_weight_kg, 'Manifest', 'HBL'),
          compareCbm('CBM', mExp.cbm, hblExp.cbm, 'HBL'),
          comparePackages(mExp.packages.qty, hblExp.packages_qty, 'HBL'),
          compareNcmCodes(mExp.ncm_codes, hblExp.ncm_codes, 'Manifest', 'HBL'),
          compareInvoices(mExp.invoice_numbers, hblExp.invoice_ref ? [hblExp.invoice_ref] : []),
        ];

        exporterComparisons.push({
          exporter_name: mExp.name,
          manifest_exporter: mExp.name,
          match_similarity: match.similarity,
          fields,
          items: [],
          subtotals,
        });
      } else {
        // HBL exporter not found in manifest
        exporterComparisons.push({
          exporter_name: hblExp.name,
          match_similarity: 0,
          fields: [],
          items: [],
          subtotals: [{
            field: 'Match',
            source_value: 'Not found in Manifest',
            target_value: hblExp.name,
            status: 'NOT_FOUND',
          }],
        });
      }
    }
  }

  // Total comparisons
  const totalFields: FieldComparison[] = [];
  if (hbls.length > 1) {
    // Multi-HBL: compare sum
    totalFields.push(compareWeight('Total Weight (Sum of HBLs)', manifest.totals.gross_weight_kg, hblTotalWeight, 'Manifest', 'HBL'));
    totalFields.push(compareCbm('Total CBM (Sum of HBLs)', manifest.totals.cbm, hblTotalCbm, 'HBL'));
  } else {
    totalFields.push(compareWeight('Total Weight', manifest.totals.gross_weight_kg, hblTotalWeight, 'Manifest', 'HBL'));
    totalFields.push(compareCbm('Total CBM', manifest.totals.cbm, hblTotalCbm, 'HBL'));
  }
  totalFields.push(comparePackages(manifest.totals.packages, hblTotalPkgs, 'HBL'));

  const ncmSummary = compareNcmCodes(manifest.totals.ncm_codes, allHblNcms, 'Manifest', 'HBL');

  const hasDivergence = [
    containerCheck,
    ...exporterComparisons.flatMap(e => [...e.fields, ...e.subtotals]),
    ...totalFields,
    ncmSummary,
  ].some(f => f && f.status === 'DIVERGENCE');

  return {
    analysis_type: 'manifest_hbl',
    overall_status: hasDivergence ? 'UPDATE_REQUIRED' : 'MATCH',
    container_check: containerCheck,
    exporters: exporterComparisons,
    totals: totalFields,
    ncm_summary: ncmSummary,
    shipping_data: {
      container: hblContainer || manifest.container,
      consignee: hbls[0]?.consignee || '',
      vessel: hbls[0]?.vessel || '',
      voyage: hbls[0]?.voyage || '',
      origem: hbls[0]?.port_of_loading || '',
      destino: hbls[0]?.port_of_discharge || '',
      mbl_number: '',
      carrier: '',
    },
  };
}

// ============ HBL × MBL COMPARISON ============

export function compareHblMbl(hbl: PdfExtractedData, mbl: PdfExtractedData): ComparisonResult {
  console.log(`🔍 [Compare] HBL × MBL`);

  const fields: FieldComparison[] = [
    compareExact('Shipper', hbl.shipper, mbl.shipper, 'MBL'),
    compareExact('Consignee', hbl.consignee, mbl.consignee, 'MBL'),
    compareExact('Notify Party', hbl.notify_party, mbl.notify_party, 'MBL'),
    compareExact('Vessel', hbl.vessel, mbl.vessel, 'MBL'),
    compareExact('Voyage', hbl.voyage, mbl.voyage, 'MBL'),
    compareExact('Port of Loading', hbl.port_of_loading, mbl.port_of_loading, 'MBL'),
    compareExact('Port of Discharge', hbl.port_of_discharge, mbl.port_of_discharge, 'MBL'),
    compareExact('Container', hbl.container, mbl.container, 'MBL'),
    compareExact('Seal', hbl.seal, mbl.seal, 'MBL'),
    compareWeight('Gross Weight', hbl.gross_weight_kg, mbl.gross_weight_kg, 'HBL', 'MBL'),
    compareCbm('CBM', hbl.cbm, mbl.cbm, 'MBL'),
    comparePackages(hbl.packages.qty, mbl.packages.qty, 'MBL'),
  ];

  const ncmSummary = compareNcmCodes(hbl.ncm_codes, mbl.ncm_codes, 'HBL', 'MBL');

  const hasDivergence = [...fields, ncmSummary].some(f => f.status === 'DIVERGENCE');

  return {
    analysis_type: 'hbl_mbl',
    overall_status: hasDivergence ? 'UPDATE_REQUIRED' : 'MATCH',
    container_check: null,
    exporters: [],
    totals: fields,
    ncm_summary: ncmSummary,
    shipping_data: {
      container: hbl.container || mbl.container,
      consignee: hbl.consignee,
      vessel: hbl.vessel || mbl.vessel,
      voyage: hbl.voyage || mbl.voyage,
      origem: hbl.port_of_loading || mbl.port_of_loading,
      destino: hbl.port_of_discharge || mbl.port_of_discharge,
      mbl_number: mbl.bl_number,
      carrier: '',
    },
  };
}

// ============ INVOICES × HBL COMPARISON ============

export function compareInvoicesHbl(invoices: PdfExtractedData[], hbl: PdfExtractedData): ComparisonResult {
  console.log(`🔍 [Compare] Invoices × HBL: ${invoices.length} invoices`);

  const fields: FieldComparison[] = [];

  // Aggregate invoice data
  let totalInvWeight = 0, totalInvCbm = 0;
  const allInvNcms: string[] = [];
  const allInvNumbers: string[] = [];

  for (const inv of invoices) {
    totalInvWeight += inv.gross_weight_kg;
    totalInvCbm += inv.cbm;
    for (const ncm of inv.ncm_codes) {
      if (!allInvNcms.includes(ncm)) allInvNcms.push(ncm);
    }
    for (const num of inv.invoice_numbers) {
      if (!allInvNumbers.includes(num)) allInvNumbers.push(num);
    }
  }

  if (totalInvWeight > 0 && hbl.gross_weight_kg > 0) {
    fields.push(compareWeight('Gross Weight', totalInvWeight, hbl.gross_weight_kg, 'Invoices', 'HBL'));
  }
  if (totalInvCbm > 0 && hbl.cbm > 0) {
    fields.push(compareCbm('CBM', totalInvCbm, hbl.cbm, 'HBL'));
  }

  fields.push(compareExact('Container', invoices[0]?.container || '', hbl.container, 'HBL'));
  fields.push(compareExact('Vessel', invoices[0]?.vessel || '', hbl.vessel, 'HBL'));

  const ncmSummary = compareNcmCodes(allInvNcms, hbl.ncm_codes, 'Invoices', 'HBL');
  const invoiceComparison = compareInvoices(allInvNumbers, hbl.invoice_numbers);
  fields.push(invoiceComparison);

  const hasDivergence = [...fields, ncmSummary].some(f => f.status === 'DIVERGENCE');

  return {
    analysis_type: 'invoices_hbl',
    overall_status: hasDivergence ? 'UPDATE_REQUIRED' : 'MATCH',
    container_check: null,
    exporters: [],
    totals: fields,
    ncm_summary: ncmSummary,
    shipping_data: {
      container: hbl.container,
      consignee: hbl.consignee,
      vessel: hbl.vessel,
      voyage: hbl.voyage,
      origem: hbl.port_of_loading,
      destino: hbl.port_of_discharge,
      mbl_number: '',
      carrier: '',
    },
  };
}
