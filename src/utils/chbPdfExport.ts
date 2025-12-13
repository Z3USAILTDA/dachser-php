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
  const entries = history.map(entry => {
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
          font-family: 'Segoe UI', Roboto, Arial, sans-serif;
          padding: 32px;
          background: #fff;
          color: #1a1a1a;
          line-height: 1.5;
        }
        .header {
          border-bottom: 3px solid #f5b843;
          padding-bottom: 16px;
          margin-bottom: 24px;
        }
        .header h1 {
          font-size: 22px;
          font-weight: 700;
          color: #111;
          margin-bottom: 6px;
        }
        .header p {
          font-size: 13px;
          color: #555;
        }
        .header strong { color: #222; }
        .entry {
          margin-bottom: 28px;
          border: 1px solid #ddd;
          border-radius: 6px;
          overflow: hidden;
          page-break-inside: avoid;
        }
        .entry-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 14px;
          background: #f8f8f8;
          border-bottom: 1px solid #ddd;
        }
        .step-badge {
          background: #f5b843;
          color: #000;
          padding: 4px 10px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 600;
        }
        .date {
          font-size: 12px;
          color: #666;
        }
        .analysis-content {
          padding: 14px;
          font-size: 12px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 10px 0;
        }
        table th, table td {
          border: 1px solid #ccc;
          padding: 6px 8px;
          text-align: left;
          font-size: 11px;
        }
        table th {
          background: #f0f0f0;
          font-weight: 600;
        }
        table tr:nth-child(even) td {
          background: #fafafa;
        }
        h3, h4 {
          margin: 12px 0 6px 0;
          font-size: 13px;
        }
        ul, ol {
          margin: 6px 0;
          padding-left: 18px;
        }
        li { margin: 2px 0; }
        p { margin: 6px 0; }
        @media print {
          body { padding: 16px; }
          .no-print { display: none !important; }
          .entry { break-inside: avoid; }
        }
        .print-btn {
          position: fixed;
          bottom: 24px;
          right: 24px;
          padding: 12px 24px;
          background: #f5b843;
          color: #000;
          border: none;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
          font-size: 14px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
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
