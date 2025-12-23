import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Send, FileText, Copy, Check, Info, GitCompare, HelpCircle, ClipboardList } from "lucide-react";
import { PageLayout } from "@/components/layout/PageLayout";
import { PageCard } from "@/components/layout/PageCard";
import { Button } from "@/components/ui/button";
import { UploadZone } from "@/components/maritimo/UploadZone";
import { FileItem } from "@/components/maritimo/FileItem";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { maritimoApi } from "@/services/maritimoApi";
interface BaseInfo {
  itemId: string;
  arquivo: string;
  arquivoUrl: string;
  container: string | null;
  consignee: string | null;
}
export default function SubmeterHblMbl() {
  const navigate = useNavigate();
  const location = useLocation();
  const [mblFile, setMblFile] = useState<File | null>(null);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisStep, setAnalysisStep] = useState("");
  const [baseInfo, setBaseInfo] = useState<BaseInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCompletingAnalysis, setIsCompletingAnalysis] = useState(false);
  const [copiedResult, setCopiedResult] = useState(false);
  const [copiedDivergences, setCopiedDivergences] = useState(false);
  const [inlineStatus, setInlineStatus] = useState<{
    message: string;
    type: 'info' | 'success' | 'error';
  } | null>(null);

  // Support both query params (from SeaAnalysis list) and location state (from CadastroHbl)
  const searchParams = new URLSearchParams(location.search);
  const itemId = searchParams.get('itemId') || location.state?.itemId;
  useEffect(() => {
    if (!itemId) {
      toast.error("ID do item não encontrado");
      navigate("/maritimo");
      return;
    }
    const fetchItem = async () => {
      try {
        const item = await maritimoApi.getItem(itemId);
        setBaseInfo({
          itemId: item.id,
          arquivo: item.base_file_name,
          arquivoUrl: item.base_file_url,
          container: item.container || "Não identificado",
          consignee: item.consignee || "Não identificado"
        });
      } catch (error: any) {
        toast.error("Erro ao carregar dados do HBL: " + (error.message || 'Erro desconhecido'));
        navigate("/maritimo");
      } finally {
        setIsLoading(false);
      }
    };
    fetchItem();
  }, [itemId, navigate]);
  useEffect(() => {
    setMblFile(null);
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
  const handleFilesSelected = (files: File[]) => {
    if (files.length > 0) {
      const file = files[0];
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        showInlineStatus("Envie apenas arquivo PDF", 'error');
        return;
      }
      if (file.size > 20 * 1024 * 1024) {
        showInlineStatus("Arquivo não pode exceder 20MB", 'error');
        return;
      }
      setMblFile(file);
      showInlineStatus("Arquivo MBL cadastrado", 'success');
    }
  };
  const handleAnalise = async () => {
    if (!mblFile) {
      showInlineStatus("Adicione o arquivo MBL", 'error');
      return;
    }
    if (!itemId) {
      showInlineStatus("Item ID não encontrado", 'error');
      return;
    }
    const maxFileSize = 50 * 1024 * 1024;
    if (mblFile.size > maxFileSize) {
      showInlineStatus(`Arquivo muito grande (${(mblFile.size / 1024 / 1024).toFixed(1)}MB). Limite: 50MB`, 'error');
      return;
    }
    setIsAnalyzing(true);
    setAnalysisProgress(5);
    setAnalysisStep("Enviando arquivos...");
    setInlineStatus(null);
    showInlineStatus("Processando análise com IA...", 'info');
    try {
      const progressInterval = setInterval(() => {
        setAnalysisProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 2;
        });
      }, 500);
      const response = await maritimoApi.submitAnalysis({
        itemId,
        analysisType: 'hbl_mbl',
        files: [mblFile]
      });
      clearInterval(progressInterval);
      setAnalysisId(response.analysisId);
      let result: {
        status: string;
        result_text?: string;
        result_data?: any;
      };
      if (response.result_text || response.status === 'completed' || response.status === 'error') {
        result = {
          status: response.status || 'completed',
          result_text: response.result_text,
          result_data: response.result_data
        };
        if (response.error) {
          throw new Error(response.error);
        }
      } else {
        setAnalysisStep("Aguardando resultado...");
        result = await maritimoApi.pollAnalysisUntilComplete(response.analysisId, (percent, step) => {
          setAnalysisProgress(Math.min(percent, 95));
          setAnalysisStep(step);
        }, 300000);
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
      await maritimoApi.completeAnalysis(analysisId, itemId, true);
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
  // Extract only divergences from analysis result
  const extractDivergences = (text: string): string => {
    const lines = text.split('\n');
    
    // Pattern to detect Delta: 0 (not a real divergence)
    const zeroDeltaPattern = /Delta:\s*[+-]?0[.,]?0*\s*(kg|m³|m3)/i;
    
    // Expanded patterns to catch more divergence indicators
    const divergencePatterns = [
      /UPDATE REQUIRED/i,
      /Status:\s*DIFFERENT/i,
      /Status:\s*UPDATE/i,
      /Status:\s*MISMATCH/i,
      /Status:\s*NOT FOUND/i,
      /Delta:\s*[+-]?[0-9,.]+\s*(kg|m³|m3)/i,
      /Missing:/i,
      /Extra:/i,
      /→\s*Update:/i,
      /Update:/i,
      /DISCREPANCY/i,
      /DISCREPANCIES FOUND/i,
      /⚠️ WARNING/i,
      /⚠️/,
      /requires? update/i,
      /needs? correction/i,
      /adjust/i,
      /differ/i,
    ];
    
    // Patterns to explicitly EXCLUDE (matches, not divergences)
    const matchPatterns = [
      /Status:\s*MATCH/i,
      /MATCH\s*✓/i,
      /No changes required/i,
      /No discrepancies/i,
    ];
    
    const summaryStartPatterns = [
      /SUMMARY FOR EXTERNAL COMMUNICATION/i,
      /═══.*SUMMARY/i,
      /ANALYSIS SUMMARY/i,
      /Fields with discrepancies/i,
    ];
    
    const divergentLines: string[] = [];
    let inSummarySection = false;
    let currentFile: string | null = null;
    let fileAddedForSection = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Track current HBL/MBL context - expanded patterns
      const fileMatch = line.match(/(?:DRAFT HBL|HBL|MBL|MASTER|File):\s*["']?(.+?\.pdf)["']?/i) ||
                        line.match(/Comparing.*?["'](.+?\.pdf)["']/i);
      if (fileMatch) {
        currentFile = fileMatch[1];
        fileAddedForSection = false;
      }
      
      // Check if entering summary section
      if (summaryStartPatterns.some(p => p.test(line))) {
        inSummarySection = true;
      }
      
      // Include summary section lines that contain discrepancy counts
      if (inSummarySection && /discrepanc|update|differ/i.test(line)) {
        divergentLines.push(line);
        continue;
      }
      
      // Skip lines that are explicit matches
      if (matchPatterns.some(p => p.test(line))) {
        continue;
      }
      
      // Check for divergence patterns
      const hasDivergence = divergencePatterns.some(pattern => pattern.test(line));
      
      if (hasDivergence) {
        // Skip lines that are just "Delta: 0" (not real divergences)
        if (zeroDeltaPattern.test(line) && !/UPDATE|DIFFERENT|Missing:|Extra:|DISCREPANCY|adjust/i.test(line)) {
          continue;
        }
        
        // Add file header context if not yet added
        if (currentFile && !fileAddedForSection) {
          divergentLines.push(`\n📄 Arquivo: ${currentFile}`);
          fileAddedForSection = true;
        }
        
        // Include context - add preceding line if it contains exporter/item info
        if (i > 0) {
          const prevLine = lines[i - 1];
          if (/EXPORTER|Item \d+:|Subtotals|PARTIES|ROUTING|CONTAINER/i.test(prevLine) && !divergentLines.includes(prevLine)) {
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

  const handleCopyResult = () => {
    if (!analysisResult?.result_text || analysisResult.result_text.trim().length === 0) {
      toast.error("Não há conteúdo para copiar");
      return;
    }
    try {
      // Remove JSON blocks and clean up the text before copying
      let textToCopy = analysisResult.result_text.replace(/```json[\s\S]*?```/g, '') // Remove markdown JSON blocks
      .replace(/\{"hbl_shipping_data"[\s\S]*?\}\s*$/g, '') // Remove raw JSON at end
      .replace(/<!--[\s\S]*?-->/g, '') // Remove HTML comments
      .trim();
      const textarea = document.createElement('textarea');
      textarea.value = textToCopy;
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
    return <PageLayout title="DACHSER" subtitle="Carregando...">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </PageLayout>;
  }
  if (!baseInfo) {
    return null;
  }
  const helpButton = (
    <button
      onClick={() => navigate("/sea/submeter-hbl-mbl/manual")}
      className="w-8 h-8 rounded-full border border-[rgba(255,255,255,.25)] flex items-center justify-center bg-[rgba(0,0,0,.7)] text-[#aaaaaa] hover:text-[#ffc800] hover:bg-[rgba(0,0,0,.9)] transition"
      title="Ajuda"
    >
      <HelpCircle className="w-4 h-4" />
    </button>
  );
  return <PageLayout title="DACHSER" subtitle="Submeter – HBL × MBL" pageIcon={GitCompare} backTo="/maritimo" rightContent={helpButton}>
      <PageCard className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-2">Submeter – HBL × MBL</h1>
        <p className="text-sm text-neutral-400 mb-8">Envie o arquivo MBL para comparação com o HBL base</p>

        <div className="bg-black/20 border border-white/5 rounded-xl p-6 mb-8">
          <h3 className="text-xs tracking-[0.22em] uppercase text-neutral-400 mb-4">Informações do HBL base:</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <span className="text-xs text-neutral-500">Arquivo:</span>
              <div className="flex items-center gap-2 mt-1">
                <FileText className="w-4 h-4 text-amber-300" />
                <span className="text-white text-sm">{baseInfo.arquivo}</span>
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

        <h3 className="text-xs tracking-[0.22em] uppercase mb-4 text-white font-bold">Envie o arquivo MBL:</h3>
      
        <UploadZone onFilesSelected={handleFilesSelected} accept=".pdf" multiple={false} label="Arraste e solte ou clique para enviar" description="Aceito apenas: PDF (um arquivo, máx. 20MB)" />

        {mblFile && <div className="mt-6">
            <h3 className="text-xs tracking-[0.22em] uppercase text-neutral-400 mb-3">Arquivo MBL selecionado:</h3>
            <FileItem file={mblFile} onRemove={() => setMblFile(null)} />
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

            <div className="bg-black/20 border border-white/5 rounded-xl p-6">
              <pre className="text-sm text-neutral-300 whitespace-pre-wrap font-mono bg-black/30 p-4 rounded-lg max-h-96 overflow-y-auto">
                {analysisResult.result_text.replace(/```json\s*\{[^`]*"hbl_shipping_data"[^`]*\}\s*```/g, '').trim()}
              </pre>
            </div>

            <div className="flex items-center gap-4">
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
            <Button onClick={handleAnalise} disabled={!mblFile || isAnalyzing} className="h-10 rounded-full px-6 bg-amber-400 text-black font-semibold text-sm shadow-[0_0_22px_rgba(251,191,36,0.6)] hover:bg-amber-300">
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