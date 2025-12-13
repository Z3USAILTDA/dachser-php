import { ChbApprovedHistory } from '@/types/chb';
import { stepTitles } from '@/data/chbMocks';
import { Clock, User, Copy, CheckCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface ChbHistoryPanelProps {
  stepId: number;
  approvedHistory: Record<number, ChbApprovedHistory[]>;
}

const variantColors = {
  success: 'bg-green-500/20 text-green-400 border-green-500/30',
  warning: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  error: 'bg-red-500/20 text-red-400 border-red-500/30',
};

export function ChbHistoryPanel({ stepId, approvedHistory }: ChbHistoryPanelProps) {
  const copyResult = (entry: ChbApprovedHistory) => {
    // Extract only parecer text for copying
    const parecerHtml = extractParecer(entry.detailedSummary || entry.summary);
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = parecerHtml;
    navigator.clipboard.writeText(tempDiv.textContent || tempDiv.innerText || '');
    toast.success('Parecer copiado para a área de transferência');
  };

  const stepNames: Record<number, string> = {
    1: 'Pré-Alerta',
    2: 'Instrução',
    3: 'DI/Fechamento',
  };

  // Extract only "Parecer do Modelo" section from HTML
  const extractParecer = (html: string): string => {
    if (!html) return '';
    
    // Try to find the Parecer section
    const parecerMatch = html.match(/<h4[^>]*>.*?Parecer.*?<\/h4>([\s\S]*?)(?=<h4|$)/i);
    if (parecerMatch) {
      return `<div class="parecer-section">${parecerMatch[0]}</div>`;
    }
    
    // Alternative: look for parecer-related content
    const altMatch = html.match(/Parecer[\s\S]*?(?:Impedimento|Nível de risco|Principal)[\s\S]*?(?=<h4|<\/div>$|$)/i);
    if (altMatch) {
      return `<div class="parecer-section">${altMatch[0]}</div>`;
    }
    
    // Fallback: return a summary if no parecer found
    return html;
  };

  // Collect all history entries up to and including current step
  const allHistoryEntries: ChbApprovedHistory[] = [];
  for (let i = 1; i <= stepId; i++) {
    const stepHistory = approvedHistory[i] || [];
    allHistoryEntries.push(...stepHistory);
  }

  // Sort by date descending (most recent first)
  allHistoryEntries.sort((a, b) => {
    try {
      const parseDate = (dateStr: string) => {
        // Handle ISO format
        if (dateStr.includes('T')) {
          return new Date(dateStr);
        }
        // Handle BR format: DD/MM/YYYY HH:mm
        const parts = dateStr.split(' ');
        if (parts.length >= 2) {
          const [day, month, year] = parts[0].split('/');
          return new Date(`${year}-${month}-${day}T${parts[1]}`);
        }
        return new Date(dateStr);
      };
      return parseDate(b.date).getTime() - parseDate(a.date).getTime();
    } catch {
      return 0;
    }
  });

  // Format date for display
  const formatDate = (dateStr: string): string => {
    try {
      const date = dateStr.includes('T') ? new Date(dateStr) : new Date();
      return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-white">
        Histórico aprovado — {stepTitles[stepId]}
      </h3>

      {allHistoryEntries.length === 0 ? (
        <div className="p-6 text-center rounded-xl bg-black/30 border border-white/10">
          <Clock className="w-10 h-10 text-white/20 mx-auto mb-3" />
          <p className="text-white/40 text-sm">Nenhum histórico aprovado para esta etapa.</p>
          <p className="text-xs text-white/30 mt-1">
            Execute uma análise e aprove para criar um registro no histórico.
          </p>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-white/10" />
          
          <div className="space-y-4">
            {allHistoryEntries.map((entry) => (
              <div key={entry.id} className="relative pl-10">
                <div className="absolute left-2 top-2 w-3 h-3 rounded-full bg-amber-500 border-2 border-black flex items-center justify-center">
                  <CheckCircle className="w-1.5 h-1.5 text-black" />
                </div>
                
                <div className="p-3 rounded-lg bg-black/30 border border-white/10">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[0.65rem] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium">
                          {stepNames[entry.stepId] || `Etapa ${entry.stepId}`}
                        </span>
                        <span className="text-[0.65rem] text-white/50 flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          {formatDate(entry.date)}
                        </span>
                        {entry.user && entry.user !== 'Usuário' && (
                          <span className="text-[0.65rem] text-amber-500 flex items-center gap-1">
                            <User className="w-2.5 h-2.5" />
                            {entry.user}
                          </span>
                        )}
                      </div>
                      
                      {/* Show only Parecer do Modelo */}
                      <div 
                        className="text-xs text-white/70 leading-relaxed bg-black/20 p-2 rounded border border-white/5 chb-analysis-content"
                        dangerouslySetInnerHTML={{ __html: extractParecer(entry.detailedSummary || entry.summary) }}
                      />
                    </div>
                    
                    <button
                      onClick={() => copyResult(entry)}
                      className="p-1.5 rounded-md hover:bg-white/5 text-white/40 hover:text-white transition-colors"
                      title="Copiar parecer"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
