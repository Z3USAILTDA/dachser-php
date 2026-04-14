/**
 * ChartDetailPanel - Sheet lateral de detalhamento de gráfico
 * Estilo alinhado ao ClientDetailSheet do Olimpo Cobrança
 */
import { useMemo } from "react";
import { Download, TrendingUp, Calculator, Percent, FileText } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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

const ChartDetailPanel = ({
  isOpen,
  onClose,
  title,
  columns,
  data,
  exportName = "dados",
}: ChartDetailPanelProps) => {
  const { toast } = useToast();

  const stats = useMemo(() => {
    const numericColumns = columns.filter((c) => c.type === "number" || c.type === "currency");
    return numericColumns.map((col) => {
      const values = data
        .map((row) => row[col.key])
        .filter((v): v is number => typeof v === "number" && !isNaN(v));
      if (values.length === 0) return { key: col.key, label: col.label, sum: 0, avg: 0, type: col.type };
      const sum = values.reduce((a, b) => a + b, 0);
      return { key: col.key, label: col.label, sum, avg: sum / values.length, type: col.type };
    });
  }, [columns, data]);

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

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-foreground">
            <FileText className="h-5 w-5 text-primary" />
            {title}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Summary stats */}
          {stats.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {stats.map((stat) => (
                <div key={stat.key} className="bg-muted/30 rounded-lg p-3 space-y-1">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{stat.label}</p>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <Calculator className="w-3 h-3 text-muted-foreground" />
                      <div>
                        <p className="text-[9px] text-muted-foreground">Total</p>
                        <p className="text-xs font-semibold text-foreground">
                          {stat.type === "currency" ? fmtCurrency(stat.sum) : fmtNumber(stat.sum)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <TrendingUp className="w-3 h-3 text-muted-foreground" />
                      <div>
                        <p className="text-[9px] text-muted-foreground">Média</p>
                        <p className="text-xs font-semibold text-foreground">
                          {stat.type === "currency" ? fmtCurrency(stat.avg) : fmtNumber(Math.round(stat.avg))}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Export button */}
          <div className="flex justify-end">
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={handleExport}>
              <Download className="w-3.5 h-3.5" />
              Exportar CSV
            </Button>
          </div>

          <Separator />

          {/* Data count */}
          <p className="text-xs text-muted-foreground">{data.length} registros</p>

          {/* Table */}
          <div className="border border-border rounded-lg overflow-hidden">
            <ScrollArea className="max-h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-border/50 hover:bg-transparent">
                    <TableHead className="text-xs text-muted-foreground font-medium w-10">#</TableHead>
                    {columns.map((col) => (
                      <TableHead key={col.key} className="text-xs text-muted-foreground font-medium" style={{ width: col.width }}>
                        {col.label}
                      </TableHead>
                    ))}
                    <TableHead className="text-xs text-muted-foreground font-medium text-right w-20">
                      <div className="flex items-center justify-end gap-1">
                        <Percent className="w-3 h-3" />
                        Total
                      </div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dataWithPercent.map((row, idx) => (
                    <TableRow key={idx} className="border-b border-border/30 hover:bg-muted/10">
                      <TableCell className="text-xs text-muted-foreground/60 py-2">{idx + 1}</TableCell>
                      {columns.map((col) => (
                        <TableCell
                          key={col.key}
                          className={`text-sm py-2 ${
                            col.type === "currency" || col.type === "number" ? "text-right font-mono font-medium text-foreground" : "text-muted-foreground"
                          }`}
                        >
                          {formatCell(row[col.key], col.type)}
                        </TableCell>
                      ))}
                      <TableCell className="text-xs py-2 text-right">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/15 text-primary">
                          {fmtPercent(row._percent as number)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ChartDetailPanel;
