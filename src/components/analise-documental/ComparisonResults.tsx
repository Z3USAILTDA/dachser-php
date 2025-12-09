import { RotateCcw, CheckCircle, AlertTriangle, XCircle, FileText, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface ComparisonRow {
  rowNumber: number;
  itemName: string;
  pdfValue: number;
  excelValue: number;
  difference: number;
  status: "success" | "warning" | "error";
}

interface ComparisonResultsProps {
  results: ComparisonRow[];
  onReset: () => void;
  pdfFileName: string;
  excelFileName: string;
}

export function ComparisonResults({
  results,
  onReset,
  pdfFileName,
  excelFileName,
}: ComparisonResultsProps) {
  const formatCurrency = (value: number) =>
    value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const getStatusIcon = (status: ComparisonRow["status"]) => {
    switch (status) {
      case "success":
        return <CheckCircle className="w-5 h-5 text-emerald-400" />;
      case "warning":
        return <AlertTriangle className="w-5 h-5 text-amber-400" />;
      case "error":
        return <XCircle className="w-5 h-5 text-rose-400" />;
    }
  };

  const getStatusBg = (status: ComparisonRow["status"]) => {
    switch (status) {
      case "success":
        return "bg-emerald-500/10 border-emerald-500/20";
      case "warning":
        return "bg-amber-500/10 border-amber-500/20";
      case "error":
        return "bg-rose-500/10 border-rose-500/20";
    }
  };

  const successCount = results.filter((r) => r.status === "success").length;
  const warningCount = results.filter((r) => r.status === "warning").length;
  const errorCount = results.filter((r) => r.status === "error").length;

  return (
    <div className="space-y-6">
      {/* Header with file names */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10">
            <FileText className="w-4 h-4 text-rose-400" />
            <span className="text-sm text-white/80">{pdfFileName}</span>
          </div>
          <span className="text-white/40">vs</span>
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10">
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span className="text-sm text-white/80">{excelFileName}</span>
          </div>
        </div>

        <Button
          onClick={onReset}
          variant="outline"
          className="rounded-full border-white/20 bg-white/5 hover:bg-white/10"
        >
          <RotateCcw className="w-4 h-4 mr-2" />
          Nova Comparação
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-6 h-6 text-emerald-400" />
            <div>
              <p className="text-2xl font-bold text-emerald-400">{successCount}</p>
              <p className="text-sm text-emerald-300/70">Corretos</p>
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
              <p className="text-sm text-rose-300/70">Erros</p>
            </div>
          </div>
        </div>
      </div>

      {/* Results Table */}
      <div className="rounded-2xl border border-white/12 bg-[rgba(5,6,18,0.9)] overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-white/12 hover:bg-transparent">
              <TableHead className="text-white/70">#</TableHead>
              <TableHead className="text-white/70">Item</TableHead>
              <TableHead className="text-white/70 text-right">Valor PDF</TableHead>
              <TableHead className="text-white/70 text-right">Valor Excel</TableHead>
              <TableHead className="text-white/70 text-right">Diferença</TableHead>
              <TableHead className="text-white/70 text-center">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.map((row) => (
              <TableRow
                key={row.rowNumber}
                className={`border-white/12 ${getStatusBg(row.status)}`}
              >
                <TableCell className="font-mono text-white/60">{row.rowNumber}</TableCell>
                <TableCell className="text-white/90">{row.itemName}</TableCell>
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
    </div>
  );
}
