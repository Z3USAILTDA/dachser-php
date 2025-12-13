// CHB History PDF Export Utility

interface HistoryEntry {
  id: number;
  etapa: string;
  status: string;
  result_text: string;
  result_html: string;
  created_by_email: string;
  created_at: string;
}

const stepNames: Record<string, string> = {
  '1': 'Pré-Alerta',
  '2': 'Instrução',
  '3': 'DI/Fechamento',
};

function generatePrintableHTML(history: HistoryEntry[], reference: string): string {
  // Sort by etapa (step order)
  const sortedHistory = [...history].sort((a, b) => 
    parseInt(a.etapa) - parseInt(b.etapa)
  );

  const entries = sortedHistory.map(entry => {
    const content = entry.result_html || entry.result_text || 'Sem conteúdo';
    
    return `
      <div class="entry">
        <div class="entry-header">
          <span class="step-badge">${stepNames[entry.etapa] || `Etapa ${entry.etapa}`}</span>
          <span class="date">${entry.created_at}</span>
        </div>
        <div class="analysis-content">${content}</div>
      </div>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Histórico de Análises - ${reference}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { 
          font-family: Arial, sans-serif;
          padding: 20px;
          background: #fff;
          color: #1a1a1a;
          font-size: 9px;
          line-height: 1.3;
        }
        .header {
          border-bottom: 2px solid #f5b843;
          padding-bottom: 8px;
          margin-bottom: 12px;
        }
        .header h1 {
          font-size: 14px;
          font-weight: 700;
          margin-bottom: 2px;
        }
        .header p {
          font-size: 9px;
          color: #555;
        }
        .entry {
          margin-bottom: 14px;
          border: 1px solid #ccc;
          border-radius: 4px;
          overflow: hidden;
          page-break-inside: avoid;
        }
        .entry-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 4px 8px;
          background: #f5f5f5;
          border-bottom: 1px solid #ccc;
        }
        .step-badge {
          background: #f5b843;
          color: #000;
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 8px;
          font-weight: 600;
        }
        .date {
          font-size: 8px;
          color: #666;
        }
        .analysis-content {
          padding: 8px;
          font-size: 9px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 4px 0;
        }
        table th, table td {
          border: 1px solid #bbb;
          padding: 3px 5px;
          text-align: left;
          font-size: 8px;
          white-space: nowrap;
        }
        table th {
          background: #eee;
          font-weight: 600;
        }
        table tr:nth-child(even) td {
          background: #fafafa;
        }
        h3, h4 {
          margin: 6px 0 3px 0;
          font-size: 10px;
        }
        ul, ol {
          margin: 3px 0;
          padding-left: 14px;
        }
        li { margin: 1px 0; }
        p { margin: 3px 0; }
        @media print {
          body { padding: 10px; }
          .no-print { display: none !important; }
          .entry { break-inside: avoid; }
        }
        .print-btn {
          position: fixed;
          bottom: 20px;
          right: 20px;
          padding: 10px 20px;
          background: #f5b843;
          color: #000;
          border: none;
          border-radius: 5px;
          font-weight: 600;
          cursor: pointer;
          font-size: 12px;
          box-shadow: 0 3px 10px rgba(0,0,0,0.15);
        }
        .print-btn:hover { background: #e5a833; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Histórico de Análises CHB</h1>
        <p>Referência: <strong>${reference}</strong> | Gerado em: ${new Date().toLocaleString('pt-BR')}</p>
      </div>
      
      ${entries}
      
      <button class="print-btn no-print" onclick="window.print()">Imprimir / Salvar PDF</button>
    </body>
    </html>
  `;
}

export function exportChbHistoryToPDF(history: HistoryEntry[], reference: string): void {
  const printContent = generatePrintableHTML(history, reference);
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(printContent);
    printWindow.document.close();
  }
}
