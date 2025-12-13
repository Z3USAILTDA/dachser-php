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
    navigator.clipboard.writeText(entry.detailedSummary || entry.summary);
    toast.success('Resultado copiado para a área de transferência');
  };

  const stepNames: Record<number, string> = {
    1: 'Pré-Alerta',
    2: 'Instrução',
    3: 'DI/Fechamento',
  };

  // Collect all history entries up to and including current step
  const allHistoryEntries: ChbApprovedHistory[] = [];
  for (let i = 1; i <= stepId; i++) {
    const stepHistory = approvedHistory[i] || [];
    allHistoryEntries.push(...stepHistory);
  }

  // Sort by date descending (most recent first)
  allHistoryEntries.sort((a, b) => {
    const dateA = new Date(a.date.split(' ')[0].split('/').reverse().join('-') + 'T' + a.date.split(' ')[1]);
    const dateB = new Date(b.date.split(' ')[0].split('/').reverse().join('-') + 'T' + b.date.split(' ')[1]);
    return dateB.getTime() - dateA.getTime();
  });

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
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[0.65rem] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium">
                          {stepNames[entry.stepId] || `Etapa ${entry.stepId}`}
                        </span>
                        <span className="text-[0.65rem] text-white/50 flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          {entry.date}
                        </span>
                        <span className="text-[0.65rem] text-amber-500 flex items-center gap-1">
                          <User className="w-2.5 h-2.5" />
                          {entry.user}
                        </span>
                      </div>
                      
                      {/* Tags */}
                      <div className="flex flex-wrap gap-1 mb-2">
                        {entry.tags.map((tag, index) => (
                          <Badge key={index} className={`${variantColors[tag.variant]} border text-[0.6rem] px-1.5 py-0`}>
                            {tag.label}
                          </Badge>
                        ))}
                      </div>
                      
                      {/* Detailed summary with parecer - render as HTML if available */}
                      <div 
                        className="text-xs text-white/70 leading-relaxed bg-black/20 p-2 rounded border border-white/5 chb-analysis-content"
                        dangerouslySetInnerHTML={{ __html: entry.detailedSummary || entry.summary }}
                      />
                    </div>
                    
                    <button
                      onClick={() => copyResult(entry)}
                      className="p-1.5 rounded-md hover:bg-white/5 text-white/40 hover:text-white transition-colors"
                      title="Copiar resultado"
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
