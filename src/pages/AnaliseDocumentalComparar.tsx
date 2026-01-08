import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileSearch, Upload, FileText, FileSpreadsheet, Loader2, X, Brain } from "lucide-react";
import { ComparisonResults } from "@/components/analise-documental/ComparisonResults";
import { PageLayout } from "@/components/layout/PageLayout";
import { PageCard } from "@/components/layout/PageCard";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import * as XLSX from "xlsx";

// Types for LLM analysis response
export interface LLMAnalysisResult {
  pdfSummary: {
    documentType: string;
    totalValue: number;
    itemCount: number;
    metadata: {
      emissor: string;
      destinatario: string;
      data: string;
      numero: string;
    };
    extractedItems: Array<{ description: string; value: number; quantity?: number }>;
  };
  excelSummary: {
    totalValue: number;
    itemCount: number;
    extractedItems: Array<{ description: string; value: number }>;
  };
  comparison: {
    matchedItems: Array<{
      rowNumber: number;
      pdfItem: string;
      excelItem: string;
      pdfValue: number;
      excelValue: number;
      difference: number;
      status: "success" | "warning" | "error";
      observation?: string;
    }>;
    pdfOnlyItems: Array<{ description: string; value: number }>;
    excelOnlyItems: Array<{ description: string; value: number }>;
    totalDifference: number;
  };
  analysis: {
    overallStatus: "success" | "warning" | "error";
    summary: string;
    discrepancies: Array<{ type: string; description: string; severity: string }>;
    recommendations: string[];
  };
  metadata: {
    model: string;
    processingTimeMs: number;
    pdfFileName: string;
    excelFileName: string;
    tokensUsed: number | null;
  };
}

// Extract text content from Excel file
function extractExcelContent(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: "array" });
        const allContent: string[] = [];

        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
          
          allContent.push(`=== PLANILHA: ${sheetName} ===`);
          
          for (const row of jsonData as any[][]) {
            const rowText = row
              .map((cell: any) => {
                if (cell === null || cell === undefined || cell === "") return "";
                return String(cell).trim();
              })
              .filter((c: string) => c.length > 0)
              .join(" | ");
            
            if (rowText.length > 0) {
              allContent.push(rowText);
            }
          }
          allContent.push("");
        }

        resolve(allContent.join("\n"));
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error("Failed to read Excel file"));
    reader.readAsArrayBuffer(file);
  });
}

// Convert file to base64
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix if present
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

