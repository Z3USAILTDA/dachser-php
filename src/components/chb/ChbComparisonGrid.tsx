import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, CheckCircle2, XCircle, FileText, MessageSquareWarning, ListChecks, Pencil } from 'lucide-react';
import { EditableCell } from './EditableCell';
import { useChbCorrections, ChbCorrection } from '@/hooks/useChbCorrections';

interface ComparisonRow {
  status: 'success' | 'warning' | 'error';
  campo: string;
  valores: Record<string, string>;
  divergencia?: string;
}

interface ParsedSections {
  observations: { type: 'critico' | 'alerta'; text: string }[];
  parecer: string[];
  actions: string[];
}

interface ChbComparisonGridProps {
  htmlContent: string;
  itemId?: number;
  editable?: boolean;
  onCorrectionSaved?: () => void;
}

// Parse HTML table to structured data for better rendering
function parseHtmlToRows(html: string): { headers: string[]; rows: ComparisonRow[] } | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const table = doc.querySelector('table');
    
    if (!table) return null;
    
    const headers: string[] = [];
    const headerCells = table.querySelectorAll('thead th');
    headerCells.forEach(th => headers.push(th.textContent?.trim() || ''));
    
    const rows: ComparisonRow[] = [];
    const bodyRows = table.querySelectorAll('tbody tr');
    
    bodyRows.forEach(tr => {
      const cells = tr.querySelectorAll('td');
      if (cells.length === 0) return;
      
      // Detect status from content (first or last column typically has icons)
      let status: 'success' | 'warning' | 'error' = 'success';
      let statusCellIndex = -1;
      
      cells.forEach((cell, idx) => {
        const text = cell.textContent || '';
        if (text.includes('🔴')) {
          status = 'error';
          statusCellIndex = idx;
        } else if (text.includes('🟨')) {
          status = 'warning';
          statusCellIndex = idx;
        } else if (text.includes('✅')) {
          status = 'success';
          statusCellIndex = idx;
        }
      });
      
      // Build row data
      const valores: Record<string, string> = {};
      let campo = '';
      
      cells.forEach((cell, idx) => {
        const text = cell.textContent?.trim() || '';
        const header = headers[idx] || `Col${idx}`;
        
        // Identify Campo column (usually "Campo" or first non-status column)
        if (header.toLowerCase() === 'campo' || header.toLowerCase() === 'field') {
          campo = text;
        } else if (idx !== statusCellIndex && header.toLowerCase() !== 'status') {
          valores[header] = text;
        }
      });
      
      // If no explicit Campo column, use first value
      if (!campo && cells.length > 0) {
        campo = cells[0].textContent?.trim() || '';
      }
      
      rows.push({ status, campo, valores });
    });
    
    // Filter headers to remove Status column for display
    const displayHeaders = headers.filter(h => 
      h.toLowerCase() !== 'status' && h.toLowerCase() !== 'campo' && h.toLowerCase() !== 'field'
    );
    
    return { headers: displayHeaders, rows };
  } catch {
    return null;
  }
}

