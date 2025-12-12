import { ChbApprovedHistory } from '@/types/chb';
import { stepTitles } from '@/data/chbMocks';
import { Clock, User, Copy, CheckCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface ChbHistoryPanelProps {
  stepId: number;
  approvedHistory: ChbApprovedHistory[];
}

const variantColors = {
  success: 'bg-green-500/20 text-green-400 border-green-500/30',
  warning: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  error: 'bg-red-500/20 text-red-400 border-red-500/30',
};

export function ChbHistoryPanel({ stepId, approvedHistory }: ChbHistoryPanelProps) {
  const copyResult = (entry: ChbApprovedHistory) => {
    navigator.clipboard.writeText(entry.summary);
    toast.success('Resultado copiado para a área de transferência');
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-white">
        Histórico aprovado — {stepTitles[stepId]}
      </h3>

      {approvedHistory.length === 0 ? (
        <div className="p-8 text-center rounded-xl bg-black/30 border border-white/10">
          <Clock className="w-12 h-12 text-white/20 mx-auto mb-4" />
          <p className="text-white/40">Nenhum histórico aprovado para esta etapa.</p>
          <p className="text-sm text-white/30 mt-2">
            Execute uma análise e aprove para criar um registro no histórico.
          </p>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-white/10" />
          
          <div className="space-y-6">
            {approvedHistory.map((entry) => (
              <div key={entry.id} className="relative pl-12">
                <div className="absolute left-3 top-2 w-4 h-4 rounded-full bg-amber-500 border-4 border-black flex items-center justify-center">
                  <CheckCircle className="w-2 h-2 text-black" />
                </div>
                
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
                      
                      {/* Tags */}
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {entry.tags.map((tag, index) => (
                          <Badge key={index} className={`${variantColors[tag.variant]} border text-xs`}>
                            {tag.label}
                          </Badge>
                        ))}
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
