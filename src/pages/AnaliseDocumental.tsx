import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FileSearch } from "lucide-react";
import { FileUploadSection } from "@/components/analise-documental/FileUploadSection";
import { ComparisonResults, ComparisonRow } from "@/components/analise-documental/ComparisonResults";
import { useAuth } from "@/hooks/useAuth";
import { PageLayout } from "@/components/layout/PageLayout";
import { PageCard } from "@/components/layout/PageCard";
import { parseExcelFile } from "@/lib/parseExcel";
import { compareDocuments } from "@/lib/compareDocuments";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const AnaliseDocumental = () => {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [comparisonResults, setComparisonResults] = useState<ComparisonRow[] | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !user) {
      navigate("/login");
    }
  }, [user, isLoading, navigate]);

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

      const successCount = results.filter(r => r.status === "success").length;
      const warningCount = results.filter(r => r.status === "warning").length;
      const errorCount = results.filter(r => r.status === "error").length;

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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white/60">Carregando...</div>
      </div>
    );
  }

  return (
    <PageLayout title="DACHSER" subtitle="Análise Documental" pageIcon={FileSearch}>
      {/* Main content */}
      <PageCard padding="lg">
        {!comparisonResults ? (
          <FileUploadSection
            pdfFile={pdfFile}
            excelFile={excelFile}
            onPdfUpload={setPdfFile}
            onExcelUpload={setExcelFile}
            onCompare={handleCompare}
            isComparing={isComparing}
          />
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

export default AnaliseDocumental;
