import { 
  RotateCcw, 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  FileText, 
  FileSpreadsheet,
  Brain,
  Clock,
  Lightbulb,
  AlertCircle,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LLMAnalysisResult } from "@/pages/AnaliseDocumentalComparar";
import { useState } from "react";

interface ComparisonResultsProps {
  analysisResult: LLMAnalysisResult;
  onReset: () => void;
}

export function ComparisonResults({
  analysisResult,
  onReset,
}: ComparisonResultsProps) {
  const [showPdfOnly, setShowPdfOnly] = useState(false);
  const [showExcelOnly, setShowExcelOnly] = useState(false);

  const formatCurrency = (value: number) =>
    value?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) || "R$ 0,00";

  const getStatusIcon = (status: "success" | "warning" | "error") => {
    switch (status) {
      case "success":
        return <CheckCircle className="w-5 h-5 text-emerald-400" />;
      case "warning":
        return <AlertTriangle className="w-5 h-5 text-amber-400" />;
      case "error":
        return <XCircle className="w-5 h-5 text-rose-400" />;
    }
  };

  const getStatusBg = (status: "success" | "warning" | "error") => {
    switch (status) {
      case "success":
        return "bg-emerald-500/10 border-emerald-500/20";
      case "warning":
        return "bg-amber-500/10 border-amber-500/20";
      case "error":
        return "bg-rose-500/10 border-rose-500/20";
    }
  };

  const getOverallStatusColor = (status: string) => {
    switch (status) {
      case "success":
        return "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
      case "warning":
        return "text-amber-400 bg-amber-500/10 border-amber-500/30";
      case "error":
        return "text-rose-400 bg-rose-500/10 border-rose-500/30";
      default:
        return "text-white/60 bg-white/5 border-white/10";
    }
  };

  const { pdfSummary, excelSummary, comparison, analysis, metadata } = analysisResult;

  const matchedItems = comparison?.matchedItems || [];
  const pdfOnlyItems = comparison?.pdfOnlyItems || [];
  const excelOnlyItems = comparison?.excelOnlyItems || [];

  const successCount = matchedItems.filter((r) => r.status === "success").length;
  const warningCount = matchedItems.filter((r) => r.status === "warning").length;
  const errorCount = matchedItems.filter((r) => r.status === "error").length + pdfOnlyItems.length + excelOnlyItems.length;

  return (
    <div className="space-y-6">
      {/* Header with file names and AI badge */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10">
            <FileText className="w-4 h-4 text-rose-400" />
            <span className="text-sm text-white/80">{metadata?.pdfFileName || "PDF"}</span>
          </div>
          <span className="text-white/40">vs</span>
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10">
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span className="text-sm text-white/80">{metadata?.excelFileName || "Excel"}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/30 text-xs">
            <Brain className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-purple-300">{metadata?.model || "AI"}</span>
            {metadata?.processingTimeMs && (
              <>
                <span className="text-purple-400/50">•</span>
                <Clock className="w-3 h-3 text-purple-400" />
                <span className="text-purple-300">{(metadata.processingTimeMs / 1000).toFixed(1)}s</span>
              </>
            )}
          </div>
          <Button
            onClick={onReset}
            variant="outline"
            className="rounded-full border-white/20 bg-white/5 hover:bg-white/10"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Nova Análise
          </Button>
        </div>
      </div>

      {/* AI Analysis Summary */}
      {analysis?.summary && (
        <div className={`p-4 rounded-2xl border ${getOverallStatusColor(analysis.overallStatus)}`}>
          <div className="flex items-start gap-3">
            {getStatusIcon(analysis.overallStatus as "success" | "warning" | "error")}
            <div className="flex-1">
              <p className="text-white/90 font-medium">{analysis.summary}</p>
              {comparison?.totalDifference !== undefined && comparison.totalDifference !== 0 && (
                <p className="text-sm text-white/60 mt-1">
                  Diferença total: {formatCurrency(Math.abs(comparison.totalDifference))}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Document Summaries */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="p-4 rounded-2xl bg-rose-500/5 border border-rose-500/20">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4 text-rose-400" />
            <span className="text-sm font-medium text-rose-300">PDF</span>
            {pdfSummary?.documentType && (
              <span className="text-xs text-rose-400/60">({pdfSummary.documentType})</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-white/50">Itens:</span>
              <span className="text-white/80 ml-2">{pdfSummary?.itemCount || 0}</span>
            </div>
            <div>
              <span className="text-white/50">Total:</span>
              <span className="text-white/80 ml-2">{formatCurrency(pdfSummary?.totalValue || 0)}</span>
            </div>
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20">
          <div className="flex items-center gap-2 mb-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-medium text-emerald-300">Excel</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-white/50">Itens:</span>
              <span className="text-white/80 ml-2">{excelSummary?.itemCount || 0}</span>
            </div>
            <div>
              <span className="text-white/50">Total:</span>
              <span className="text-white/80 ml-2">{formatCurrency(excelSummary?.totalValue || 0)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-6 h-6 text-emerald-400" />
            <div>
              <p className="text-2xl font-bold text-emerald-400">{successCount}</p>
              <p className="text-sm text-emerald-300/70">Conferem</p>
            </div>
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-amber-400" />
            <div>
              <p className="text-2xl font-bold text-amber-400">{warningCount}</p>
              <p className="text-sm text-amber-300/70">Atenção</p>
            </div>
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20">
          <div className="flex items-center gap-3">
            <XCircle className="w-6 h-6 text-rose-400" />
            <div>
              <p className="text-2xl font-bold text-rose-400">{errorCount}</p>
              <p className="text-sm text-rose-300/70">Divergências</p>
            </div>
          </div>
        </div>
      </div>

      {/* Matched Items Table */}
      {matchedItems.length > 0 && (
        <div className="rounded-2xl border border-white/12 bg-[rgba(5,6,18,0.9)] overflow-hidden">
          <div className="p-3 border-b border-white/10">
            <h3 className="text-sm font-medium text-white/70">Itens Comparados</h3>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="border-white/12 hover:bg-transparent">
                <TableHead className="text-white/70">#</TableHead>
                <TableHead className="text-white/70">Item PDF</TableHead>
                <TableHead className="text-white/70">Item Excel</TableHead>
                <TableHead className="text-white/70 text-right">Valor PDF</TableHead>
                <TableHead className="text-white/70 text-right">Valor Excel</TableHead>
                <TableHead className="text-white/70 text-right">Diferença</TableHead>
                <TableHead className="text-white/70 text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {matchedItems.map((row, idx) => (
                <TableRow
                  key={row.rowNumber || idx}
                  className={`border-white/12 ${getStatusBg(row.status)}`}
                  title={row.observation || undefined}
                >
                  <TableCell className="font-mono text-white/60">{row.rowNumber || idx + 1}</TableCell>
                  <TableCell className="text-white/90 max-w-[200px] truncate" title={row.pdfItem}>
                    {row.pdfItem}
                  </TableCell>
                  <TableCell className="text-white/90 max-w-[200px] truncate" title={row.excelItem}>
                    {row.excelItem}
                  </TableCell>
                  <TableCell className="text-right font-mono text-white/80">
                    {formatCurrency(row.pdfValue)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-white/80">
                    {formatCurrency(row.excelValue)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    <span
                      className={
                        row.difference === 0
                          ? "text-emerald-400"
                          : row.difference <= 50
                          ? "text-amber-400"
                          : "text-rose-400"
                      }
                    >
                      {row.difference === 0 ? "-" : formatCurrency(row.difference)}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    {getStatusIcon(row.status)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* PDF Only Items */}
      {pdfOnlyItems.length > 0 && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 overflow-hidden">
          <button
            onClick={() => setShowPdfOnly(!showPdfOnly)}
            className="w-full p-3 flex items-center justify-between hover:bg-rose-500/10 transition"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400" />
              <span className="text-sm font-medium text-rose-300">
                Itens apenas no PDF ({pdfOnlyItems.length})
              </span>
            </div>
            {showPdfOnly ? (
              <ChevronUp className="w-4 h-4 text-rose-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-rose-400" />
            )}
          </button>
          {showPdfOnly && (
            <div className="p-3 border-t border-rose-500/20 space-y-2">
              {pdfOnlyItems.map((item, idx) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span className="text-white/80">{item.description}</span>
                  <span className="text-rose-300 font-mono">{formatCurrency(item.value)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Excel Only Items */}
      {excelOnlyItems.length > 0 && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 overflow-hidden">
          <button
            onClick={() => setShowExcelOnly(!showExcelOnly)}
            className="w-full p-3 flex items-center justify-between hover:bg-emerald-500/10 transition"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-medium text-emerald-300">
                Itens apenas no Excel ({excelOnlyItems.length})
              </span>
            </div>
            {showExcelOnly ? (
              <ChevronUp className="w-4 h-4 text-emerald-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-emerald-400" />
            )}
          </button>
          {showExcelOnly && (
            <div className="p-3 border-t border-emerald-500/20 space-y-2">
              {excelOnlyItems.map((item, idx) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span className="text-white/80">{item.description}</span>
                  <span className="text-emerald-300 font-mono">{formatCurrency(item.value)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Discrepancies */}
      {analysis?.discrepancies && analysis.discrepancies.length > 0 && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-medium text-amber-300">Discrepâncias Identificadas</span>
          </div>
          <div className="space-y-2">
            {analysis.discrepancies.map((disc, idx) => (
              <div key={idx} className="flex items-start gap-2 text-sm">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  disc.severity === "high" ? "bg-rose-500/20 text-rose-300" :
                  disc.severity === "medium" ? "bg-amber-500/20 text-amber-300" :
                  "bg-blue-500/20 text-blue-300"
                }`}>
                  {disc.type}
                </span>
                <span className="text-white/70">{disc.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {analysis?.recommendations && analysis.recommendations.length > 0 && (
        <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-medium text-blue-300">Recomendações</span>
          </div>
          <ul className="space-y-1.5">
            {analysis.recommendations.map((rec, idx) => (
              <li key={idx} className="text-sm text-white/70 flex items-start gap-2">
                <span className="text-blue-400 mt-1">•</span>
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Keep the old interface export for backwards compatibility
export interface ComparisonRow {
  rowNumber: number;
  itemName: string;
  pdfValue: number;
  excelValue: number;
  difference: number;
  status: "success" | "warning" | "error";
}
