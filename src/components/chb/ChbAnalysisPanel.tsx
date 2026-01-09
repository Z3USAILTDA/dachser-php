import { ChbAnalysisResult } from '@/types/chb';
import { stepTitles } from '@/data/chbMocks';
import { Play, CheckCircle, Loader2, RefreshCw, FileText, Copy, AlertTriangle, XCircle, Ship, Plane, FileDown } from 'lucide-react';
import { toast } from 'sonner';
import { ChbComparisonGrid } from './ChbComparisonGrid';
import { exportChbHistoryToPDF } from '@/utils/chbPdfExport';

interface ChbAnalysisPanelProps {
  stepId: number;
  analysisResult: ChbAnalysisResult | null;
  onRunAnalysis: () => void;
  onApproveAndAdvance: () => void;
  isAnalyzing: boolean;
  hasFiles: boolean;
  isStepCompleted?: boolean;
  analysisProgress?: string;
  reference?: string;
}

const copyAnalysisResult = (html: string) => {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  navigator.clipboard.writeText(tempDiv.textContent || tempDiv.innerText || '');
  toast.success('Resultado copiado para a área de transferência');
};

export function ChbAnalysisPanel({ 
  stepId, 
  analysisResult, 
  onRunAnalysis, 
  onApproveAndAdvance, 
  isAnalyzing,
  hasFiles,
  isStepCompleted = false,
  analysisProgress = '',
  reference = ''
}: ChbAnalysisPanelProps) {

  const handleExportPDF = () => {
    if (!analysisResult) return;
    
    const historyEntry = {
      id: 1,
      etapa: String(stepId),
      status: 'approved',
      result_text: '',
      result_html: analysisResult.html,
      created_by_email: '',
      created_at: analysisResult.generatedAt
    };
    
    exportChbHistoryToPDF([historyEntry], reference || 'Análise CHB');
    toast.success('PDF gerado com sucesso');
  };
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
          {isAnalyzing ? (
            <>
              <Loader2 className="w-12 h-12 text-amber-500 mx-auto mb-3 animate-spin" />
              <p className="text-white/80 text-sm font-medium mb-1">
                {analysisProgress || 'Processando documentos com IA...'}
              </p>
              <p className="text-white/40 text-[0.65rem]">
                A análise pode levar alguns minutos dependendo do tamanho dos arquivos.
              </p>
            </>
          ) : (
            <>
              <FileText className="w-12 h-12 text-amber-500/40 mx-auto mb-3" />
              <p className="text-white/60 text-xs mb-3">
                Clique para iniciar a análise dos documentos.
              </p>
              
              <button
                onClick={onRunAnalysis}
                disabled={isAnalyzing}
                className="flex items-center gap-1.5 px-4 py-2 mx-auto rounded-full bg-amber-500 text-black text-xs font-medium
                  hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Play className="w-3 h-3" />
                Iniciar Análise IA
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // Has analysis result
  const analysisData = analysisResult as ChbAnalysisResult & { modal?: string; cliente?: string };
  
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

      {/* Extracted metadata badges */}
      {(analysisData.modal || analysisData.cliente) && (
        <div className="flex flex-wrap items-center gap-2">
          {analysisData.modal && (
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[0.7rem] font-medium border ${
              analysisData.modal === 'SEA' 
                ? 'bg-blue-500/20 border-blue-500/30 text-blue-400' 
                : 'bg-purple-500/20 border-purple-500/30 text-purple-400'
            }`}>
              {analysisData.modal === 'SEA' ? <Ship className="w-3 h-3" /> : <Plane className="w-3 h-3" />}
              Modal: {analysisData.modal}
            </span>
          )}
          {analysisData.cliente && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[0.7rem] font-medium border bg-white/10 border-white/20 text-white/80">
              Cliente: {analysisData.cliente}
            </span>
          )}
        </div>
      )}

      {/* Files analyzed list */}
      <div className="text-[0.65rem] text-white/50">
        <span className="font-medium">Arquivos analisados:</span> {analysisResult.filesAnalyzed.join(', ')}
      </div>

      {/* Analysis HTML content - using new comparison grid */}
      <div className="p-4 rounded-lg bg-black/30 border border-white/10 overflow-auto max-h-[500px]">
        <ChbComparisonGrid htmlContent={analysisResult.html} />
      </div>

      {/* Action buttons - only show if step is not completed */}
      <div className="flex gap-3 flex-wrap">
        <button
          onClick={() => copyAnalysisResult(analysisResult.html)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/10 border border-white/20
            text-white text-xs font-medium hover:bg-white/20 transition-colors"
        >
          <Copy className="w-3 h-3" />
          Copiar Resultado
        </button>

        <button
          onClick={handleExportPDF}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/10 border border-white/20
            text-white text-xs font-medium hover:bg-white/20 transition-colors"
        >
          <FileDown className="w-3 h-3" />
          Exportar PDF
        </button>

        {!isStepCompleted && (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}
