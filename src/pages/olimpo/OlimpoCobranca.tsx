import { useState, useEffect, useMemo } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, TrendingUp, AlertTriangle, Clock, RefreshCw, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";

interface AgingRow {
  product: string;
  not_due: number;
  aging_90: number;
  aging_180: number;
  aging_240: number;
  aging_360: number;
  aging_360_plus: number;
  count_not_due: number;
  count_90: number;
  count_180: number;
  count_240: number;
  count_360: number;
  count_360_plus: number;
}

interface AgingData {
  data: AgingRow[];
  totals: AgingRow;
  lastUpdate: string;
}

const AGING_COLORS = {
  not_due: "#22c55e",
  aging_90: "#eab308",
  aging_180: "#f97316",
  aging_240: "#ef4444",
  aging_360: "#dc2626",
  aging_360_plus: "#991b1b",
};

const AGING_LABELS: Record<string, string> = {
  not_due: "Not Due",
  aging_90: "< 90",
  aging_180: "91-180",
  aging_240: "181-240",
  aging_360: "241-360",
  aging_360_plus: "> 360",
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

const agingKeys = ["not_due", "aging_90", "aging_180", "aging_240", "aging_360", "aging_360_plus"] as const;

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
      grouped[mapped].count_90 += row.count_90;
      grouped[mapped].count_180 += row.count_180;
      grouped[mapped].count_240 += row.count_240;
      grouped[mapped].count_360 += row.count_360;
      grouped[mapped].count_360_plus += row.count_360_plus;
    }
  }
  return Object.values(grouped).sort((a, b) => {
    const totalA = a.not_due + a.aging_90 + a.aging_180 + a.aging_240 + a.aging_360 + a.aging_360_plus;
    const totalB = b.not_due + b.aging_90 + b.aging_180 + b.aging_240 + b.aging_360 + b.aging_360_plus;
    return totalB - totalA;
  });
}

