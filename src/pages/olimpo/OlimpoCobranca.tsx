import { useState, useEffect, useMemo } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DollarSign,
  TrendingUp,
  AlertTriangle,
  Clock,
  RefreshCw,
  Search,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { ClientDetailSheet } from "@/components/olimpo/ClientDetailSheet";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import * as XLSX from "xlsx";

interface AgingRow {
  product: string;
  not_due: number;
  aging_30: number;
  aging_90: number;
  aging_180: number;
  aging_240: number;
  aging_360: number;
  aging_360_plus: number;
  count_not_due: number;
  count_30: number;
  count_90: number;
  count_180: number;
  count_240: number;
  count_360: number;
  count_360_plus: number;
  cnpjs?: string[];
}

interface AgingData {
  data: AgingRow[];
  totals: AgingRow;
  lastUpdate: string;
}

interface BudgetForecast {
  period: string;
  budget: number;
  forecast: number;
  asOf: string;
}

const AGING_COLORS: Record<string, string> = {
  not_due: "#22c55e",
  aging_30: "#84cc16",
  aging_90: "#eab308",
  aging_180: "#f97316",
  aging_240: "#ef4444",
  aging_360: "#dc2626",
  aging_360_plus: "#991b1b",
};

const AGING_LABELS: Record<string, string> = {
  not_due: "Not Due",
  aging_30: "0-30",
  aging_90: "31-90",
  aging_180: "91-180",
  aging_240: "181-240",
  aging_360: "241-360",
  aging_360_plus: "> 360",
};

// Provisioning percentages per aging bucket (based on Working Capital model)
const PROVISION_PCT: Record<string, number> = {
  not_due: 0,
  aging_30: 1,
  aging_90: 1,
  aging_180: 1,
  aging_240: 25,
  aging_360: 50,
  aging_360_plus: 100,
};

const PIE_COLORS = ["#22c55e", "#ef4444"];

const PRODUCT_MAP: Record<string, string> = {
  SI: "Sea",
  SE: "Sea",
  AI: "Air",
  AE: "Air",
  DIM: "CHB",
  DEX: "CHB",
  ASO: "Miscellaneous",
  TCK: "Trucking",
};

const agingKeys = ["not_due", "aging_30", "aging_90", "aging_180", "aging_240", "aging_360", "aging_360_plus"] as const;

