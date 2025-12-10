import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FileUploadSection } from "@/components/analise-documental/FileUploadSection";
import { ComparisonResults, ComparisonRow } from "@/components/analise-documental/ComparisonResults";
import { useAuth } from "@/hooks/useAuth";
import { PageLayout } from "@/components/layout/PageLayout";
import { PageCard } from "@/components/layout/PageCard";

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
    // Simulation of comparison - in real app, this would parse and compare documents
    setTimeout(() => {
      const mockResults: ComparisonRow[] = [
        { rowNumber: 1, itemName: "Serviço de Consultoria", pdfValue: 1000, excelValue: 1000, difference: 0, status: "success" },
        { rowNumber: 2, itemName: "Material de Escritório", pdfValue: 2500, excelValue: 2530, difference: 30, status: "warning" },
        { rowNumber: 3, itemName: "Licença de Software", pdfValue: 5000, excelValue: 5000, difference: 0, status: "success" },
        { rowNumber: 4, itemName: "Manutenção de Equipamentos", pdfValue: 3200, excelValue: 3280, difference: 80, status: "error" },
        { rowNumber: 5, itemName: "Treinamento de Equipe", pdfValue: 1500, excelValue: 1500, difference: 0, status: "success" },
      ];
      setComparisonResults(mockResults);
      setIsComparing(false);
    }, 2000);
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
    <PageLayout title="DACHSER" subtitle="Análise Documental">
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