export default function OlimpoCobranca() {
  const [data, setData] = useState<AgingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"product" | "client">("product");
  const [clientFilter, setClientFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 15;
  const { toast } = useToast();

  const fetchData = async () => {
    setLoading(true);
    try {
      const action = viewMode === "client" ? "get_aging_by_client" : "get_aging_overview";
      const { data: resp, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { action },
      });
      if (error) throw error;
      if (!resp?.success) throw new Error(resp?.error || "Erro desconhecido");
      setData(resp);
    } catch (err: any) {
      console.error("Erro ao buscar aging:", err);
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setCurrentPage(1); setClientFilter(""); }, [viewMode]);

  // Apply product mapping only for product view
  const displayRows = useMemo(() => {
    if (!data?.data) return [];
    const rows = viewMode === "product" ? mergeProductRows(data.data) : data.data;
    if (viewMode === "client" && clientFilter.trim()) {
      const q = clientFilter.trim().toLowerCase();
      return rows.filter((r) => r.product.toLowerCase().includes(q));
    }
    return rows;
  }, [data, viewMode, clientFilter]);

  // Reset page when filter changes
  useEffect(() => { setCurrentPage(1); }, [clientFilter]);

  const totalPages = Math.max(1, Math.ceil(displayRows.length / PAGE_SIZE));
  const paginatedRows = viewMode === "client"
    ? displayRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
    : displayRows;

  // Recalculate totals from displayRows
  const totals = useMemo(() => {
    if (displayRows.length === 0) return null;
    const t: AgingRow = {
      product: "Grand Total",
      not_due: 0, aging_90: 0, aging_180: 0, aging_240: 0, aging_360: 0, aging_360_plus: 0,
      count_not_due: 0, count_90: 0, count_180: 0, count_240: 0, count_360: 0, count_360_plus: 0,
    };
    for (const row of displayRows) {
      for (const k of agingKeys) (t[k] as number) += row[k] as number;
      t.count_not_due += row.count_not_due;
      t.count_90 += row.count_90;
      t.count_180 += row.count_180;
      t.count_240 += row.count_240;
      t.count_360 += row.count_360;
      t.count_360_plus += row.count_360_plus;
    }
    return t;
  }, [displayRows]);

  const totalReceivable = totals
    ? totals.not_due + totals.aging_90 + totals.aging_180 + totals.aging_240 + totals.aging_360 + totals.aging_360_plus
    : 0;
  const totalOverdue = totals
    ? totals.aging_90 + totals.aging_180 + totals.aging_240 + totals.aging_360 + totals.aging_360_plus
    : 0;
  const pctOverdue = totalReceivable > 0 ? ((totalOverdue / totalReceivable) * 100).toFixed(1) : "0";

  // Aging segmented bar
  const agingSegments = useMemo(() => {
    if (!totals || totalReceivable === 0) return [];
    return agingKeys.map((k) => ({
      key: k,
      value: totals[k as keyof AgingRow] as number,
      pct: (((totals[k as keyof AgingRow] as number) / totalReceivable) * 100),
      color: AGING_COLORS[k],
      label: AGING_LABELS[k],
    })).filter((s) => s.pct >= 0);
  }, [totals, totalReceivable]);

  // Bar chart data
  const barData = useMemo(() => {
    return displayRows.map((r) => ({
      product: r.product,
      "Not Due": r.not_due,
      "< 90": r.aging_90,
      "91-180": r.aging_180,
      "181-240": r.aging_240,
      "241-360": r.aging_360,
      "> 360": r.aging_360_plus,
    }));
  }, [displayRows]);

  // Pie chart data
  const pieData = useMemo(() => {
    if (!totalReceivable) return [];
    return [
      { name: "Not Due", value: totals?.not_due || 0 },
      { name: "Overdue", value: totalOverdue },
    ];
  }, [totals, totalOverdue, totalReceivable]);

  const columnLabel = viewMode === "product" ? "Product" : "Client";

  const headerRight = (
    <div className="flex items-center gap-2">
      <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "product" | "client")}>
        <TabsList className="h-8">
          <TabsTrigger value="product" className="text-xs px-3 py-1">Product</TabsTrigger>
          <TabsTrigger value="client" className="text-xs px-3 py-1">Client</TabsTrigger>
        </TabsList>
      </Tabs>
      <Button
        variant="outline"
        size="sm"
        onClick={fetchData}
        disabled={loading}
        className="h-8 border-border bg-card text-muted-foreground hover:text-foreground text-xs"
      >
        <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
        Atualizar
      </Button>
    </div>
  );

  return (
    <PageLayout title="DACHSER" subtitle="Olimpo — Cobrança" pageIcon={DollarSign} backTo="/olimpo" rightContent={headerRight}>
      <div className="space-y-6">

        {/* KPI Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <KpiCard icon={DollarSign} label="Total Receivable" value={formatCompact(totalReceivable)} loading={loading} />
          <KpiCard icon={AlertTriangle} label="Total Overdue" value={formatCompact(totalOverdue)} loading={loading} accent />
          <KpiCard icon={TrendingUp} label="% Overdue" value={`${pctOverdue}%`} loading={loading} />
          <KpiCard
            icon={Clock}
            label="Último Registro"
            value={data?.lastUpdate ? new Date(data.lastUpdate).toLocaleString("pt-BR") : "—"}
            loading={loading}
          />
        </div>

        {/* Aging Distribution Header Card (matching reference image) */}
        {agingSegments.length > 0 && (
          <Card className="bg-card border-border">
            <CardContent className="p-5">
              {/* Segmented bar only */}
              <div className="flex rounded-lg overflow-hidden h-8">
                {agingSegments.map((seg) => (
                  <div
                    key={seg.key}
                    className="flex items-center justify-center text-[10px] font-bold text-white transition-all"
                    style={{ width: `${Math.max(seg.pct, 1)}%`, backgroundColor: seg.color }}
                    title={`${seg.label}: ${formatBRL(seg.value)} (${seg.pct.toFixed(1)}%)`}
                  >
                    {seg.pct > 4 && `${seg.pct.toFixed(0)}%`}
                  </div>
                ))}
              </div>
              {/* Legend row */}
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
                <Input
                  placeholder="Filtrar cliente..."
                  value={clientFilter}
                  onChange={(e) => setClientFilter(e.target.value)}
                  className="h-8 pl-8 text-xs bg-background border-border"
                />
              </div>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-semibold">{columnLabel}</th>
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
                      {totalReceivable > 0 && <div className="text-[10px] font-normal text-muted-foreground mt-0.5">{formatCompact(totalReceivable)}</div>}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="text-center py-8 text-muted-foreground">Carregando dados...</td>
                    </tr>
                  ) : paginatedRows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-8 text-muted-foreground">Nenhum dado encontrado</td>
                    </tr>
                  ) : (
                    <>
                      {paginatedRows.map((row, idx) => {
                        const rowOverdue = row.aging_90 + row.aging_180 + row.aging_240 + row.aging_360 + row.aging_360_plus;
                        const rowTotal = row.not_due + rowOverdue;
                        return (
                          <tr key={idx} className="border-b border-border/30 hover:bg-muted/10">
                            <td className="py-2.5 px-4 font-medium text-foreground">{row.product}</td>
                            {agingKeys.map((k) => (
                              <td key={k} className="py-2.5 px-4 text-right tabular-nums" style={{ color: (row[k] as number) > 0 ? AGING_COLORS[k] : "var(--muted-foreground)" }}>
                                {formatBRL(row[k] as number)}
                              </td>
                            ))}
                            <td className="py-2.5 px-4 text-right tabular-nums text-red-400 font-medium">{formatBRL(rowOverdue)}</td>
                            <td className="py-2.5 px-4 text-right tabular-nums text-foreground font-medium">{formatBRL(rowTotal)}</td>
                          </tr>
                        );
                      })}
                      {totals && (
                        <tr className="border-t-2 border-primary/40 bg-primary/5">
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
            {viewMode === "client" && totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border/50">
                <span className="text-xs text-muted-foreground">
                  {displayRows.length} clientes • Página {currentPage} de {totalPages}
                </span>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => p - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((p) => p + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
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
                  <BarChart data={barData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                    <XAxis dataKey="product" tick={{ fill: "#aaa", fontSize: 11 }} />
                    <YAxis
                      tick={{ fill: "#aaa", fontSize: 11 }}
                      tickFormatter={(v) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(0)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(0)}K` : v}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: "rgba(0,0,0,0.85)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8 }}
                      labelStyle={{ color: "#fff" }}
                      formatter={(value: number) => formatBRL(value)}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Not Due" stackId="a" fill={AGING_COLORS.not_due} />
                    <Bar dataKey="< 90" stackId="a" fill={AGING_COLORS.aging_90} />
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
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      outerRadius={110}
                      innerRadius={60}
                      dataKey="value"
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
                      labelLine={false}
                    >
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: "rgba(0,0,0,0.85)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8 }}
                      formatter={(value: number) => formatBRL(value)}
                    />
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
  icon: any;
  label: string;
  value: string;
  loading: boolean;
  accent?: boolean;
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
