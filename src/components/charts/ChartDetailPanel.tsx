/**
 * ChartDetailPanel - Painel expandido de detalhamento de gráfico
 * Ported from Amazon Trans Z3US Design System
 */
import { useMemo, useState } from "react";
import { X, Download, TrendingUp, Calculator, Percent, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";

export interface ChartDataRow {
  [key: string]: string | number | null | undefined;
}

export interface ChartColumn {
  key: string;
  label: string;
  type: "text" | "number" | "currency" | "percent";
  width?: string;
}

export interface ChartDetailPanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  columns: ChartColumn[];
  data: ChartDataRow[];
  exportName?: string;
  accentColor?: string;
}

// ── Formatters ──
const fmtNumber = (v: number) => Math.round(v).toLocaleString("pt-BR");
const fmtCurrency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
const fmtPercent = (v: number) =>
  `${v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

const formatCell = (value: any, type: ChartColumn["type"]) => {
  if (value === null || value === undefined) return "-";
  switch (type) {
    case "currency": return fmtCurrency(Number(value));
    case "number": return fmtNumber(Number(value));
    case "percent": return fmtPercent(Number(value));
    default: return String(value);
  }
};

const AMBER = "#F2A007";

const ChartDetailPanel = ({
  isOpen,
  onClose,
  title,
  columns,
  data,
  exportName = "dados",
  accentColor = AMBER,
}: ChartDetailPanelProps) => {
  const { toast } = useToast();

  // Stats for numeric columns
  const stats = useMemo(() => {
    const numericColumns = columns.filter((c) => c.type === "number" || c.type === "currency");
    return numericColumns.map((col) => {
      const values = data
        .map((row) => row[col.key])
        .filter((v): v is number => typeof v === "number" && !isNaN(v));
      if (values.length === 0) return { key: col.key, label: col.label, sum: 0, avg: 0, max: 0, min: 0, type: col.type };
      const sum = values.reduce((a, b) => a + b, 0);
      return { key: col.key, label: col.label, sum, avg: sum / values.length, max: Math.max(...values), min: Math.min(...values), type: col.type };
    });
  }, [columns, data]);

  // Add percent of total
  const dataWithPercent = useMemo(() => {
    const primaryNumCol = columns.find((c) => c.type === "number" || c.type === "currency");
    if (!primaryNumCol) return data.map((d) => ({ ...d, _percent: 0 }));
    const total = data.reduce((sum, row) => {
      const val = row[primaryNumCol.key];
      return sum + (typeof val === "number" ? val : 0);
    }, 0);
    return data.map((row) => ({
      ...row,
      _percent: total > 0 ? ((typeof row[primaryNumCol.key] === "number" ? (row[primaryNumCol.key] as number) : 0) / total) * 100 : 0,
    }));
  }, [data, columns]);

  // CSV Export
  const handleExport = () => {
    try {
      const headers = [...columns.map((c) => c.label), "% do Total"];
      const csvRows = [
        headers.join(";"),
        ...dataWithPercent.map((row) =>
          [...columns.map((col) => {
            const v = row[col.key];
            if (v === null || v === undefined) return "";
            return String(v);
          }), `${(row._percent ?? 0).toFixed(1)}%`].join(";")
        ),
      ];
      const blob = new Blob(["\uFEFF" + csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `faturamento_${exportName}_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Exportado com sucesso", description: `${data.length} registros` });
    } catch {
      toast({ title: "Erro ao exportar", variant: "destructive" });
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="mt-3 rounded-xl border overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300"
      style={{
        background: "linear-gradient(135deg, rgba(15, 23, 42, 0.98) 0%, rgba(2, 6, 23, 0.99) 100%)",
        borderColor: `${accentColor}25`,
        boxShadow: `0 4px 20px -4px ${accentColor}15`,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "rgba(148, 163, 184, 0.1)" }}>
        <div className="flex items-center gap-2">
          <div className="w-1 h-5 rounded-full" style={{ backgroundColor: accentColor }} />
          <h3 className="text-sm font-semibold text-white">Detalhamento: {title}</h3>
          <span className="text-[10px] text-slate-500 ml-2">{data.length} registros</span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5 text-slate-400 hover:text-white" onClick={handleExport}>
            <Download className="w-3.5 h-3.5" />
            Exportar
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-white" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Stats */}
      {stats.length > 0 && (
        <div className="px-4 py-3 border-b grid grid-cols-2 md:grid-cols-4 gap-3" style={{ borderColor: "rgba(148, 163, 184, 0.08)" }}>
          {stats.map((stat) => (
            <div key={stat.key} className="space-y-2">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">{stat.label}</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-1.5">
                  <Calculator className="w-3 h-3 text-slate-500" />
                  <div>
                    <p className="text-[9px] text-slate-500">Total</p>
                    <p className="text-xs font-semibold text-white">
                      {stat.type === "currency" ? fmtCurrency(stat.sum) : fmtNumber(stat.sum)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="w-3 h-3 text-slate-500" />
                  <div>
                    <p className="text-[9px] text-slate-500">Média</p>
                    <p className="text-xs font-semibold text-white">
                      {stat.type === "currency" ? fmtCurrency(stat.avg) : fmtNumber(Math.round(stat.avg))}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <ScrollArea className="max-h-[300px]">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-slate-800/50 hover:bg-transparent">
              <TableHead className="text-[10px] text-slate-400 font-medium w-10">#</TableHead>
              {columns.map((col) => (
                <TableHead key={col.key} className="text-[10px] text-slate-400 font-medium" style={{ width: col.width }}>
                  {col.label}
                </TableHead>
              ))}
              <TableHead className="text-[10px] text-slate-400 font-medium text-right w-20">
                <div className="flex items-center justify-end gap-1">
                  <Percent className="w-3 h-3" />
                  Total
                </div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dataWithPercent.map((row, idx) => (
              <TableRow key={idx} className="border-b border-slate-800/30 hover:bg-slate-800/30">
                <TableCell className="text-[10px] text-slate-600 py-2">{idx + 1}</TableCell>
                {columns.map((col) => (
                  <TableCell
                    key={col.key}
                    className={`text-xs py-2 ${
                      col.type === "currency" || col.type === "number" ? "text-right font-medium text-white" : "text-slate-300"
                    }`}
                  >
                    {formatCell(row[col.key], col.type)}
                  </TableCell>
                ))}
                <TableCell className="text-xs py-2 text-right">
                  <span
                    className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                    style={{ backgroundColor: `${accentColor}15`, color: accentColor }}
                  >
                    {fmtPercent(row._percent as number)}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
};

export default ChartDetailPanel;
