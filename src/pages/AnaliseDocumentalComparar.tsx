import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileSearch, Upload, FileText, FileSpreadsheet, Loader2, X } from "lucide-react";
import { ComparisonResults, ComparisonRow } from "@/components/analise-documental/ComparisonResults";
import { PageLayout } from "@/components/layout/PageLayout";
import { PageCard } from "@/components/layout/PageCard";
import { parseExcelFile } from "@/lib/parseExcel";
import { compareDocuments } from "@/lib/compareDocuments";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const AnaliseDocumentalComparar = () => {
  const navigate = useNavigate();
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [comparisonResults, setComparisonResults] = useState<ComparisonRow[] | null>(null);
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
      // Parse PDF via Edge Function with Lovable AI
      toast.info("Extraindo dados do PDF...");

      const formData = new FormData();
      formData.append("file", pdfFile);

      const { data: pdfData, error: pdfError } = await supabase.functions.invoke(
        "parse-invoice-pdf",
        { body: formData }
      );

      if (pdfError || pdfData?.error) {
        throw new Error(pdfData?.error || pdfError?.message || "Erro ao processar PDF");
      }

      const pdfItems = pdfData.items || [];
      console.log("PDF items extracted:", pdfItems);

      // Parse Excel locally
      toast.info("Extraindo dados do Excel...");
      const excelResult = await parseExcelFile(excelFile);
      const excelItems = excelResult.items || [];
      console.log("Excel items extracted:", excelItems);

      if (pdfItems.length === 0) {
        toast.warning("Nenhum item encontrado no PDF. Verifique se o documento é uma fatura válida.");
      }

      if (excelItems.length === 0) {
        toast.warning("Nenhum item encontrado no Excel. Verifique se a planilha contém itens com valores.");
      }

      if (pdfItems.length === 0 && excelItems.length === 0) {
        toast.error("Não foi possível extrair itens de nenhum dos documentos.");
        setIsComparing(false);
        return;
      }

      // Compare documents
      toast.info("Comparando documentos...");
      const results = compareDocuments(pdfItems, excelItems);

      setComparisonResults(results);

      const successCount = results.filter((r) => r.status === "success").length;
      const warningCount = results.filter((r) => r.status === "warning").length;
      const errorCount = results.filter((r) => r.status === "error").length;

      if (errorCount > 0) {
        toast.error(`Comparação concluída: ${errorCount} erro(s) encontrado(s)`);
      } else if (warningCount > 0) {
        toast.warning(`Comparação concluída: ${warningCount} item(s) com atenção`);
      } else {
        toast.success(`Comparação concluída: todos os ${successCount} itens conferem!`);
      }
    } catch (error) {
      console.error("Comparison error:", error);
      toast.error(error instanceof Error ? error.message : "Erro ao comparar documentos");
    } finally {
      setIsComparing(false);
    }
  };

  const handleReset = () => {
    setPdfFile(null);
    setExcelFile(null);
    setComparisonResults(null);
  };

  const handleBack = () => {
    navigate("/fin/analise-documental");
  };

  return (
    <PageLayout title="DACHSER" subtitle="Nova Comparação" pageIcon={FileSearch}>
      <PageCard padding="lg">
        {!comparisonResults ? (
          <div className="space-y-6">
            {/* Upload Grid - Following reference design */}
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
                      Envie o arquivo PDF para comparação
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
                      Envie o arquivo Excel para comparação
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
                    Comparando...
                  </>
                ) : (
                  "Comparar Documentos"
                )}
              </button>
              <p className="text-sm text-white/40">
                Envie ambos os arquivos para começar a comparação
              </p>
            </div>
          </div>
        ) : (
          <ComparisonResults
            results={comparisonResults}
            onReset={handleReset}
            pdfFileName={pdfFile?.name || ""}
            excelFileName={excelFile?.name || ""}
          />
        )}
      </PageCard>

      {/* Footer with legend */}
      <PageCard padding="lg">
        <div className="flex items-center justify-center gap-8 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-500" />
            <span className="text-emerald-300">Valores corretos</span>
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
    </PageLayout>
  );
};

export default AnaliseDocumentalComparar;
