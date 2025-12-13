import { ChbAnalysisResult } from '@/types/chb';
import { stepTitles } from '@/data/chbMocks';
import { Play, CheckCircle, Loader2, RefreshCw, FileText } from 'lucide-react';

interface ChbAnalysisPanelProps {
  stepId: number;
  analysisResult: ChbAnalysisResult | null;
  onRunAnalysis: () => void;
  onApproveAndAdvance: () => void;
  isAnalyzing: boolean;
  hasFiles: boolean;
}

export function ChbAnalysisPanel({ 
  stepId, 
  analysisResult, 
  onRunAnalysis, 
  onApproveAndAdvance, 
  isAnalyzing,
  hasFiles 
}: ChbAnalysisPanelProps) {
  // No files uploaded yet
  if (!hasFiles && !analysisResult) {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-white">
          Análise automatizada — {stepTitles[stepId]}
        </h3>
        
        <div className="p-8 text-center rounded-lg bg-black/30 border border-white/10">
          <FileText className="w-12 h-12 text-white/20 mx-auto mb-3" />
          <p className="text-white/60 text-xs mb-1">Nenhum documento para analisar</p>
          <p className="text-[0.65rem] text-white/40">
            Vá para a aba "Documentos" e faça upload dos arquivos para iniciar a análise.
          </p>
        </div>
      </div>
    );
  }

  // Has files but no analysis yet
  if (!analysisResult) {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-white">
          Análise automatizada — {stepTitles[stepId]}
        </h3>
        
        <div className="p-8 text-center rounded-lg bg-black/30 border border-white/10">
          <FileText className="w-12 h-12 text-amber-500/40 mx-auto mb-3" />
          <p className="text-white/60 text-xs mb-3">
            {isAnalyzing 
              ? 'Processando documentos com IA...' 
              : 'Clique para iniciar a análise dos documentos.'}
          </p>
          
          <button
            onClick={onRunAnalysis}
            disabled={isAnalyzing}
            className="flex items-center gap-1.5 px-4 py-2 mx-auto rounded-full bg-amber-500 text-black text-xs font-medium
              hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Analisando...
              </>
            ) : (
              <>
                <Play className="w-3 h-3" />
                Iniciar Análise IA
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  // Has analysis result
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">
          Análise automatizada — {stepTitles[stepId]}
        </h3>
        <span className="text-[0.65rem] text-white/40">
          Gerado em: {analysisResult.generatedAt}
        </span>
      </div>

      {/* Files analyzed list */}
      <div className="text-[0.65rem] text-white/50">
        <span className="font-medium">Arquivos analisados:</span> {analysisResult.filesAnalyzed.join(', ')}
      </div>

      {/* Analysis HTML content - table and observations */}
      <div className="p-4 rounded-lg bg-black/30 border border-white/10 overflow-auto">
        <div 
          className="prose prose-invert prose-sm max-w-none chb-analysis-content"
          dangerouslySetInnerHTML={{ __html: analysisResult.html }}
        />
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          onClick={onRunAnalysis}
          disabled={isAnalyzing}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/10 border border-white/20
            text-white text-xs font-medium hover:bg-white/20 transition-colors disabled:opacity-50"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              Analisando...
            </>
          ) : (
            <>
              <RefreshCw className="w-3 h-3" />
              Fazer Análise Novamente
            </>
          )}
        </button>

        <button
          onClick={onApproveAndAdvance}
          disabled={isAnalyzing}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-amber-500 text-black text-xs font-medium
            hover:bg-amber-400 transition-colors disabled:opacity-50"
        >
          <CheckCircle className="w-3 h-3" />
          Aprovar etapa & avançar
        </button>
      </div>
    </div>
  );
}
