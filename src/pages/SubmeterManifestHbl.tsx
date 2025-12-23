import React, { useState, useEffect } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { Send, FileText, AlertCircle, Copy, Check, Info, FileStack, Loader2, HelpCircle, ClipboardList } from "lucide-react";
import { PageLayout } from "@/components/layout/PageLayout";
import { PageCard } from "@/components/layout/PageCard";
import { Button } from "@/components/ui/button";
import { UploadZone } from "@/components/maritimo/UploadZone";
import { FileItem } from "@/components/maritimo/FileItem";
import { RejectedTokensDebug } from "@/components/maritimo/RejectedTokensDebug";
import { XlsxDebugPanel } from "@/components/maritimo/XlsxDebugPanel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { maritimoApi } from "@/services/maritimoApi";
type AnalysisDiagnostics = {
  manifest?: {
    sheets_processed?: number;
    rows_found?: number;
    pages_processed?: number;
  };
  hbl?: {
    pages_processed?: number;
    ocr_quality?: string;
  };
  chars_useful?: {
    manifest?: number;
    hbl?: number;
  };
};
type RejectedToken = {
  token?: string;
  reason?: string;
};
type RejectedNcm = {
  code?: string;
  reason?: string;
};
type AnalysisDebugInfo = {
  rejected_tokens?: {
    [filename: string]: {
      invoices?: RejectedToken[];
      ncms?: RejectedNcm[];
    };
  };
};
type AnalysisResultData = {
  files?: {
    manifest_name?: string;
    hbl_name?: string;
  };
  manifest?: {
    invoice_tokens?: string[];
    ncm8?: string[];
    ncm_chapters_4d?: string[];
  };
  hbl?: {
    invoice_tokens?: string[];
    ncm8?: string[];
    ncm_chapters_4d?: string[];
  };
  diff?: {
    missing_in_hbl_invoices?: string[];
    extra_in_hbl_invoices?: string[];
    missing_in_hbl_ncms?: string[];
    extra_in_hbl_ncms?: string[];
  };
  diagnostics?: AnalysisDiagnostics;
  debug_info?: AnalysisDebugInfo;
  used_ocr?: boolean;
};
type AnalysisPayload = {
  result_text?: string;
  result_data?: AnalysisResultData;
  status?: string;
};
type BaseInfo = {
  id: string;
  base_file_name: string;
  base_file_url?: string;
  container?: string;
  consignee?: string;
  view?: string;
};
export default function SubmeterManifestHbl() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();

  // Read itemId from query params, location state, or route params
  const searchParams = new URLSearchParams(location.search);
  const itemId = searchParams.get('itemId') || location.state?.itemId || params.id;
  const [hblFiles, setHblFiles] = useState<File[]>([]);
  const [baseInfo, setBaseInfo] = useState<BaseInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [analysisResult, setAnalysisResult] = useState<AnalysisPayload | null>(null);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisStep, setAnalysisStep] = useState("");
  const [isCompletingAnalysis, setIsCompletingAnalysis] = useState(false);
  const [copiedResult, setCopiedResult] = useState(false);
  const [copiedDivergences, setCopiedDivergences] = useState(false);
  const [inlineStatus, setInlineStatus] = useState<{
    message: string;
    type: 'info' | 'success' | 'error';
  } | null>(null);
  useEffect(() => {
    setHblFiles([]);
    setAnalysisResult(null);
    setAnalysisId(null);
    setIsAnalyzing(false);
    setAnalysisProgress(0);
    setAnalysisStep("");
    setIsCompletingAnalysis(false);
    setInlineStatus(null);
  }, [itemId]);
  const showInlineStatus = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    setInlineStatus({
      message,
      type
    });
  };
  useEffect(() => {
    const loadItemInfo = async () => {
      if (!itemId) {
        toast.error("Item ID não fornecido");
        navigate("/maritimo");
        return;
      }
      try {
        setIsLoading(true);
        const item = await maritimoApi.getItem(itemId);
        setBaseInfo({
          id: item.id,
          base_file_name: item.base_file_name,
          base_file_url: item.base_file_url,
          container: item.container || 'N/A',
          consignee: item.consignee || 'N/A'
        });
      } catch (error: any) {
        console.error('Error loading item:', error);
        toast.error(error?.message || "Item não encontrado. Redirecionando...");
        navigate("/maritimo");
      } finally {
        setIsLoading(false);
      }
    };
    loadItemInfo();
  }, [itemId, navigate]);
  const handleFilesSelected = (files: File[]) => {
    const pdfFiles = files.filter(file => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
    if (pdfFiles.length === 0) {
      showInlineStatus("Envie apenas arquivos PDF", 'error');
      return;
    }
    if (hblFiles.length + pdfFiles.length > 10) {
      showInlineStatus("Máximo de 10 arquivos permitidos", 'error');
      return;
    }
    const oversizedFiles = pdfFiles.filter(f => f.size > 20 * 1024 * 1024);
    if (oversizedFiles.length > 0) {
      showInlineStatus("Arquivos não podem exceder 20MB cada", 'error');
      return;
    }
    setHblFiles(prev => [...prev, ...pdfFiles]);
    showInlineStatus(`${pdfFiles.length} arquivo(s) cadastrado(s)`, 'success');
  };
  const handleRemoveFile = (index: number) => {
    setHblFiles(prev => prev.filter((_, i) => i !== index));
  };
  const handleAnalise = async () => {
    if (hblFiles.length === 0) {
      showInlineStatus("Adicione pelo menos um arquivo HBL", 'error');
      return;
    }
    if (!itemId) {
      showInlineStatus("Item ID não encontrado", 'error');
      return;
    }
    // Validate consignee and container are not empty (except for 'N/A')
    if (!baseInfo?.container || baseInfo.container === 'N/A') {
      showInlineStatus("Container não identificado no arquivo base. Verifique o nome do arquivo ou o conteúdo.", 'error');
      return;
    }
    const totalSize = hblFiles.reduce((sum, file) => sum + file.size, 0);
    const maxTotalSize = 100 * 1024 * 1024;
    if (totalSize > maxTotalSize) {
      showInlineStatus(`Tamanho total dos arquivos (${(totalSize / 1024 / 1024).toFixed(1)}MB) excede o limite de 100MB`, 'error');
      return;
    }
    setIsAnalyzing(true);
    setAnalysisProgress(5);
    setAnalysisStep("Enviando arquivos...");
    setInlineStatus(null);
    showInlineStatus("Processando análise com IA...", 'info');
    try {
      // Smoother progress animation
      const progressInterval = setInterval(() => {
        setAnalysisProgress(prev => {
          if (prev >= 85) {
            return prev;
          }
          // Slower progress increase for longer processing
          return prev + 1;
        });
      }, 3000);
      const response = await maritimoApi.submitAnalysis({
        itemId,
        analysisType: 'manifest_hbl',
        files: hblFiles
      });
      clearInterval(progressInterval);
      setAnalysisId(response.analysisId);
      let result: {
        status: string;
        result_text?: string;
        result_data?: any;
      };
      if (response.result_text || response.status === 'completed' || response.status === 'error') {
        console.log('Analysis completed synchronously');
        result = {
          status: response.status || 'completed',
          result_text: response.result_text,
          result_data: response.result_data
        };
        if (response.error) {
          throw new Error(response.error);
        }
      } else {
        console.log('Falling back to polling mode');
        setAnalysisStep("Processando com IA...");
        result = await maritimoApi.pollAnalysisUntilComplete(response.analysisId, (percent, step) => {
          setAnalysisProgress(Math.min(percent, 95));
          setAnalysisStep(step);
        }, 10 * 60 * 1000 // 10 minutes (extended timeout)
        );
      }
      setAnalysisProgress(100);
      await new Promise(resolve => setTimeout(resolve, 300));
      setIsAnalyzing(false);
      setAnalysisProgress(0);
      setAnalysisStep("");
      setInlineStatus(null);
      if (result.status === 'error') {
        showInlineStatus("Erro na análise. Verifique os arquivos e tente novamente.", 'error');
      } else {
        setTimeout(() => {
          document.getElementById('analysis-results')?.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        }, 100);
      }
      setAnalysisResult({
        status: result.status,
        result_text: result.result_text,
        result_data: result.result_data
      });
    } catch (error: any) {
      console.error('Submit error:', error);
      showInlineStatus(`Erro ao submeter análise: ${error.message || 'Erro desconhecido'}`, 'error');
      setIsAnalyzing(false);
      setAnalysisProgress(0);
      setAnalysisStep("");
    }
  };
  const handleCompleteAnalysis = async () => {
    if (!analysisId || !itemId) {
      toast.error("Informações da análise não encontradas");
      return;
    }
    setIsCompletingAnalysis(true);
    const loadingToast = toast.loading("Concluindo análise...");
    try {
      // Complete the analysis
      await maritimoApi.completeAnalysis(analysisId, itemId, true);

      // Silently save as learning example (user doesn't need to know)
      if (analysisResult?.result_text) {
        try {
          const hblCount = hblFiles.length;
          let scenarioType = `${hblCount}_hbl`;
          const resultLower = analysisResult.result_text.toLowerCase();
          if (resultLower.includes('update:') || resultLower.includes('discrepancy') || resultLower.includes('differs')) {
            scenarioType += '_with_discrepancy';
          } else if (resultLower.includes('no changes') || resultLower.includes('no discrepancy')) {
            scenarioType += '_no_discrepancy';
          }
          const userStr = localStorage.getItem('dachser_user');
          const user = userStr ? JSON.parse(userStr) : null;
          const inputSummary = `Base: ${baseInfo?.base_file_name || 'N/A'}, HBLs: ${hblFiles.map(f => f.name).join(', ')}, Container: ${baseInfo?.container || 'N/A'}`;
          await maritimoApi.saveApprovedExample({
            runId: parseInt(analysisId),
            itemId: parseInt(itemId),
            analysisType: 'manifest_hbl',
            consignee: baseInfo?.consignee || undefined,
            scenarioType,
            hblCount,
            inputSummary,
            resultText: analysisResult.result_text,
            approvedBy: user?.id,
            approvedByName: user?.username
          });
        } catch (exampleError) {
          // Silent failure - don't notify user
          console.warn('Failed to save as example (non-blocking):', exampleError);
        }
      }
      toast.dismiss(loadingToast);
      toast.success("Análise concluída com sucesso!");
      setTimeout(() => navigate("/maritimo"), 1000);
    } catch (error: any) {
      console.error('Complete analysis error:', error);
      toast.dismiss(loadingToast);
      toast.error("Erro ao atualizar status: " + (error.message || 'Erro desconhecido'));
    } finally {
      setIsCompletingAnalysis(false);
    }
  };
  const handleNewAnalysis = async () => {
    setAnalysisResult(null);
    setAnalysisId(null);
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
    await handleAnalise();
  };
  const handleCopyResult = () => {
    if (!analysisResult?.result_text || analysisResult.result_text.trim().length === 0) {
      toast.error("Não há conteúdo para copiar");
      return;
    }
    try {
      const textarea = document.createElement('textarea');
      textarea.value = analysisResult.result_text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (successful) {
        setCopiedResult(true);
        toast.success("Resultado copiado");
        setTimeout(() => setCopiedResult(false), 2000);
      } else {
        throw new Error("execCommand failed");
      }
    } catch (err) {
      console.error('Copy error:', err);
      toast.error("Não foi possível copiar. Selecione o texto manualmente.");
    }
  };

  // Extract only divergences from analysis result
  const extractDivergences = (text: string): string => {
    const lines = text.split('\n');
    const divergencePatterns = [
      /UPDATE REQUIRED/i,
      /Delta:\s*[+-]?[0-9,.]+\s*(kg|m³|m3)/i,
      /Missing:/i,
      /Extra:/i,
      /→\s*Update:/i,
      /Update:/i,
      /DISCREPANCY/i,
      /DISCREPANCIES FOUND/i,
      /⚠️ WARNING/i,
    ];
    
    const summaryStartPatterns = [
      /SUMMARY FOR EXTERNAL COMMUNICATION/i,
      /═══.*SUMMARY/i,
    ];
    
    const divergentLines: string[] = [];
    let inSummarySection = false;
    
    for (const line of lines) {
      // Check if entering summary section
      if (summaryStartPatterns.some(p => p.test(line))) {
        inSummarySection = true;
      }
      
      // Include summary section lines
      if (inSummarySection) {
        divergentLines.push(line);
        continue;
      }
      
      // Check for divergence patterns
      if (divergencePatterns.some(pattern => pattern.test(line))) {
        // Include context - add preceding line if it contains exporter/item info
        const lineIndex = lines.indexOf(line);
        if (lineIndex > 0) {
          const prevLine = lines[lineIndex - 1];
          if (/EXPORTER|Item \d+:|Draft HBL:/i.test(prevLine) && !divergentLines.includes(prevLine)) {
            divergentLines.push(prevLine);
          }
        }
        divergentLines.push(line);
      }
    }
    
    if (divergentLines.length === 0) {
      return "Nenhuma divergência encontrada - todos os documentos estão reconciliados.";
    }
    
    return divergentLines.join('\n').trim();
  };

  const handleCopyDivergences = () => {
    if (!analysisResult?.result_text || analysisResult.result_text.trim().length === 0) {
      toast.error("Não há conteúdo para copiar");
      return;
    }
    try {
      const divergences = extractDivergences(analysisResult.result_text);
      const textarea = document.createElement('textarea');
      textarea.value = divergences;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (successful) {
        setCopiedDivergences(true);
        toast.success("Divergências copiadas");
        setTimeout(() => setCopiedDivergences(false), 2000);
      } else {
        throw new Error("execCommand failed");
      }
    } catch (err) {
      console.error('Copy error:', err);
      toast.error("Não foi possível copiar. Selecione o texto manualmente.");
    }
  };
  if (isLoading) {
    return <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-neutral-400">Carregando...</div>
      </div>;
  }
  if (!baseInfo) {
    return null;
  }
  const showManifestDiagnostic = analysisResult?.result_data?.manifest?.invoice_tokens?.length === 0 || analysisResult?.result_data?.manifest?.ncm8?.length === 0;
  const helpButton = (
    <button
      onClick={() => navigate("/sea/submeter-manifest-hbl/manual")}
      className="w-8 h-8 rounded-full border border-[rgba(255,255,255,.25)] flex items-center justify-center bg-[rgba(0,0,0,.7)] text-[#aaaaaa] hover:text-[#ffc800] hover:bg-[rgba(0,0,0,.9)] transition"
      title="Ajuda"
    >
      <HelpCircle className="w-4 h-4" />
    </button>
  );
  return <PageLayout title="DACHSER" subtitle="Submeter – Manifest/Pack List × Draft HBL" pageIcon={FileStack} backTo="/maritimo" rightContent={helpButton}>
      <PageCard className="max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold text-white mb-2">Submeter – Manifest/Pack List × Draft HBL</h1>
            <p className="text-sm text-neutral-400 mb-8">Adicione os arquivos HBL para análise comparativa</p>

            <div className="bg-black/20 border border-white/5 rounded-xl p-6 mb-8">
              <h3 className="text-xs tracking-[0.22em] uppercase text-neutral-400 mb-4">Informações do arquivo base:</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <span className="text-xs text-neutral-500">Arquivo:</span>
                  <div className="flex items-center gap-2 mt-1">
                    <FileText className="w-4 h-4 text-amber-300" />
                    <span className="text-white text-sm">{baseInfo.base_file_name}</span>
                  </div>
                </div>
                <div>
                  <span className="text-xs text-neutral-500">Container:</span>
                  <p className="text-white text-sm mt-1">{baseInfo.container}</p>
                </div>
                <div>
                  <span className="text-xs text-neutral-500">Consignee:</span>
                  <p className="text-white text-sm mt-1">{baseInfo.consignee}</p>
                </div>
              </div>
            </div>

            <h3 className="text-xs tracking-[0.22em] uppercase mb-4 text-white font-bold">Envie os arquivos Draft HBL (múltiplos PDFs):</h3>
          
            <UploadZone onFilesSelected={handleFilesSelected} accept=".pdf" multiple={true} label="Arraste e solte ou clique para enviar" description="Aceito apenas: PDF (máx. 10 arquivos, 20MB cada)" />

            {hblFiles.length > 0 && <div className="mt-6">
                <h3 className="text-xs tracking-[0.22em] uppercase text-neutral-400 mb-3">
                  Arquivos HBL adicionados ({hblFiles.length}):
                </h3>
                <div className="space-y-2">
                  {hblFiles.map((file, index) => <FileItem key={index} file={file} onRemove={() => handleRemoveFile(index)} />)}
                </div>
              </div>}

            {inlineStatus && !isAnalyzing && <div className={`mt-6 rounded-xl p-4 border ${inlineStatus.type === 'success' ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300' : inlineStatus.type === 'error' ? 'bg-rose-500/15 border-rose-500/40 text-rose-300' : 'bg-amber-500/15 border-amber-500/40 text-amber-300'}`}>
                <p className="text-sm font-medium">{inlineStatus.message}</p>
              </div>}

            {isAnalyzing && <div className="mt-6">
                <div className="bg-black/20 border border-white/5 rounded-xl p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-amber-400"></div>
                    <span className="text-sm text-white font-medium">{analysisStep}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Progress value={analysisProgress} className="h-2 flex-1" />
                    <span className="text-xs text-neutral-400 font-mono min-w-[3rem] text-right">{analysisProgress}%</span>
                  </div>
                </div>
              </div>}

            {analysisResult?.result_text && <div id="analysis-results" className="mt-8 space-y-6">
                <div className="flex items-center gap-2 text-emerald-300">
                  <div className="w-2 h-2 bg-emerald-400 rounded-full shadow-[0_0_10px_rgba(52,211,153,0.6)]" />
                  <span className="font-semibold text-sm">Análise concluída</span>
                </div>

                {analysisResult.result_data?.files?.manifest_name?.match(/\.(xlsx?|xls)$/i) && analysisResult.result_data?.diagnostics?.manifest && <XlsxDebugPanel diagnostics={analysisResult.result_data.diagnostics.manifest} fileName={analysisResult.result_data.files.manifest_name} />}

                {showManifestDiagnostic && analysisResult.result_data && <Card className="bg-amber-950/20 border-amber-700">
                    <CardHeader>
                      <CardTitle className="text-amber-400 flex items-center gap-2">
                        <AlertCircle className="w-5 h-5" />
                        Diagnóstico de Leitura
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <p className="text-neutral-400">
                        <strong>Arquivo:</strong> {analysisResult.result_data.files?.manifest_name}
                      </p>
                      {analysisResult.result_data.diagnostics?.manifest && <>
                          <p className="text-neutral-400">
                            <strong>Planilhas processadas:</strong>{" "}
                            {analysisResult.result_data.diagnostics.manifest.sheets_processed || 0}
                          </p>
                          <p className="text-neutral-400">
                            <strong>Linhas encontradas:</strong>{" "}
                            {analysisResult.result_data.diagnostics.manifest.rows_found || 0}
                          </p>
                        </>}
                      <p className="text-neutral-400">
                        <strong>OCR utilizado:</strong>{" "}
                        {analysisResult.result_data.used_ocr ? "Sim" : "Não"}
                      </p>
                      <p className="text-amber-300 mt-4">
                        ⚠️ O manifest não contém dados válidos. Verifique se as colunas estão rotuladas corretamente 
                        (INVOICE, INV, NCM, HS CODE, etc.).
                      </p>
                    </CardContent>
                  </Card>}

                <RejectedTokensDebug debugInfo={analysisResult.result_data?.debug_info} />

                <div className="bg-black/20 border border-white/5 rounded-xl p-6">
                  <pre className="text-sm text-neutral-200 whitespace-pre-wrap font-mono bg-black/30 p-4 rounded-lg max-h-96 overflow-y-auto">
                    {analysisResult.result_text?.replace(/```json\s*\{[^`]*"hbl_shipping_data"[^`]*\}\s*```/g, '').trim()}
                  </pre>
                </div>

                <div className="flex items-center gap-4 flex-wrap">
                  <Button onClick={handleNewAnalysis} disabled={isCompletingAnalysis || isAnalyzing} className="h-10 rounded-full px-6 bg-amber-400 text-black font-semibold text-sm shadow-[0_0_22px_rgba(251,191,36,0.6)] hover:bg-amber-300">
                    <Send className="w-4 h-4 mr-2" />
                    {isAnalyzing ? "Processando..." : "Fazer nova análise"}
                  </Button>
                  <Button onClick={handleCompleteAnalysis} disabled={isCompletingAnalysis} variant="outline" className="h-10 rounded-full px-6 border-white/24 bg-black/40 text-white hover:border-amber-400/80 hover:bg-black">
                    Concluir análise
                  </Button>
                  <Button onClick={handleCopyDivergences} variant="outline" className="h-10 rounded-full px-6 border-amber-400/50 bg-black/40 text-amber-300 hover:border-amber-400 hover:bg-black" title="Copiar apenas divergências">
                    {copiedDivergences ? <Check className="w-4 h-4 mr-2" /> : <ClipboardList className="w-4 h-4 mr-2" />}
                    Copiar Divergências
                  </Button>
                  <Button onClick={handleCopyResult} variant="ghost" size="icon" className="rounded-full w-10 h-10 text-white hover:bg-white/10" title="Copiar resultado completo">
                    {copiedResult ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>}

            {!analysisResult && <div className="mt-8 flex justify-start">
                
              </div>}

            {!analysisResult && <div className="mt-8 flex justify-start">
                <Button onClick={handleAnalise} disabled={!hblFiles.length || isAnalyzing} className="h-10 rounded-full px-6 bg-amber-400 text-black font-semibold text-sm shadow-[0_0_22px_rgba(251,191,36,0.6)] hover:bg-amber-300">
                  <Send className="w-4 h-4 mr-2" />
                  {isAnalyzing ? "Processando..." : "Fazer análise"}
                </Button>
              </div>}
      </PageCard>

      {!analysisResult && <div className="flex items-center justify-center mt-6 max-w-4xl mx-auto">
          <div className="flex items-start gap-3 text-xs text-neutral-400 bg-black/20 border border-white/5 p-4 rounded-xl">
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-300" />
            <p>
              As análises são geradas por um modelo de IA e podem conter imprecisões. Revise antes de concluir processos.
            </p>
          </div>
        </div>}
    </PageLayout>;
}