// Parse sections from HTML (Observações, Parecer, Próximas Ações)
function parseSections(html: string): ParsedSections {
  const sections: ParsedSections = {
    observations: [],
    parecer: [],
    actions: []
  };
  
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Find Observações section
    const observationsSection = doc.querySelector('.observations-section') || 
      Array.from(doc.querySelectorAll('h4')).find(h => h.textContent?.includes('Observações'))?.parentElement;
    
    if (observationsSection) {
      const paragraphs = observationsSection.querySelectorAll('p');
      paragraphs.forEach(p => {
        const text = p.textContent?.trim() || '';
        if (text.includes('🔴')) {
          sections.observations.push({ type: 'critico', text: text.replace('🔴', '').trim() });
        } else if (text.includes('🟨')) {
          sections.observations.push({ type: 'alerta', text: text.replace('🟨', '').trim() });
        }
      });
    }
    
    // Fallback: search for observation patterns in full HTML
    if (sections.observations.length === 0) {
      const observationMatches = html.matchAll(/<p[^>]*>([^<]*(?:🔴|🟨)[^<]*)<\/p>/g);
      for (const match of observationMatches) {
        const text = match[1].trim();
        if (text.includes('🔴')) {
          sections.observations.push({ type: 'critico', text: text.replace('🔴', '').trim() });
        } else if (text.includes('🟨')) {
          sections.observations.push({ type: 'alerta', text: text.replace('🟨', '').trim() });
        }
      }
    }
    
    // Find Parecer section
    const parecerSection = doc.querySelector('.parecer-section') ||
      Array.from(doc.querySelectorAll('h4')).find(h => h.textContent?.includes('Parecer'))?.parentElement;
    
    if (parecerSection) {
      const paragraphs = parecerSection.querySelectorAll('p');
      paragraphs.forEach(p => {
        const text = p.textContent?.trim() || '';
        if (text) sections.parecer.push(text);
      });
    }
    
    // Find Próximas Ações section
    const actionsSection = doc.querySelector('.actions-section') ||
      Array.from(doc.querySelectorAll('h4')).find(h => h.textContent?.includes('Ações') || h.textContent?.includes('ações'))?.parentElement;
    
    if (actionsSection) {
      const listItems = actionsSection.querySelectorAll('li');
      listItems.forEach(li => {
        const text = li.textContent?.trim() || '';
        if (text) sections.actions.push(text);
      });
    }
    
  } catch (e) {
    console.error('Error parsing sections:', e);
  }
  
  return sections;
}

function StatusIcon({ status }: { status: 'success' | 'warning' | 'error' }) {
  switch (status) {
    case 'success':
      return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
    case 'warning':
      return <AlertTriangle className="w-4 h-4 text-amber-400" />;
    case 'error':
      return <XCircle className="w-4 h-4 text-red-400" />;
  }
}

