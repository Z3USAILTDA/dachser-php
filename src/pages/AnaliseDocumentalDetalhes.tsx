import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FileSearch, Loader2 } from "lucide-react";
import { ComparisonResults } from "@/components/analise-documental/ComparisonResults";
import { PageLayout } from "@/components/layout/PageLayout";
import { PageCard } from "@/components/layout/PageCard";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { LLMAnalysisResult } from "./AnaliseDocumentalComparar";

interface AnaliseRecord {
  id: string;
  pdf_file_name: string;
  excel_file_name: string;
  pdf_summary: any;
  excel_summary: any;
  comparison: any;
  analysis: any;
  metadata: any;
  created_at: string;
}

const AnaliseDocumentalDetalhes = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [record, setRecord] = useState<AnaliseRecord | null>(null);

  useEffect(() => {
    const fetchRecord = async () => {
      if (!id) {
        navigate("/fin/analise-documental");
        return;
      }

      try {
        const { data, error } = await supabase
          .from("analise_documental_historico" as any)
          .select("*")
          .eq("id", id)
          .single() as { data: AnaliseRecord | null; error: any };

        if (error) throw error;
        if (!data) {
          toast.error("Análise não encontrada");
          navigate("/fin/analise-documental");
          return;
        }

        setRecord(data);
      } catch (error) {
        console.error("Error fetching record:", error);
        toast.error("Erro ao carregar análise");
        navigate("/fin/analise-documental");
      } finally {
        setIsLoading(false);
      }
    };

    fetchRecord();
  }, [id, navigate]);

  const handleReset = () => {
    navigate("/fin/analise-documental/comparar");
  };

  if (isLoading) {
    return (
      <PageLayout title="DACHSER" subtitle="Carregando..." pageIcon={FileSearch} backTo="/fin/analise-documental">
        <PageCard padding="lg">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
          </div>
        </PageCard>
      </PageLayout>
    );
  }

  if (!record) {
    return null;
  }

  // Reconstruct the LLMAnalysisResult from the database record
  const analysisResult: LLMAnalysisResult = {
    pdfSummary: record.pdf_summary || {},
    excelSummary: record.excel_summary || {},
    comparison: record.comparison || { matchedItems: [], pdfOnlyItems: [], excelOnlyItems: [], totalDifference: 0 },
    analysis: record.analysis || { overallStatus: "success", summary: "", discrepancies: [], recommendations: [] },
    metadata: {
      ...record.metadata,
      pdfFileName: record.pdf_file_name,
      excelFileName: record.excel_file_name,
    },
  };

  return (
    <PageLayout 
      title="DACHSER" 
      subtitle="Detalhes da Análise" 
      pageIcon={FileSearch} 
      backTo="/fin/analise-documental"
    >
      <PageCard padding="lg">
        <ComparisonResults
          analysisResult={analysisResult}
          onReset={handleReset}
        />
      </PageCard>
    </PageLayout>
  );
};

export default AnaliseDocumentalDetalhes;
