import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { FileUploadSection } from "@/components/analise-documental/FileUploadSection";
import { ComparisonResults, ComparisonRow } from "@/components/analise-documental/ComparisonResults";
import { useAuth } from "@/hooks/useAuth";
import dachserBg from "@/assets/dachser-background.jpg";

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
    <div className="relative min-h-screen overflow-x-hidden text-white">
      {/* Background layers */}
      <div
        className="pointer-events-none fixed inset-0 -z-20"
        style={{
          background: `
            radial-gradient(circle at 10% 0%, rgba(255,200,0,0.18), transparent 55%),
            radial-gradient(circle at 90% 100%, rgba(255,200,0,0.12), transparent 55%),
            linear-gradient(180deg, rgba(0,0,0,0.7), rgba(0,0,0,0.82)),
            url(${dachserBg}) center/cover no-repeat
          `,
          filter: "saturate(0.8)",
        }}
      />

      {/* Animated lines */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="absolute h-px bg-gradient-to-r from-transparent via-amber-400/20 to-transparent"
            style={{
              top: `${15 + i * 18}%`,
              left: "-10%",
              right: "-10%",
              transform: `rotate(${-2 + i * 0.5}deg)`,
              animation: `pulse ${3 + i * 0.5}s ease-in-out infinite`,
            }}
          />
        ))}
      </div>

      {/* Floating particles */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 rounded-full bg-amber-400/30"
            style={{
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              animation: `float ${5 + Math.random() * 5}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 5}s`,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-6 py-6 space-y-6">
        {/* Header */}
        <header className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/dashboard")}
              className="w-10 h-10 flex items-center justify-center rounded-full border border-white/12 bg-[rgba(5,6,18,0.9)] text-white/80 hover:bg-white/10 transition-colors backdrop-blur-sm"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="text-[1.7rem] tracking-[0.22em] uppercase font-light">DACHSER</div>
              <div className="text-sm text-neutral-400">Intelligent Logistics – Análise Documental</div>
              <div className="flex gap-2 mt-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.9)]" />
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400/70" />
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400/40" />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 text-sm text-neutral-300">
            <div className="px-4 py-1.5 rounded-full bg-black/70 border border-white/12">
              {user?.email ?? "usuário"}
            </div>
          </div>
        </header>

        {/* Main content */}
        <div className="rounded-2xl border border-white/12 bg-[rgba(5,6,18,0.9)] p-6 shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
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
        </div>

        {/* Footer with legend */}
        <div className="rounded-2xl border border-white/12 bg-[rgba(5,6,18,0.9)] p-6 shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
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
        </div>
      </div>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0) translateX(0); opacity: 0.3; }
          50% { transform: translateY(-20px) translateX(10px); opacity: 0.6; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
};

export default AnaliseDocumental;