function StatusBadge({ status }: { status: 'success' | 'warning' | 'error' }) {
  const styles = {
    success: 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400',
    warning: 'bg-amber-500/20 border-amber-500/30 text-amber-400',
    error: 'bg-red-500/20 border-red-500/30 text-red-400',
  };
  
  const labels = {
    success: 'Conforme',
    warning: 'Alerta',
    error: 'Crítico',
  };
  
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.65rem] font-medium border ${styles[status]}`}>
      <StatusIcon status={status} />
      {labels[status]}
    </span>
  );
}

// Observation Card Component
function ObservationsCard({ observations }: { observations: ParsedSections['observations'] }) {
  if (observations.length === 0) return null;
  
  const criticos = observations.filter(o => o.type === 'critico');
  const alertas = observations.filter(o => o.type === 'alerta');
  
  return (
    <div className="rounded-lg border border-white/10 bg-[#1a1b23] overflow-hidden">
      <div className="px-4 py-2.5 bg-[#14151c] border-b border-white/10 flex items-center gap-2">
        <FileText className="w-4 h-4 text-amber-400" />
        <h4 className="text-sm font-semibold text-white">Observações</h4>
        <span className="ml-auto text-xs text-white/50">{observations.length} item(s)</span>
      </div>
      <div className="p-4 space-y-3">
        {criticos.map((obs, idx) => (
          <div key={`crit-${idx}`} className="flex gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-200 leading-relaxed">{obs.text}</p>
          </div>
        ))}
        {alertas.map((obs, idx) => (
          <div key={`alert-${idx}`} className="flex gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-200 leading-relaxed">{obs.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// Parecer Card Component
function ParecerCard({ parecer }: { parecer: string[] }) {
  if (parecer.length === 0) return null;
  
  // Determine overall risk level from parecer content
  const hasRiscoAlto = parecer.some(p => p.includes('🔴') || p.toLowerCase().includes('alto') || p.toLowerCase().includes('sim'));
  const hasRiscoMedio = parecer.some(p => p.includes('🟨') || p.toLowerCase().includes('médio'));
  
  const riskColor = hasRiscoAlto ? 'red' : hasRiscoMedio ? 'amber' : 'emerald';
  const borderColor = hasRiscoAlto ? 'border-red-500/30' : hasRiscoMedio ? 'border-amber-500/30' : 'border-emerald-500/30';
  const bgColor = hasRiscoAlto ? 'bg-red-500/5' : hasRiscoMedio ? 'bg-amber-500/5' : 'bg-emerald-500/5';
  
  return (
    <div className={`rounded-lg border ${borderColor} ${bgColor} overflow-hidden`}>
      <div className="px-4 py-2.5 bg-[#14151c] border-b border-white/10 flex items-center gap-2">
        <MessageSquareWarning className={`w-4 h-4 text-${riskColor}-400`} />
        <h4 className="text-sm font-semibold text-white">Parecer do Modelo</h4>
      </div>
      <div className="p-4 space-y-2">
        {parecer.map((text, idx) => (
          <p key={idx} className="text-sm text-white/80 leading-relaxed">
            {text}
          </p>
        ))}
      </div>
    </div>
  );
}

// Actions Card Component
function ActionsCard({ actions }: { actions: string[] }) {
  if (actions.length === 0) return null;
  
  return (
    <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 overflow-hidden">
      <div className="px-4 py-2.5 bg-[#14151c] border-b border-white/10 flex items-center gap-2">
        <ListChecks className="w-4 h-4 text-blue-400" />
        <h4 className="text-sm font-semibold text-white">Próximas Ações</h4>
      </div>
      <div className="p-4">
        <ul className="space-y-2">
          {actions.map((action, idx) => (
            <li key={idx} className="flex gap-2 text-sm text-blue-200">
              <span className="text-blue-400">•</span>
              <span>{action}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// Helper to normalize field name for matching
function normalizeFieldName(campo: string): string {
  return campo
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

export function ChbComparisonGrid({ 
  htmlContent, 
  itemId,
  editable = false,
  onCorrectionSaved
}: ChbComparisonGridProps) {
  const parsed = parseHtmlToRows(htmlContent);
  const sections = parseSections(htmlContent);
  
  const {
    corrections,
    isSaving,
    fetchCorrections,
    saveCorrection,
    getCorrectionForField,
  } = useChbCorrections(itemId);

  // Load corrections when itemId changes
  useEffect(() => {
    if (itemId && editable) {
      fetchCorrections(itemId);
    }
  }, [itemId, editable, fetchCorrections]);

  const handleSaveCorrection = useCallback(async (
    filename: string,
    fieldName: string,
    originalValue: string,
    newValue: string
  ): Promise<boolean> => {
    if (!itemId) return false;

    const result = await saveCorrection({
      item_id: itemId,
      filename,
      field_name: normalizeFieldName(fieldName),
      original_value: originalValue,
      corrected_value: newValue,
    });

    if (result.success) {
      onCorrectionSaved?.();
    }

    return result.success;
  }, [itemId, saveCorrection, onCorrectionSaved]);
  
  // If parsing fails, fall back to raw HTML rendering with improved styles
  if (!parsed || parsed.rows.length === 0) {
    return (
      <div className="chb-comparison-grid space-y-4">
        <div 
          className="prose prose-invert prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
        
        <style>{`
          .chb-comparison-grid table {
            width: 100%;
            border-collapse: separate;
            border-spacing: 0;
            font-size: 0.75rem;
          }
          .chb-comparison-grid thead {
            position: sticky;
            top: 0;
            z-index: 10;
          }
          .chb-comparison-grid th {
            background: rgba(20, 21, 28, 0.98);
            padding: 8px 10px;
            text-align: left;
            font-weight: 600;
            font-size: 0.7rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #aaa;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            white-space: nowrap;
          }
          .chb-comparison-grid th:first-child {
            min-width: 80px;
          }
          .chb-comparison-grid td {
            padding: 8px 10px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.06);
            color: #e5e5e5;
            max-width: 200px;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .chb-comparison-grid tr:hover td {
            background: rgba(255, 255, 255, 0.03);
          }
          .chb-comparison-grid .observations-section,
          .chb-comparison-grid .parecer-section,
          .chb-comparison-grid .actions-section {
            margin-top: 1.5rem;
            padding: 1rem;
            border-radius: 0.5rem;
            border: 1px solid rgba(255, 255, 255, 0.1);
          }
          .chb-comparison-grid .observations-section {
            background: rgba(245, 158, 11, 0.05);
            border-color: rgba(245, 158, 11, 0.2);
          }
          .chb-comparison-grid .parecer-section {
            background: rgba(239, 68, 68, 0.05);
            border-color: rgba(239, 68, 68, 0.2);
          }
          .chb-comparison-grid .actions-section {
            background: rgba(59, 130, 246, 0.05);
            border-color: rgba(59, 130, 246, 0.2);
          }
          .chb-comparison-grid h4 {
            color: #fff;
            font-weight: 600;
            margin-bottom: 0.75rem;
          }
        `}</style>
      </div>
    );
  }
  
  // Render parsed structured grid with sections
  return (
    <div className="space-y-6">
      {/* Editable Mode Indicator */}
      {editable && (
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs text-blue-300">
          <Pencil className="w-3.5 h-3.5" />
          <span>Modo de edição ativo. Clique em qualquer valor para corrigir.</span>
          {corrections.length > 0 && (
            <span className="ml-auto text-blue-400 font-medium">
              {corrections.length} correção(ões) salva(s)
            </span>
          )}
        </div>
      )}

      {/* Main Comparison Table */}
      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full text-[0.75rem]">
          <thead>
            <tr className="bg-[#14151c]">
              <th className="px-3 py-2 text-left text-[0.7rem] uppercase tracking-wider text-[#aaa] font-semibold border-b border-white/10 w-24">
                Status
              </th>
              <th className="px-3 py-2 text-left text-[0.7rem] uppercase tracking-wider text-[#aaa] font-semibold border-b border-white/10 min-w-[120px]">
                Campo
              </th>
              {parsed.headers.map((header, idx) => (
                <th 
                  key={idx} 
                  className="px-3 py-2 text-left text-[0.7rem] uppercase tracking-wider text-[#aaa] font-semibold border-b border-white/10 max-w-[180px]"
                  title={header}
                >
                  <span className="block truncate">{header}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {parsed.rows.map((row, idx) => (
              <tr 
                key={idx}
                className={`
                  border-b border-white/5 transition-colors
                  ${row.status === 'error' ? 'bg-red-500/5 hover:bg-red-500/10' : ''}
                  ${row.status === 'warning' ? 'bg-amber-500/5 hover:bg-amber-500/10' : ''}
                  ${row.status === 'success' ? 'hover:bg-white/5' : ''}
                `}
              >
                <td className="px-3 py-2">
                  <StatusBadge status={row.status} />
                </td>
                <td className="px-3 py-2 font-medium text-white">
                  {row.campo}
                </td>
                {parsed.headers.map((header, colIdx) => {
                  const value = row.valores[header] || '—';
                  const normalizedField = normalizeFieldName(row.campo);
                  const correction = editable ? getCorrectionForField(header, normalizedField) : undefined;

                  if (editable) {
                    return (
                      <td key={colIdx} className="px-3 py-2 max-w-[180px]">
                        <EditableCell
                          value={value}
                          filename={header}
                          fieldName={row.campo}
                          status={row.status}
                          correction={correction ? {
                            original_value: correction.original_value,
                            corrected_value: correction.corrected_value,
                            location_reference: correction.location_reference,
                            location_confidence: correction.location_confidence,
                            is_validated: correction.is_validated,
                          } : undefined}
                          onSave={(newValue) => handleSaveCorrection(header, row.campo, value, newValue)}
                          disabled={isSaving}
                        />
                      </td>
                    );
                  }

                  return (
                    <td 
                      key={colIdx}
                      className={`px-3 py-2 max-w-[180px] ${
                        row.status === 'error' ? 'text-red-300' :
                        row.status === 'warning' ? 'text-amber-300' :
                        'text-white/80'
                      }`}
                      title={value}
                    >
                      <span className="block truncate">{value}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Summary badges */}
      <div className="flex items-center gap-3 text-[0.7rem]">
        <div className="flex items-center gap-1.5 text-emerald-400">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>{parsed.rows.filter(r => r.status === 'success').length} Conforme</span>
        </div>
        <div className="flex items-center gap-1.5 text-amber-400">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>{parsed.rows.filter(r => r.status === 'warning').length} Alerta</span>
        </div>
        <div className="flex items-center gap-1.5 text-red-400">
          <XCircle className="w-3.5 h-3.5" />
          <span>{parsed.rows.filter(r => r.status === 'error').length} Crítico</span>
        </div>
      </div>
      
      {/* Observações Section */}
      <ObservationsCard observations={sections.observations} />
      
      {/* Parecer Section */}
      <ParecerCard parecer={sections.parecer} />
      
      {/* Próximas Ações Section */}
      <ActionsCard actions={sections.actions} />
    </div>
  );
}