function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCompact(value: number): string {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(0)}K`;
  return formatBRL(value);
}

function mergeProductRows(rows: AgingRow[]): AgingRow[] {
  const grouped: Record<string, AgingRow> = {};
  for (const row of rows) {
    const mapped = PRODUCT_MAP[row.product] || row.product;
    if (!grouped[mapped]) {
      grouped[mapped] = { ...row, product: mapped };
    } else {
      for (const k of agingKeys) {
        (grouped[mapped][k] as number) += row[k] as number;
      }
      grouped[mapped].count_not_due += row.count_not_due;
      grouped[mapped].count_30 += row.count_30;
      grouped[mapped].count_90 += row.count_90;
      grouped[mapped].count_180 += row.count_180;
      grouped[mapped].count_240 += row.count_240;
      grouped[mapped].count_360 += row.count_360;
      grouped[mapped].count_360_plus += row.count_360_plus;
    }
  }
  return Object.values(grouped).sort((a, b) => {
    const totalA = agingKeys.reduce((s, k) => s + (a[k] as number), 0);
    const totalB = agingKeys.reduce((s, k) => s + (b[k] as number), 0);
    return totalB - totalA;
  });
}

export default function OlimpoCobranca() {
  const [data, setData] = useState<AgingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"product" | "client">("product");
  const [clientFilter, setClientFilter] = useState("");
  const [budgetForecast, setBudgetForecast] = useState<BudgetForecast | null>(null);
  const [selectedClient, setSelectedClient] = useState<AgingRow | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const { toast } = useToast();

  const fetchData = async () => {
    setLoading(true);
    try {
      const agingAction = viewMode === "client" ? "get_aging_by_client" : "get_aging_overview";

      const [agingResult, bfResult] = await Promise.allSettled([
        supabase.functions.invoke("mariadb-proxy", { body: { action: agingAction } }),
        supabase.functions.invoke("mariadb-proxy", { body: { action: "get_budget_forecast_auto", viewMode } }),
      ]);

      if (agingResult.status === "fulfilled") {
        const { data: resp, error } = agingResult.value;
        if (error) throw error;
        if (!resp?.success) throw new Error(resp?.error || "Erro desconhecido");
        setData(resp);
      } else {
        throw agingResult.reason;
      }

      const currentPeriod = new Date().toISOString().slice(0, 7);
      const fallback: BudgetForecast = { period: currentPeriod, budget: 0, forecast: 0, asOf: new Date().toISOString() };
      if (bfResult.status === "fulfilled") {
        const { data: bfResp, error: bfError } = bfResult.value;
        if (!bfError && bfResp?.success) {
          setBudgetForecast({
            period: bfResp.period || currentPeriod,
            budget: Number(bfResp.budget) || 0,
            forecast: Number(bfResp.forecast) || 0,
            asOf: bfResp.asOf || new Date().toISOString(),
          });
        } else {
          setBudgetForecast(fallback);
        }
      } else {
        setBudgetForecast(fallback);
      }
    } catch (err: any) {
      console.error("Erro ao buscar aging:", err);
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    setClientFilter("");
  }, [viewMode]);

  const displayRows = useMemo(() => {
    if (!data?.data) return [];
    const rows = viewMode === "product" ? mergeProductRows(data.data) : data.data;
    if (viewMode === "client" && clientFilter.trim()) {
      const q = clientFilter.trim().toLowerCase();
      return rows.filter((r) => r.product.toLowerCase().includes(q));
    }
    return rows;
  }, [data, viewMode, clientFilter]);

  // Recalculate totals from displayRows
  const totals = useMemo(() => {
    if (displayRows.length === 0) return null;
    const t: AgingRow = {
      product: "Grand Total",
      not_due: 0, aging_30: 0, aging_90: 0, aging_180: 0, aging_240: 0, aging_360: 0, aging_360_plus: 0,
      count_not_due: 0, count_30: 0, count_90: 0, count_180: 0, count_240: 0, count_360: 0, count_360_plus: 0,
    };
    for (const row of displayRows) {
      for (const k of agingKeys) (t[k] as number) += row[k] as number;
      t.count_not_due += row.count_not_due;
      t.count_30 += row.count_30;
      t.count_90 += row.count_90;
      t.count_180 += row.count_180;
      t.count_240 += row.count_240;
      t.count_360 += row.count_360;
      t.count_360_plus += row.count_360_plus;
    }
    return t;
  }, [displayRows]);

  const totalReceivable = totals ? agingKeys.reduce((s, k) => s + (totals[k] as number), 0) : 0;
  const totalOverdue = totals ? totalReceivable - totals.not_due : 0;
  const pctOverdue = totalReceivable > 0 ? ((totalOverdue / totalReceivable) * 100).toFixed(1) : "0";
  const badDebtsValue = totals?.aging_360_plus || 0;

  const budgetValue = budgetForecast?.budget ?? 0;
  const forecastValue = budgetForecast?.forecast ?? 0;
  const gapValue = forecastValue - budgetValue;
  const attainmentPct = budgetValue > 0 ? ((forecastValue / budgetValue) * 100).toFixed(1) : "0";
  const isNegativeGap = gapValue < 0;

  // Aging segmented bar
  const agingSegments = useMemo(() => {
    if (!totals || totalReceivable === 0) return [];
    return agingKeys.map((k) => ({
      key: k,
      value: totals[k as keyof AgingRow] as number,
      pct: ((totals[k as keyof AgingRow] as number) / totalReceivable) * 100,
      color: AGING_COLORS[k],
      label: AGING_LABELS[k],
    })).filter((s) => s.pct >= 0);
  }, [totals, totalReceivable]);

  // Bar chart data
  const barData = useMemo(() => {
    return displayRows.map((r) => ({
      product: r.product,
      "Not Due": r.not_due,
      "0-30": r.aging_30,
      "31-90": r.aging_90,
      "91-180": r.aging_180,
      "181-240": r.aging_240,
      "241-360": r.aging_360,
      "> 360": r.aging_360_plus,
    }));
  }, [displayRows]);

  const pieData = useMemo(() => {
    if (!totalReceivable) return [];
    return [
      { name: "Not Due", value: totals?.not_due || 0 },
      { name: "Overdue", value: totalOverdue },
    ];
  }, [totals, totalOverdue, totalReceivable]);

  // Export to Excel
  const handleExportExcel = () => {
    if (!displayRows.length) return;
    const wsData = [
      ["Brazil Customer Aging Overview", "", "", "", "", "", "", "", "", ""],
      [viewMode === "product" ? "Product" : "Client", "Not Due", "0-30", "31-90", "91-180", "181-240", "241-360", "> 360 (Bad Debts)", "Total Overdue", "Total Receivable"],
    ];
    for (const row of displayRows) {
      const rowOverdue = row.aging_30 + row.aging_90 + row.aging_180 + row.aging_240 + row.aging_360 + row.aging_360_plus;
      const rowTotal = row.not_due + rowOverdue;
      wsData.push([
        row.product,
        row.not_due.toFixed(2),
        row.aging_30.toFixed(2),
        row.aging_90.toFixed(2),
        row.aging_180.toFixed(2),
        row.aging_240.toFixed(2),
        row.aging_360.toFixed(2),
        row.aging_360_plus.toFixed(2),
        rowOverdue.toFixed(2),
        rowTotal.toFixed(2),
      ]);
    }
    if (totals) {
      wsData.push([
        "Grand Total",
        totals.not_due.toFixed(2),
        totals.aging_30.toFixed(2),
        totals.aging_90.toFixed(2),
        totals.aging_180.toFixed(2),
        totals.aging_240.toFixed(2),
        totals.aging_360.toFixed(2),
        totals.aging_360_plus.toFixed(2),
        totalOverdue.toFixed(2),
        totalReceivable.toFixed(2),
      ]);
      // % row
      wsData.push([
        "% do Total",
        ...agingKeys.map(k => totalReceivable > 0 ? `${((totals[k] as number) / totalReceivable * 100).toFixed(1)}%` : "0%"),
        totalReceivable > 0 ? `${(totalOverdue / totalReceivable * 100).toFixed(1)}%` : "0%",
        "100%",
      ]);
      // Provision row
      wsData.push([
        "% Provisão",
        ...agingKeys.map(k => `${PROVISION_PCT[k]}%`),
        "",
        "",
      ]);
      // Provisioned value
      wsData.push([
        "Valor Provisionado",
        ...agingKeys.map(k => ((totals[k] as number) * PROVISION_PCT[k] / 100).toFixed(2)),
        "",
        agingKeys.reduce((s, k) => s + (totals[k] as number) * PROVISION_PCT[k] / 100, 0).toFixed(2),
      ]);
    }
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Aging");
    XLSX.writeFile(wb, `aging_${viewMode}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast({ title: "Excel exportado com sucesso" });
  };

  const columnLabel = viewMode === "product" ? "Product" : "Client";

  const headerRight = (
    <div className="flex items-center gap-2">
      <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "product" | "client")}>
        <TabsList className="h-8 overflow-hidden">
          <TabsTrigger value="product" className="text-xs px-3 py-1">Product</TabsTrigger>
          <TabsTrigger value="client" className="text-xs px-3 py-1">Client</TabsTrigger>
        </TabsList>
      </Tabs>
      <Button size="sm" onClick={handleExportExcel} disabled={loading || !displayRows.length}
        className="h-8 border-border bg-card text-muted-foreground hover:text-foreground text-xs">
        <Download className="h-3.5 w-3.5 mr-1.5" /> Excel
      </Button>
      <Button size="sm" onClick={fetchData} disabled={loading}
        className="h-8 border-border bg-card text-muted-foreground hover:text-foreground text-xs">
        <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
      </Button>
    </div>
  );

  return (
    <PageLayout title="DACHSER" subtitle="Cobrança" pageIcon={DollarSign} backTo="/dashboard" rightContent={headerRight}>
      <div className="space-y-6">
        {/* KPI Cards */}
        <div className="grid gap-4 md:grid-cols-7">
          <KpiCard icon={DollarSign} label="Total Receivable" value={formatCompact(totalReceivable)} loading={loading} />
          <KpiCard icon={AlertTriangle} label="Total Overdue" value={formatCompact(totalOverdue)} loading={loading} accent />
          <KpiCard icon={TrendingUp} label="% Overdue" value={`${pctOverdue}%`} loading={loading} />
          <KpiCard icon={AlertTriangle} label="Bad Debts (>360)" value={formatCompact(badDebtsValue)} loading={loading} accent />
          <KpiCard icon={DollarSign} label="Budget (Mês)" value={formatCompact(budgetValue)} loading={loading} />
          <KpiCard icon={TrendingUp} label="Forecast (Mês)" value={`${formatCompact(forecastValue)} • ${attainmentPct}%`} loading={loading} />
          <KpiCard icon={Clock} label="Último Registro" value={data?.lastUpdate ? new Date(data.lastUpdate).toLocaleString("pt-BR") : "—"} loading={loading} />
        </div>

        {/* Provisioning Summary Card (Working Capital style) */}
        {totals && totalReceivable > 0 && (
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-foreground">Resumo de Provisão — Working Capital</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left py-2 px-4 text-xs uppercase tracking-wider text-muted-foreground font-semibold">Faixa</th>
                      {agingKeys.map(k => (
                        <th key={k} className="text-right py-2 px-3 text-xs uppercase tracking-wider font-semibold" style={{ color: AGING_COLORS[k] }}>
                          {AGING_LABELS[k]}
                        </th>
                      ))}
                      <th className="text-right py-2 px-3 text-xs uppercase tracking-wider font-semibold text-red-400">Total Overdue</th>
                      <th className="text-right py-2 px-4 text-xs uppercase tracking-wider font-semibold text-foreground">Grand Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-border/30">
                      <td className="py-2 px-4 font-medium text-foreground">Valor</td>
                      {agingKeys.map(k => (
                        <td key={k} className="py-2 px-3 text-right tabular-nums" style={{ color: AGING_COLORS[k] }}>
                          {formatBRL(totals[k] as number)}
                        </td>
                      ))}
                      <td className="py-2 px-3 text-right tabular-nums text-red-400 font-medium">{formatBRL(totalOverdue)}</td>
                      <td className="py-2 px-4 text-right tabular-nums text-foreground font-medium">{formatBRL(totalReceivable)}</td>
                    </tr>
                    <tr className="border-b border-border/30">
                      <td className="py-2 px-4 text-muted-foreground">% do Total</td>
                      {agingKeys.map(k => (
                        <td key={k} className="py-2 px-3 text-right tabular-nums text-muted-foreground">
                          {((totals[k] as number) / totalReceivable * 100).toFixed(1)}%
                        </td>
                      ))}
                      <td className="py-2 px-3 text-right tabular-nums text-red-400">{pctOverdue}%</td>
                      <td className="py-2 px-4 text-right tabular-nums text-muted-foreground">100%</td>
                    </tr>
                    <tr className="border-b border-border/30">
                      <td className="py-2 px-4 text-muted-foreground">% Provisão</td>
                      {agingKeys.map(k => (
                        <td key={k} className="py-2 px-3 text-right tabular-nums text-muted-foreground">
                          {PROVISION_PCT[k]}%
                        </td>
                      ))}
                      <td className="py-2 px-3" />
                      <td className="py-2 px-4" />
                    </tr>
                    <tr className="border-t-2 border-primary/40 bg-primary/5">
                      <td className="py-2 px-4 font-bold text-primary">Valor Provisionado</td>
                      {agingKeys.map(k => {
                        const prov = (totals[k] as number) * PROVISION_PCT[k] / 100;
                        return (
                          <td key={k} className="py-2 px-3 text-right tabular-nums font-bold" style={{ color: prov > 0 ? AGING_COLORS[k] : "var(--muted-foreground)" }}>
                            {formatBRL(prov)}
                          </td>
                        );
                      })}
                      <td className="py-2 px-3" />
                      <td className="py-2 px-4 text-right tabular-nums font-bold text-foreground">
                        {formatBRL(agingKeys.reduce((s, k) => s + (totals[k] as number) * PROVISION_PCT[k] / 100, 0))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Aging Distribution Bar */}
        {agingSegments.length > 0 && (
          <Card className="bg-card border-border">
            <CardContent className="p-5">
              <div className="flex rounded-lg overflow-hidden h-8">
                {agingSegments.map((seg) => (
                  <div key={seg.key} className="flex items-center justify-center text-[10px] font-bold text-white transition-all"
                    style={{ width: `${Math.max(seg.pct, 1)}%`, backgroundColor: seg.color }}
                    title={`${seg.label}: ${formatBRL(seg.value)} (${seg.pct.toFixed(1)}%)`}>
                    {seg.pct > 4 && `${seg.pct.toFixed(0)}%`}
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-3 mt-3">
                {agingSegments.map((seg) => (
                  <div key={seg.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: seg.color }} />
                    {seg.label}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Aging Table */}
        <Card className="bg-card border-border overflow-hidden">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm text-foreground">Brazil Customer Aging Overview</CardTitle>
            {viewMode === "client" && (
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Filtrar cliente..." value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}
                  className="h-8 pl-8 text-xs bg-background border-border" />
              </div>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <div className={viewMode === "client" ? "overflow-x-auto max-h-[600px] overflow-y-auto" : "overflow-x-auto"}>
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card z-10">
                  <tr className="border-b border-border/50">
                    <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                      {columnLabel}
                    </th>
                    {agingKeys.map((k) => {
                      const seg = agingSegments.find((s) => s.key === k);
                      return (
                        <th key={k} className="text-right py-3 px-4 font-semibold" style={{ color: AGING_COLORS[k] }}>
                          {seg && <div className="text-sm font-bold mb-1">{seg.pct.toFixed(0)}%</div>}
                          <div className="text-xs uppercase tracking-wider">{AGING_LABELS[k]}</div>
                        </th>
                      );
                    })}
                    <th className="text-right py-3 px-4 font-semibold text-red-400">
                      {totalReceivable > 0 && <div className="text-sm font-bold mb-1">{pctOverdue}%</div>}
                      <div className="text-xs uppercase tracking-wider">Total Overdue</div>
                    </th>
                    <th className="text-right py-3 px-4 font-semibold text-foreground">
                      <div className="text-xs uppercase tracking-wider">Total Receivable</div>
                      {totalReceivable > 0 && (
                        <div className="text-[10px] font-normal text-muted-foreground mt-0.5">{formatCompact(totalReceivable)}</div>
                      )}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={10} className="text-center py-8 text-muted-foreground">Carregando dados...</td></tr>
                  ) : displayRows.length === 0 ? (
                    <tr><td colSpan={10} className="text-center py-8 text-muted-foreground">Nenhum dado encontrado</td></tr>
                  ) : (
                    <>
                      {displayRows.map((row, idx) => {
                        const rowOverdue = row.aging_30 + row.aging_90 + row.aging_180 + row.aging_240 + row.aging_360 + row.aging_360_plus;
                        const rowTotal = row.not_due + rowOverdue;
                        const isBadDebt = row.aging_360_plus > 0;
                        return (
                          <tr key={idx} className={`border-b border-border/30 hover:bg-muted/10 ${isBadDebt ? "bg-red-500/5" : ""} ${viewMode === "client" ? "cursor-pointer" : ""}`}
                            onClick={() => { if (viewMode === "client") { setSelectedClient(row); setSheetOpen(true); } }}>
                            <td className="py-2.5 px-4 font-medium text-foreground">
                              {row.product}
                              {row.cnpjs && row.cnpjs.length > 1 && (
                                <span className="ml-2 text-[10px] text-muted-foreground">({row.cnpjs.length} CNPJs)</span>
                              )}
                            </td>
                            {agingKeys.map((k) => (
                              <td key={k} className="py-2.5 px-4 text-right tabular-nums"
                                style={{ color: (row[k] as number) > 0 ? AGING_COLORS[k] : "var(--muted-foreground)" }}>
                                {formatBRL(row[k] as number)}
                              </td>
                            ))}
                            <td className="py-2.5 px-4 text-right tabular-nums text-red-400 font-medium">{formatBRL(rowOverdue)}</td>
                            <td className="py-2.5 px-4 text-right tabular-nums text-foreground font-medium">{formatBRL(rowTotal)}</td>
                          </tr>
                        );
                      })}
                      {/* Bad Debts summary row */}
                      {totals && totals.aging_360_plus > 0 && (
                        <tr className="border-t border-red-500/30 bg-red-500/10">
                          <td className="py-2.5 px-4 font-bold text-red-400">Bad Debts ({">"}360)</td>
                          {agingKeys.map((k) => (
                            <td key={k} className="py-2.5 px-4 text-right tabular-nums font-bold" style={{ color: k === "aging_360_plus" ? "#991b1b" : "transparent" }}>
                              {k === "aging_360_plus" ? formatBRL(totals.aging_360_plus) : ""}
                            </td>
                          ))}
                          <td className="py-2.5 px-4" />
                          <td className="py-2.5 px-4 text-right tabular-nums font-bold text-red-400">
                            {totalReceivable > 0 ? `${((totals.aging_360_plus / totalReceivable) * 100).toFixed(1)}% do total` : ""}
                          </td>
                        </tr>
                      )}
                      {/* Grand Total */}
                      {totals && (
                        <tr className="border-t-2 border-primary/40 bg-primary/5 sticky bottom-0">
                          <td className="py-3 px-4 font-bold text-primary">Grand Total</td>
                          {agingKeys.map((k) => (
                            <td key={k} className="py-3 px-4 text-right tabular-nums font-bold" style={{ color: AGING_COLORS[k] }}>
                              {formatBRL(totals[k] as number)}
                            </td>
                          ))}
                          <td className="py-3 px-4 text-right tabular-nums font-bold text-red-400">{formatBRL(totalOverdue)}</td>
                          <td className="py-3 px-4 text-right tabular-nums font-bold text-foreground">{formatBRL(totalReceivable)}</td>
                        </tr>
                      )}
                    </>
                  )}
                </tbody>
              </table>
            </div>
            {viewMode === "client" && (
              <div className="px-4 py-2 border-t border-border/50 text-xs text-muted-foreground">
                {displayRows.length} clientes
              </div>
            )}
          </CardContent>
        </Card>

        {/* Charts */}
        {!loading && displayRows.length > 0 && (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-foreground">Aging por {columnLabel}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={barData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }} barSize={28}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                    <XAxis dataKey="product" tick={{ fill: "#aaa", fontSize: 11 }} />
                    <YAxis tick={{ fill: "#aaa", fontSize: 11 }}
                      tickFormatter={(v) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(0)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(0)}K` : v} />
                    <Tooltip contentStyle={{ backgroundColor: "rgba(0,0,0,0.85)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8 }}
                      labelStyle={{ color: "#fff" }} formatter={(value: number) => formatBRL(value)} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Not Due" stackId="a" fill={AGING_COLORS.not_due} />
                    <Bar dataKey="0-30" stackId="a" fill={AGING_COLORS.aging_30} />
                    <Bar dataKey="31-90" stackId="a" fill={AGING_COLORS.aging_90} />
                    <Bar dataKey="91-180" stackId="a" fill={AGING_COLORS.aging_180} />
                    <Bar dataKey="181-240" stackId="a" fill={AGING_COLORS.aging_240} />
                    <Bar dataKey="241-360" stackId="a" fill={AGING_COLORS.aging_360} />
                    <Bar dataKey="> 360" stackId="a" fill={AGING_COLORS.aging_360_plus} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-foreground">Not Due vs Overdue</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-center">
                <ResponsiveContainer width="100%" height={320}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" outerRadius={110} innerRadius={60} dataKey="value"
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`} labelLine={false}>
                      {pieData.map((_, i) => (<Cell key={i} fill={PIE_COLORS[i]} />))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: "rgba(0,0,0,0.85)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8 }}
                      formatter={(value: number) => formatBRL(value)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </PageLayout>
  );
}

function KpiCard({ icon: Icon, label, value, loading, accent }: {
  icon: any; label: string; value: string; loading: boolean; accent?: boolean;
}) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${accent ? "bg-red-500/10 border border-red-500/30" : "bg-primary/10 border border-primary/30"}`}>
          <Icon className={`h-5 w-5 ${accent ? "text-red-400" : "text-primary"}`} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className={`text-lg font-bold ${loading ? "animate-pulse text-muted-foreground" : accent ? "text-red-400" : "text-foreground"}`}>
            {loading ? "..." : value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
