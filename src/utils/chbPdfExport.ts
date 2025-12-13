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
          padding: 12px;
          background: #fff;
          color: #1a1a1a;
          font-size: 7px;
          line-height: 1.2;
        }
        .header {
          border-bottom: 2px solid #f5b843;
          padding-bottom: 6px;
          margin-bottom: 10px;
        }
        .header h1 {
          font-size: 12px;
          font-weight: 700;
          margin-bottom: 2px;
        }
        .header p {
          font-size: 8px;
          color: #555;
        }
        .entry {
          margin-bottom: 10px;
          border: 1px solid #ccc;
          border-radius: 3px;
          overflow: hidden;
          page-break-inside: avoid;
        }
        .entry-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 3px 6px;
          background: #f5f5f5;
          border-bottom: 1px solid #ccc;
        }
        .step-badge {
          background: #f5b843;
          color: #000;
          padding: 1px 5px;
          border-radius: 2px;
          font-size: 7px;
          font-weight: 600;
        }
        .date {
          font-size: 7px;
          color: #666;
        }
        .analysis-content {
          padding: 6px;
          font-size: 7px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 3px 0;
          table-layout: fixed;
        }
        table th, table td {
          border: 1px solid #aaa;
          padding: 2px 3px;
          text-align: left;
          font-size: 6px;
          word-wrap: break-word;
          overflow-wrap: break-word;
          vertical-align: top;
        }
        table th {
          background: #e8e8e8;
          font-weight: 600;
          font-size: 6px;
        }
        table tr:nth-child(even) td {
          background: #f9f9f9;
        }
        h3, h4 {
          margin: 5px 0 2px 0;
          font-size: 8px;
        }
        ul, ol {
          margin: 2px 0;
          padding-left: 12px;
        }
        li { margin: 1px 0; font-size: 7px; }
        p { margin: 2px 0; }
        @media print {
          @page { margin: 8mm; size: A4 landscape; }
          body { padding: 0; }
          .no-print { display: none !important; }
          .entry { break-inside: avoid; }
        }
        .print-btn {
          position: fixed;
          bottom: 16px;
          right: 16px;
          padding: 8px 16px;
          background: #f5b843;
          color: #000;
          border: none;
          border-radius: 4px;
          font-weight: 600;
          cursor: pointer;
          font-size: 11px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
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
