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

// Convert HTML to plain text
function htmlToText(html: string): string {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  return tempDiv.textContent || tempDiv.innerText || '';
}

// Generate printable HTML content
function generatePrintableHTML(history: HistoryEntry[], reference: string): string {
  const entries = history.map(entry => {
    const content = entry.result_html 
      ? htmlToText(entry.result_html) 
      : entry.result_text || 'Sem conteúdo';
    
    return `
      <div style="margin-bottom: 24px; padding: 16px; border: 1px solid #ddd; border-radius: 8px; page-break-inside: avoid;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 12px; border-bottom: 1px solid #eee; padding-bottom: 8px;">
          <div>
            <span style="background: #f5b843; color: #000; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 600;">
              ${stepNames[entry.etapa] || `Etapa ${entry.etapa}`}
            </span>
          </div>
          <span style="color: #666; font-size: 12px;">${entry.created_at}</span>
        </div>
        <div style="font-size: 13px; line-height: 1.6; white-space: pre-wrap; color: #333;">
          ${content}
        </div>
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
        * { box-sizing: border-box; }
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          margin: 0; 
          padding: 24px;
          background: #fff;
          color: #333;
        }
        @media print {
          body { padding: 0; }
          .no-print { display: none !important; }
        }
      </style>
    </head>
    <body>
      <div style="margin-bottom: 24px; border-bottom: 2px solid #f5b843; padding-bottom: 16px;">
        <h1 style="margin: 0 0 8px 0; font-size: 24px; color: #333;">Histórico de Análises CHB</h1>
        <p style="margin: 0; color: #666; font-size: 14px;">
          Referência: <strong>${reference}</strong> | 
          Gerado em: ${new Date().toLocaleString('pt-BR')}
        </p>
      </div>
      
      ${entries}
      
      <div class="no-print" style="position: fixed; bottom: 20px; right: 20px;">
        <button onclick="window.print()" style="
          padding: 12px 24px;
          background: #f5b843;
          color: #000;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          font-size: 14px;
        ">
          Imprimir / Salvar PDF
        </button>
      </div>
    </body>
    </html>
  `;
}

export function exportChbHistoryToPDF(history: HistoryEntry[], reference: string): void {
  const printContent = generatePrintableHTML(history, reference);
  
  // Open print window
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(printContent);
    printWindow.document.close();
  }
}
