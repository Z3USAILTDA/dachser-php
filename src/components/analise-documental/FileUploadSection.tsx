import { Upload, FileText, FileSpreadsheet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FileUploadSectionProps {
  pdfFile: File | null;
  excelFile: File | null;
  onPdfUpload: (file: File) => void;
  onExcelUpload: (file: File) => void;
  onCompare: () => void;
  isComparing: boolean;
}

export function FileUploadSection({
  pdfFile,
  excelFile,
  onPdfUpload,
  onExcelUpload,
  onCompare,
  isComparing,
}: FileUploadSectionProps) {
  const handleFileSelect = (
    accept: string,
    callback: (file: File) => void
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

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        {/* PDF Upload */}
        <div
          onClick={() => handleFileSelect(".pdf", onPdfUpload)}
          className={`
            relative cursor-pointer rounded-2xl border-2 border-dashed p-8
            transition-all duration-200 text-center
            ${pdfFile
              ? "border-emerald-400/60 bg-emerald-400/10"
              : "border-white/20 bg-white/5 hover:border-amber-400/60 hover:bg-white/8"
            }
          `}
        >
          <div className="flex flex-col items-center gap-4">
            <div className={`
              w-16 h-16 rounded-full flex items-center justify-center
              ${pdfFile ? "bg-emerald-400/20" : "bg-white/10"}
            `}>
              {pdfFile ? (
                <FileText className="w-8 h-8 text-emerald-400" />
              ) : (
                <Upload className="w-8 h-8 text-white/60" />
              )}
            </div>
            <div>
              <p className="text-lg font-semibold text-white/90">
                {pdfFile ? pdfFile.name : "Upload do PDF"}
              </p>
              <p className="text-sm text-neutral-400 mt-1">
                {pdfFile
                  ? `${(pdfFile.size / 1024).toFixed(1)} KB`
                  : "Arraste ou clique para selecionar"}
              </p>
            </div>
          </div>
        </div>

        {/* Excel Upload */}
        <div
          onClick={() => handleFileSelect(".xlsx,.xls", onExcelUpload)}
          className={`
            relative cursor-pointer rounded-2xl border-2 border-dashed p-8
            transition-all duration-200 text-center
            ${excelFile
              ? "border-emerald-400/60 bg-emerald-400/10"
              : "border-white/20 bg-white/5 hover:border-amber-400/60 hover:bg-white/8"
            }
          `}
        >
          <div className="flex flex-col items-center gap-4">
            <div className={`
              w-16 h-16 rounded-full flex items-center justify-center
              ${excelFile ? "bg-emerald-400/20" : "bg-white/10"}
            `}>
              {excelFile ? (
                <FileSpreadsheet className="w-8 h-8 text-emerald-400" />
              ) : (
                <Upload className="w-8 h-8 text-white/60" />
              )}
            </div>
            <div>
              <p className="text-lg font-semibold text-white/90">
                {excelFile ? excelFile.name : "Upload do Excel"}
              </p>
              <p className="text-sm text-neutral-400 mt-1">
                {excelFile
                  ? `${(excelFile.size / 1024).toFixed(1)} KB`
                  : "Arraste ou clique para selecionar"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Compare Button */}
      <div className="flex justify-center">
        <Button
          onClick={onCompare}
          disabled={!pdfFile || !excelFile || isComparing}
          className="h-12 px-8 rounded-full bg-amber-500 hover:bg-amber-400 text-black font-bold text-base shadow-[0_0_20px_rgba(251,191,36,0.4)] disabled:opacity-50 disabled:shadow-none"
        >
          {isComparing ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Comparando...
            </>
          ) : (
            <>
              <FileText className="w-5 h-5 mr-2" />
              Comparar Documentos
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
