import { AlertTriangle, CheckCircle2, XCircle, Info } from 'lucide-react';

interface ComparisonRow {
  status: 'success' | 'warning' | 'error';
  campo: string;
  valores: Record<string, string>;
  divergencia?: string;
}

interface ChbComparisonGridProps {
  htmlContent: string;
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

export function ChbComparisonGrid({ htmlContent }: ChbComparisonGridProps) {
  const parsed = parseHtmlToRows(htmlContent);
  
  // If parsing fails, fall back to raw HTML rendering with improved styles
  if (!parsed || parsed.rows.length === 0) {
    return (
      <div className="chb-comparison-grid">
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
          /* Highlight rows with issues */
          .chb-comparison-grid tr:has(td:contains("🔴")) {
            background: rgba(239, 68, 68, 0.08);
          }
          .chb-comparison-grid tr:has(td:contains("🟨")) {
            background: rgba(245, 158, 11, 0.08);
          }
        `}</style>
      </div>
    );
  }
  
  // Render parsed structured grid
  return (
    <div className="space-y-4">
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
                {parsed.headers.map((header, colIdx) => (
                  <td 
                    key={colIdx}
                    className={`px-3 py-2 max-w-[180px] ${
                      row.status === 'error' ? 'text-red-300' :
                      row.status === 'warning' ? 'text-amber-300' :
                      'text-white/80'
                    }`}
                    title={row.valores[header] || '—'}
                  >
                    <span className="block truncate">
                      {row.valores[header] || '—'}
                    </span>
                  </td>
                ))}
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
    </div>
  );
}
