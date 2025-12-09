import { useState } from 'react';
import { ChbAnalysis } from '@/types/chb';
import { stepTitles, analysisByStep } from '@/data/chbMocks';
import { Bot, Play, CheckCircle, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface ChbAnalysisPanelProps {
  stepId: number;
  analysis: ChbAnalysis;
  onApproveAndAdvance: () => void;
}

const variantColors = {
  success: 'bg-green-500/20 text-green-400 border-green-500/30',
  warning: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  error: 'bg-red-500/20 text-red-400 border-red-500/30',
};

export function ChbAnalysisPanel({ stepId, analysis, onApproveAndAdvance }: ChbAnalysisPanelProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [currentAnalysis, setCurrentAnalysis] = useState(analysis);

  const runAnalysis = async () => {
    setIsLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    
    const updatedAnalysis = {
      ...analysisByStep[stepId],
      generatedAt: new Date().toLocaleString('pt-BR'),
      content: analysisByStep[stepId].content + '\n\n**[Atualização]** Nova análise executada com sucesso.',
    };
    
    setCurrentAnalysis(updatedAnalysis);
    setIsLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">
          Análise automatizada — {stepTitles[stepId]}
        </h3>
        <span className="text-xs text-white/40">
          Gerado em: {currentAnalysis.generatedAt}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {currentAnalysis.tags.map((tag, index) => (
          <Badge key={index} className={`${variantColors[tag.variant]} border`}>
            {tag.label}
          </Badge>
        ))}
      </div>

      <div className="p-6 rounded-xl bg-black/30 border border-white/10">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0">
            <Bot className="w-5 h-5 text-amber-500" />
          </div>
          <div className="prose prose-invert prose-sm max-w-none">
            <div
              dangerouslySetInnerHTML={{
                __html: currentAnalysis.content
                  .replace(/\n/g, '<br />')
                  .replace(/##\s(.+)/g, '<h4 class="text-white font-semibold mt-4 mb-2">$1</h4>')
                  .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white">$1</strong>')
                  .replace(/•/g, '<span class="text-amber-500">•</span>'),
              }}
            />
          </div>
        </div>
      </div>

      <div className="flex gap-4">
        <button
          onClick={runAnalysis}
          disabled={isLoading}
          className="flex items-center gap-2 px-6 py-3 rounded-full bg-amber-500 text-black font-medium
            hover:bg-amber-400 transition-colors disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Analisando...
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Rodar análise desta etapa
            </>
          )}
        </button>

        <button
          onClick={onApproveAndAdvance}
          disabled={isLoading}
          className="flex items-center gap-2 px-6 py-3 rounded-full bg-white/10 border border-white/20
            text-white font-medium hover:bg-white/20 transition-colors disabled:opacity-50"
        >
          <CheckCircle className="w-4 h-4" />
          Aprovar etapa & avançar
        </button>
      </div>
    </div>
  );
}