const AnaliseDocumentalComparar = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [analysisResult, setAnalysisResult] = useState<LLMAnalysisResult | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [isComparing, setIsComparing] = useState(false);

  const handleFileSelect = (
    accept: string,
    callback: (file: File | null) => void
  ) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = (e) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];
      if (file) callback(file);
    };
    input.click();
  };

  const handleCompare = async () => {
    if (!pdfFile || !excelFile) return;

    setIsComparing(true);

    try {
      toast.info("Preparando documentos...", { duration: 3000 });

      // Extract Excel content locally
      const excelContent = await extractExcelContent(excelFile);
      console.log(`Excel extracted: ${excelContent.length} characters`);

      // Convert PDF to base64
      const pdfBase64 = await fileToBase64(pdfFile);
      console.log(`PDF converted: ${pdfBase64.length} characters`);

      toast.info("Analisando com IA (pode levar até 60s)...", { duration: 10000 });

      // Call the LLM comparison edge function
      const { data, error } = await supabase.functions.invoke("compare-documents-llm", {
        body: {
          pdfBase64,
          pdfFileName: pdfFile.name,
          excelContent,
          excelFileName: excelFile.name,
        },
      });

      if (error) {
        console.error("Edge function error:", error);
        throw new Error(error.message || "Erro ao chamar função de análise");
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      console.log("Analysis result:", data);
      setAnalysisResult(data);

      // Calculate counts
      const matchedItems = data.comparison?.matchedItems || [];
      const pdfOnlyItems = data.comparison?.pdfOnlyItems || [];
      const excelOnlyItems = data.comparison?.excelOnlyItems || [];
      
      const successCount = matchedItems.filter((r: any) => r.status === "success").length;
      const warningCount = matchedItems.filter((r: any) => r.status === "warning").length;
      const errorCount = matchedItems.filter((r: any) => r.status === "error").length + pdfOnlyItems.length + excelOnlyItems.length;
      const totalItems = matchedItems.length + pdfOnlyItems.length + excelOnlyItems.length;

      // Save to database (using type assertion as table was just created)
      const { data: savedRecord, error: saveError } = await supabase
        .from("analise_documental_historico" as any)
        .insert({
          pdf_file_name: pdfFile.name,
          excel_file_name: excelFile.name,
          pdf_summary: data.pdfSummary,
          excel_summary: data.excelSummary,
          comparison: data.comparison,
          analysis: data.analysis,
          metadata: data.metadata,
          total_items: totalItems,
          success_count: successCount,
          warning_count: warningCount,
          error_count: errorCount,
          overall_status: data.analysis?.overallStatus || "success",
          created_by_user_id: user?.id,
        })
        .select()
        .single() as { data: { id: string } | null; error: any };

      if (saveError) {
        console.error("Error saving to database:", saveError);
        toast.warning("Análise concluída, mas não foi possível salvar no histórico");
      } else if (savedRecord) {
        setSavedId(savedRecord.id);
        console.log("Saved to database:", savedRecord.id);
      }

      // Show result toast based on overall status
      const status = data.analysis?.overallStatus;
      const summary = data.analysis?.summary || "Análise concluída";
      
      if (status === "error") {
        toast.error(summary);
      } else if (status === "warning") {
        toast.warning(summary);
      } else {
        toast.success(summary);
      }

    } catch (error) {
      console.error("Comparison error:", error);
      const message = error instanceof Error ? error.message : "Erro ao comparar documentos";
      toast.error(message);
    } finally {
      setIsComparing(false);
    }
  };

  const handleReset = () => {
    setPdfFile(null);
    setExcelFile(null);
    setAnalysisResult(null);
    setSavedId(null);
  };

  return (
    <PageLayout title="DACHSER" subtitle="Nova Comparação" pageIcon={FileSearch} backTo="/fin/analise-documental">
      <PageCard padding="lg">
        {!analysisResult ? (
          <div className="space-y-6">
            {/* AI Badge */}
            <div className="flex items-center justify-center">
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/30">
                <Brain className="w-4 h-4 text-purple-400" />
                <span className="text-sm text-purple-300">Análise com Gemini 2.5 Pro</span>
              </div>
            </div>

            {/* Upload Grid */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* PDF Upload Card */}
              <div className="rounded-2xl border border-white/12 bg-[rgba(5,6,18,0.9)] p-6">
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-6 h-6 text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-white/90">Documento PDF</h3>
                    <p className="text-sm text-white/50 mt-0.5">
                      Fatura, Invoice ou Nota Fiscal
                    </p>
                  </div>
                  {pdfFile && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setPdfFile(null);
                      }}
                      className="w-7 h-7 rounded-full border border-rose-400/30 bg-transparent text-rose-400 flex items-center justify-center hover:bg-rose-500/10 transition"
                      title="Remover arquivo"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <button
                  onClick={() => handleFileSelect(".pdf", setPdfFile)}
                  className={`
                    w-full h-12 rounded-full border-2 border-dashed flex items-center justify-center gap-2
                    transition-all duration-200 font-medium text-sm
                    ${pdfFile
                      ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-300"
                      : "border-amber-400/60 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20"
                    }
                  `}
                >
                  <Upload className="w-4 h-4" />
                  {pdfFile ? pdfFile.name : "Selecionar arquivo"}
                </button>
              </div>

              {/* Excel Upload Card */}
              <div className="rounded-2xl border border-white/12 bg-[rgba(5,6,18,0.9)] p-6">
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                    <FileSpreadsheet className="w-6 h-6 text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-white/90">Planilha Excel</h3>
                    <p className="text-sm text-white/50 mt-0.5">
                      Base de comparação
                    </p>
                  </div>
                  {excelFile && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setExcelFile(null);
                      }}
                      className="w-7 h-7 rounded-full border border-rose-400/30 bg-transparent text-rose-400 flex items-center justify-center hover:bg-rose-500/10 transition"
                      title="Remover arquivo"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <button
                  onClick={() => handleFileSelect(".xlsx,.xls", setExcelFile)}
                  className={`
                    w-full h-12 rounded-full border-2 border-dashed flex items-center justify-center gap-2
                    transition-all duration-200 font-medium text-sm
                    ${excelFile
                      ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-300"
                      : "border-amber-400/60 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20"
                    }
                  `}
                >
                  <Upload className="w-4 h-4" />
                  {excelFile ? excelFile.name : "Selecionar arquivo"}
                </button>
              </div>
            </div>

            {/* Compare Button */}
            <div className="flex flex-col items-center gap-3">
              <button
                onClick={handleCompare}
                disabled={!pdfFile || !excelFile || isComparing}
                className="h-12 px-8 rounded-full bg-amber-500 hover:bg-amber-400 text-black font-bold text-base shadow-[0_0_20px_rgba(251,191,36,0.4)] disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed transition-all flex items-center gap-2"
              >
                {isComparing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Analisando com IA...
                  </>
                ) : (
                  <>
                    <Brain className="w-5 h-5" />
                    Analisar Documentos
                  </>
                )}
              </button>
              <p className="text-sm text-white/40 text-center max-w-md">
                A IA irá extrair e comparar todos os itens e valores dos documentos automaticamente
              </p>
            </div>
          </div>
        ) : (
          <ComparisonResults
            analysisResult={analysisResult}
            onReset={handleReset}
          />
        )}
      </PageCard>

      {/* Footer with info */}
      {!analysisResult && (
        <PageCard padding="lg">
          <div className="flex items-center justify-center gap-8 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-emerald-500" />
              <span className="text-emerald-300">Valores conferem</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-amber-400" />
              <span className="text-amber-300">Diferença até R$ 50</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-rose-500" />
              <span className="text-rose-300">Diferença acima de R$ 50</span>
            </div>
          </div>
        </PageCard>
      )}
    </PageLayout>
  );
};

export default AnaliseDocumentalComparar;
