import { ChbApprovedHistory } from '@/types/chb';
import { stepTitles } from '@/data/chbMocks';
import { Clock, Copy, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import { copyHtmlAsText } from '@/utils/clipboard';

interface ChbHistoryPanelProps {
  stepId: number;
  approvedHistory: Record<number, ChbApprovedHistory[]>;
}

export function ChbHistoryPanel({ stepId, approvedHistory }: ChbHistoryPanelProps) {
  const copyResult = async (entry: ChbApprovedHistory) => {
    const parecerHtml = extractParecer(entry.detailedSummary || entry.summary);
    const ok = await copyHtmlAsText(parecerHtml);
    if (ok) {
      toast.success('Parecer copiado para a área de transferência');
    } else {
      toast.error('Não foi possível copiar. Tente selecionar o texto manualmente.');
    }
  };

  const stepNames: Record<number, string> = {
    1: 'Pré-Alerta',
    2: 'Instrução',
    3: 'DI/Fechamento',
  };

  const extractParecer = (html: string): string => {
    if (!html) return '';
    
    const parecerMatch = html.match(/<h4[^>]*>.*?Parecer.*?<\/h4>([\s\S]*?)(?=<h4|$)/i);
    if (parecerMatch) {
      return `<div class="parecer-section">${parecerMatch[0]}</div>`;
    }
    
    const altMatch = html.match(/Parecer[\s\S]*?(?:Impedimento|Nível de risco|Principal)[\s\S]*?(?=<h4|<\/div>$|$)/i);
    if (altMatch) {
      return `<div class="parecer-section">${altMatch[0]}</div>`;
    }
    
    return html;
  };

  const allHistoryEntries: ChbApprovedHistory[] = [];
  for (let i = 1; i <= stepId; i++) {
    const stepHistory = approvedHistory[i] || [];
    allHistoryEntries.push(...stepHistory);
  }

  allHistoryEntries.sort((a, b) => {
    try {
      const parseDate = (dateStr: string) => {
        if (dateStr.includes('T')) {
          return new Date(dateStr);
        }
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
          <ClipboardList className="w-10 h-10 text-white/20 mx-auto mb-3" />
          <p className="text-white/40 text-sm">Nenhum histórico aprovado para esta etapa.</p>
          <p className="text-xs text-white/30 mt-1">
            Execute uma análise e aprove para criar um registro no histórico.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {allHistoryEntries.map((entry) => (
            <div key={entry.id} className="p-4 rounded-lg bg-black/30 border border-white/10">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[0.65rem] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium">
                      {stepNames[entry.stepId] || `Etapa ${entry.stepId}`}
                    </span>
                    <span className="text-[0.65rem] text-white/50 flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" />
                      {formatDate(entry.date)}
                    </span>
                  </div>
                  
                  <div 
                    className="text-xs text-white/70 leading-relaxed bg-black/20 p-4 rounded border border-white/5 chb-analysis-content"
                    dangerouslySetInnerHTML={{ __html: extractParecer(entry.detailedSummary || entry.summary) }}
                  />
                </div>
                
                <button
                  onClick={() => copyResult(entry)}
                  className="p-1.5 rounded-md hover:bg-white/5 text-white/40 hover:text-white transition-colors flex-shrink-0"
                  title="Copiar parecer"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
