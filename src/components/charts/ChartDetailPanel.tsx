/**
 * ChartDetailPanel - Sheet lateral de detalhamento de gráfico
 * Estilo alinhado ao ClientDetailSheet do Olimpo Cobrança
 */
import { useMemo } from "react";
import { Download, Percent, FileText, BarChart3 } from "lucide-react";
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

const fmtNumber = (v: number) => Math.round(v).toLocaleString("pt-BR");
const fmtCurrency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
const fmtPercent = (v: number) =>
  `${v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

const formatCell = (value: any, type: ChartColumn["type"]) => {
  if (value === null || value === undefined) return "—";
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
      if (values.length === 0) return { key: col.key, label: col.label, sum: 0, avg: 0, max: 0, min: 0, type: col.type };
      const sum = values.reduce((a, b) => a + b, 0);
      return { key: col.key, label: col.label, sum, avg: sum / values.length, max: Math.max(...values), min: Math.min(...values), type: col.type };
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

  const fmtStat = (v: number, type: string) => type === "currency" ? fmtCurrency(v) : fmtNumber(v);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-foreground">
            <BarChart3 className="h-5 w-5 text-primary" />
            {title}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Summary cards — like Cobrança CNPJs/Faturas/Total */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-muted/30 rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">Registros</p>
              <p className="text-lg font-bold text-foreground">{data.length}</p>
            </div>
            {stats.slice(0, 2).map((stat) => (
              <div key={stat.key} className="bg-muted/30 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="text-sm font-bold text-foreground">{fmtStat(stat.sum, stat.type)}</p>
                <p className="text-[10px] text-muted-foreground">Média: {fmtStat(stat.avg, stat.type)}</p>
              </div>
            ))}
          </div>

          {/* Export & info bar */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{data.length} registros encontrados</p>
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={handleExport}>
              <Download className="w-3.5 h-3.5" />
              Exportar CSV
            </Button>
          </div>

          <Separator />

          {/* Data table */}
          <div className="border border-border rounded-lg overflow-hidden">
            <ScrollArea className="max-h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs text-muted-foreground font-semibold w-10">#</TableHead>
                    {columns.map((col) => (
                      <TableHead
                        key={col.key}
                        className={`text-xs text-muted-foreground font-semibold ${col.type === "currency" || col.type === "number" ? "text-right" : ""}`}
                        style={{ width: col.width }}
                      >
                        {col.label}
                      </TableHead>
                    ))}
                    <TableHead className="text-xs text-muted-foreground font-semibold text-right w-24">
                      % do Total
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dataWithPercent.map((row, idx) => (
                    <TableRow key={idx} className="border-b border-border/30 hover:bg-muted/10">
                      <TableCell className="text-xs text-muted-foreground/60 py-2.5">{idx + 1}</TableCell>
                      {columns.map((col) => (
                        <TableCell
                          key={col.key}
                          className={`text-sm py-2.5 ${
                            col.type === "currency" || col.type === "number"
                              ? "text-right font-mono font-medium text-foreground"
                              : "text-foreground font-medium"
                          }`}
                        >
                          {formatCell(row[col.key], col.type)}
                        </TableCell>
                      ))}
                      <TableCell className="text-sm py-2.5 text-right">
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-primary/15 text-primary">
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
