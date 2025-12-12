import { ChbAnalysisResult } from '@/types/chb';
import { stepTitles } from '@/data/chbMocks';
import { Bot, Play, CheckCircle, Loader2, RefreshCw, AlertTriangle, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface ChbAnalysisPanelProps {
  stepId: number;
  analysisResult: ChbAnalysisResult | null;
  onRunAnalysis: () => void;
  onApproveAndAdvance: () => void;
  isAnalyzing: boolean;
  hasFiles: boolean;
}

const variantColors = {
  success: 'bg-green-500/20 text-green-400 border-green-500/30',
  warning: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  error: 'bg-red-500/20 text-red-400 border-red-500/30',
};

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
      <div className="space-y-6">
        <h3 className="text-lg font-semibold text-white">
          Análise automatizada — {stepTitles[stepId]}
        </h3>
        
        <div className="p-12 text-center rounded-xl bg-black/30 border border-white/10">
          <FileText className="w-16 h-16 text-white/20 mx-auto mb-4" />
          <p className="text-white/60 mb-2">Nenhum documento para analisar</p>
          <p className="text-sm text-white/40">
            Vá para a aba "Documentos" e faça upload dos arquivos para iniciar a análise.
          </p>
        </div>
      </div>
    );
  }

  // Has files but no analysis yet
  if (!analysisResult) {
    return (
      <div className="space-y-6">
        <h3 className="text-lg font-semibold text-white">
          Análise automatizada — {stepTitles[stepId]}
        </h3>
        
        <div className="p-12 text-center rounded-xl bg-black/30 border border-white/10">
          <Bot className="w-16 h-16 text-amber-500/40 mx-auto mb-4" />
          <p className="text-white/60 mb-4">
            {isAnalyzing 
              ? 'Processando documentos com IA...' 
              : 'Clique para iniciar a análise dos documentos.'}
          </p>
          
          <button
            onClick={onRunAnalysis}
            disabled={isAnalyzing}
            className="flex items-center gap-2 px-6 py-3 mx-auto rounded-full bg-amber-500 text-black font-medium
              hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Analisando...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Iniciar Análise IA
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  // Count tags by variant for summary
  const successCount = analysisResult.tags.filter(t => t.variant === 'success').length;
  const warningCount = analysisResult.tags.filter(t => t.variant === 'warning').length;
  const errorCount = analysisResult.tags.filter(t => t.variant === 'error').length;

  // Has analysis result
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">
          Análise automatizada — {stepTitles[stepId]}
        </h3>
        <div className="flex items-center gap-3">
          {analysisResult.usedFallback && (
            <Badge className="bg-orange-500/20 text-orange-400 border border-orange-500/30">
              <AlertTriangle className="w-3 h-3 mr-1" />
              Fallback OpenAI
            </Badge>
          )}
          <span className="text-xs text-white/40">
            Gerado em: {analysisResult.generatedAt}
          </span>
        </div>
      </div>

      {/* Summary card */}
      <div className="grid grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
          <FileText className="w-6 h-6 mx-auto mb-2 text-white/60" />
          <p className="text-2xl font-bold text-white">{analysisResult.filesAnalyzed.length}</p>
          <p className="text-xs text-white/50">Arquivos analisados</p>
        </div>
        <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-center">
          <CheckCircle className="w-6 h-6 mx-auto mb-2 text-green-400" />
          <p className="text-2xl font-bold text-green-400">{successCount}</p>
          <p className="text-xs text-white/50">Itens OK</p>
        </div>
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
          <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-amber-400" />
          <p className="text-2xl font-bold text-amber-400">{warningCount}</p>
          <p className="text-xs text-white/50">Alertas</p>
        </div>
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-center">
          <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-red-400" />
          <p className="text-2xl font-bold text-red-400">{errorCount}</p>
          <p className="text-xs text-white/50">Erros</p>
        </div>
      </div>

      {/* Files analyzed list */}
      <div className="text-xs text-white/50">
        <span className="font-medium">Arquivos:</span> {analysisResult.filesAnalyzed.join(', ')}
      </div>

      {/* Tags summary */}
      <div className="flex flex-wrap gap-2">
        {analysisResult.tags.map((tag, index) => (
          <Badge key={index} className={`${variantColors[tag.variant]} border`}>
            {tag.label}
          </Badge>
        ))}
      </div>

      {/* Analysis HTML content */}
      <div className="p-6 rounded-xl bg-black/30 border border-white/10 overflow-auto">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0">
            <Bot className="w-5 h-5 text-amber-500" />
          </div>
          <div 
            className="prose prose-invert prose-sm max-w-none chb-analysis-content"
            dangerouslySetInnerHTML={{ __html: analysisResult.html }}
          />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-4">
        <button
          onClick={onRunAnalysis}
          disabled={isAnalyzing}
          className="flex items-center gap-2 px-6 py-3 rounded-full bg-white/10 border border-white/20
            text-white font-medium hover:bg-white/20 transition-colors disabled:opacity-50"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Analisando...
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4" />
              Fazer Análise Novamente
            </>
          )}
        </button>

        <button
          onClick={onApproveAndAdvance}
          disabled={isAnalyzing}
          className="flex items-center gap-2 px-6 py-3 rounded-full bg-amber-500 text-black font-medium
            hover:bg-amber-400 transition-colors disabled:opacity-50"
        >
          <CheckCircle className="w-4 h-4" />
          Aprovar etapa & avançar
        </button>
      </div>
    </div>
  );
}
