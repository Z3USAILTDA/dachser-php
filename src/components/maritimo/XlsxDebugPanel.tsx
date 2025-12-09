import { FileSpreadsheet } from "lucide-react";

type ManifestDiagnostics = {
  sheets_processed?: number;
  rows_found?: number;
  pages_processed?: number;
};

interface XlsxDebugPanelProps {
  diagnostics: ManifestDiagnostics;
  fileName: string;
}

export function XlsxDebugPanel({ diagnostics, fileName }: XlsxDebugPanelProps) {
  return (
    <div className="bg-blue-950/20 border border-blue-700/50 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <FileSpreadsheet className="w-4 h-4 text-blue-400" />
        <h4 className="text-sm font-semibold text-blue-400">Diagnóstico XLSX</h4>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
        <div>
          <span className="text-neutral-500 block">Arquivo</span>
          <span className="text-neutral-300 font-medium">{fileName}</span>
        </div>
        <div>
          <span className="text-neutral-500 block">Planilhas</span>
          <span className="text-neutral-300 font-medium">{diagnostics.sheets_processed || 0}</span>
        </div>
        <div>
          <span className="text-neutral-500 block">Linhas</span>
          <span className="text-neutral-300 font-medium">{diagnostics.rows_found || 0}</span>
        </div>
        {diagnostics.pages_processed !== undefined && (
          <div>
            <span className="text-neutral-500 block">Páginas</span>
            <span className="text-neutral-300 font-medium">{diagnostics.pages_processed}</span>
          </div>
        )}
      </div>
    </div>
  );
}
