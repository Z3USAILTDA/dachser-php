import { ChbHistoryEntry } from '@/types/chb';
import { stepTitles } from '@/data/chbMocks';
import { Clock, User, Copy } from 'lucide-react';

interface ChbHistoryPanelProps {
  stepId: number;
  history: ChbHistoryEntry[];
}

export function ChbHistoryPanel({ stepId, history }: ChbHistoryPanelProps) {
  const copyResult = (entry: ChbHistoryEntry) => {
    console.log('Copiando resultado:', entry.summary);
    navigator.clipboard.writeText(entry.summary);
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-white">
        Histórico aprovado — {stepTitles[stepId]}
      </h3>

      {history.length === 0 ? (
        <div className="p-8 text-center rounded-xl bg-black/30 border border-white/10">
          <Clock className="w-12 h-12 text-white/20 mx-auto mb-4" />
          <p className="text-white/40">Nenhum histórico aprovado para esta etapa.</p>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-white/10" />
          
          <div className="space-y-6">
            {history.map((entry, index) => (
              <div key={entry.id} className="relative pl-12">
                <div className="absolute left-3 top-2 w-4 h-4 rounded-full bg-amber-500 border-4 border-black" />
                
                <div className="p-4 rounded-xl bg-black/30 border border-white/10">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-xs text-white/60 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {entry.date}
                        </span>
                        <span className="text-xs text-amber-500 flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {entry.user}
                        </span>
                      </div>
                      <p className="text-sm text-white/80">{entry.summary}</p>
                    </div>
                    
                    <button
                      onClick={() => copyResult(entry)}
                      className="p-2 rounded-lg hover:bg-white/5 text-white/40 hover:text-white transition-colors"
                      title="Copiar resultado"
                    >
                      <Copy className="w-4 h-4" />
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
