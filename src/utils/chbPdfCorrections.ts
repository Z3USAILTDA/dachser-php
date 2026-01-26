// CHB PDF Corrections Utility
// Applies user corrections to analysis HTML before PDF export

import { ChbCorrection } from '@/hooks/useChbCorrections';

/**
 * Normalizes a field name for comparison
 */
function normalizeFieldName(campo: string): string {
  return campo
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Applies user corrections to an HTML analysis result
 * Returns the corrected HTML with user values replacing original values
 */
export function applyCorrectionsToHtml(
  html: string, 
  corrections: ChbCorrection[]
): string {
  if (!html || corrections.length === 0) {
    return html;
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const table = doc.querySelector('table');
    
    if (!table) {
      console.log('[applyCorrectionsToHtml] No table found in HTML');
      return html;
    }

    // Get headers to map column index to document name
    const headers: string[] = [];
    const headerCells = table.querySelectorAll('thead th');
    headerCells.forEach(th => headers.push(th.textContent?.trim() || ''));

    // Process each body row
    const bodyRows = table.querySelectorAll('tbody tr');
    bodyRows.forEach(tr => {
      const cells = tr.querySelectorAll('td');
      if (cells.length === 0) return;

      // Find the campo (field name) - usually second column after Status
      let campo = '';
      let campoIndex = -1;
      
      cells.forEach((cell, idx) => {
        const header = headers[idx]?.toLowerCase() || '';
        if (header === 'campo' || header === 'field') {
          campo = cell.textContent?.trim() || '';
          campoIndex = idx;
        }
      });

      // Fallback: if no explicit Campo column, try first non-status column
      if (!campo && cells.length > 1) {
        const firstCellText = cells[0].textContent?.trim() || '';
        // Check if first cell looks like a status (contains emoji)
        if (firstCellText.includes('🔴') || firstCellText.includes('🟨') || firstCellText.includes('✅')) {
          campo = cells[1].textContent?.trim() || '';
          campoIndex = 1;
        } else {
          campo = firstCellText;
          campoIndex = 0;
        }
      }

      if (!campo) return;

      const normalizedCampo = normalizeFieldName(campo);

      // Check each cell for matching corrections
      cells.forEach((cell, idx) => {
        if (idx === campoIndex) return; // Skip the campo column itself
        
        const header = headers[idx] || '';
        const normalizedHeader = header.trim();

        // Find correction for this field + document combination
        const correction = corrections.find(c => 
          c.field_name === normalizedCampo && 
          c.filename === normalizedHeader
        );

        if (correction) {
          const originalCellText = cell.textContent?.trim() || '';
          
          // Only replace if we haven't already applied this correction
          // Check if the cell doesn't already have the corrected value
          if (originalCellText !== correction.corrected_value) {
            // Create new cell content with correction indicator
            const correctedSpan = doc.createElement('span');
            correctedSpan.textContent = correction.corrected_value;
            correctedSpan.setAttribute('data-corrected', 'true');
            correctedSpan.setAttribute('data-original', originalCellText);
            correctedSpan.style.cssText = 'color: #60a5fa; font-weight: 500;';
            
            // Add asterisk to indicate correction
            const asterisk = doc.createElement('sup');
            asterisk.textContent = '*';
            asterisk.style.cssText = 'color: #60a5fa; font-size: 0.7em; margin-left: 2px;';
            
            // Clear cell and add new content
            cell.textContent = '';
            cell.appendChild(correctedSpan);
            cell.appendChild(asterisk);
          }
        }
      });
    });

    // Add footer note about corrections if any were applied
    const appliedCorrections = corrections.filter(c => {
      // Check if this correction was actually applied
      const normalizedField = c.field_name;
      let found = false;
      bodyRows.forEach(tr => {
        const cells = tr.querySelectorAll('td');
        cells.forEach((cell, idx) => {
          if (cell.querySelector('[data-corrected="true"]')) {
            found = true;
          }
        });
      });
      return found;
    });

    if (appliedCorrections.length > 0 || corrections.length > 0) {
      // Add a note at the end about corrections
      const footer = doc.createElement('div');
      footer.className = 'corrections-footer';
      footer.style.cssText = 'margin-top: 16px; padding: 12px; background: rgba(96, 165, 250, 0.1); border: 1px solid rgba(96, 165, 250, 0.2); border-radius: 8px; font-size: 0.75rem; color: #60a5fa;';
      footer.innerHTML = `<strong>* Valores corrigidos pelo conferente</strong> — ${corrections.length} correção(ões) aplicada(s)`;
      
      table.parentNode?.appendChild(footer);
    }

    // Serialize back to HTML
    const serializer = new XMLSerializer();
    const bodyContent = doc.body.innerHTML;
    
    return bodyContent;
  } catch (error) {
    console.error('[applyCorrectionsToHtml] Error applying corrections:', error);
    return html;
  }
}

/**
 * Creates history entries with corrections applied for PDF export
 */
export function createCorrectedHistoryEntries(
  analysisResults: Record<number, { html: string; summary?: string; generatedAt: string } | null>,
  corrections: ChbCorrection[]
): Array<{
  id: number;
  etapa: string;
  status: string;
  result_text: string;
  result_html: string;
  created_by_email: string;
  created_at: string;
}> {
  const entries: Array<{
    id: number;
    etapa: string;
    status: string;
    result_text: string;
    result_html: string;
    created_by_email: string;
    created_at: string;
  }> = [];

  for (const [step, result] of Object.entries(analysisResults)) {
    if (result) {
      // Apply corrections to this step's HTML
      const correctedHtml = applyCorrectionsToHtml(result.html, corrections);
      
      entries.push({
        id: parseInt(step),
        etapa: step,
        status: 'approved',
        result_text: result.summary || '',
        result_html: correctedHtml,
        created_by_email: '',
        created_at: result.generatedAt
      });
    }
  }

  return entries;
}
