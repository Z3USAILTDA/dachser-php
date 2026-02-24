import { useState, useEffect, useMemo } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, TrendingUp, AlertTriangle, Clock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
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

export default function OlimpoCobranca() {
  const [data, setData] = useState<AgingData | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: resp, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { action: "get_aging_overview" },
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

  useEffect(() => { fetchData(); }, []);

  const totals = data?.totals;
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
    const keys: (keyof typeof AGING_COLORS)[] = ["not_due", "aging_90", "aging_180", "aging_240", "aging_360", "aging_360_plus"];
    return keys.map((k) => ({
      key: k,
      value: totals[k as keyof AgingRow] as number,
      pct: (((totals[k as keyof AgingRow] as number) / totalReceivable) * 100),
      color: AGING_COLORS[k],
      label: AGING_LABELS[k],
    })).filter((s) => s.pct > 0);
  }, [totals, totalReceivable]);

  // Bar chart data
  const barData = useMemo(() => {
    if (!data?.data) return [];
    return data.data.map((r) => ({
      product: r.product,
      "Not Due": r.not_due,
      "< 90": r.aging_90,
      "91-180": r.aging_180,
      "181-240": r.aging_240,
      "241-360": r.aging_360,
      "> 360": r.aging_360_plus,
    }));
  }, [data]);

  // Pie chart data
  const pieData = useMemo(() => {
    if (!totalReceivable) return [];
    return [
      { name: "Not Due", value: totals?.not_due || 0 },
      { name: "Overdue", value: totalOverdue },
    ];
  }, [totals, totalOverdue, totalReceivable]);

  const agingKeys = ["not_due", "aging_90", "aging_180", "aging_240", "aging_360", "aging_360_plus"] as const;

  return (
    <PageLayout title="DACHSER" subtitle="Olimpo — Cobrança" pageIcon={DollarSign} backTo="/olimpo">
      <div className="space-y-6">
        {/* Refresh */}
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            disabled={loading}
            className="border-[rgba(255,255,255,0.15)] bg-[rgba(0,0,0,0.4)] text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        {/* KPI Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <KpiCard icon={DollarSign} label="Total Receivable" value={formatCompact(totalReceivable)} loading={loading} />
          <KpiCard icon={AlertTriangle} label="Total Overdue" value={formatCompact(totalOverdue)} loading={loading} accent />
          <KpiCard icon={TrendingUp} label="% Overdue" value={`${pctOverdue}%`} loading={loading} />
          <KpiCard
            icon={Clock}
            label="Última Atualização"
            value={data?.lastUpdate ? new Date(data.lastUpdate).toLocaleString("pt-BR") : "—"}
            loading={loading}
          />
        </div>

        {/* Segmented Aging Bar */}
        {agingSegments.length > 0 && (
          <Card className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Distribuição de Aging</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex rounded-lg overflow-hidden h-8">
                {agingSegments.map((seg) => (
                  <div
                    key={seg.key}
                    className="flex items-center justify-center text-[10px] font-bold text-white transition-all"
                    style={{ width: `${seg.pct}%`, backgroundColor: seg.color, minWidth: seg.pct > 3 ? undefined : "24px" }}
                    title={`${seg.label}: ${formatBRL(seg.value)} (${seg.pct.toFixed(1)}%)`}
                  >
                    {seg.pct > 5 && `${seg.pct.toFixed(0)}%`}
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
        <Card className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)] overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-foreground">Brazil Customer Aging Overview</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[rgba(255,255,255,0.1)]">
                    <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-semibold">Product</th>
                    {agingKeys.map((k) => (
                      <th
                        key={k}
                        className="text-right py-3 px-4 text-xs uppercase tracking-wider font-semibold"
                        style={{ color: AGING_COLORS[k] }}
                      >
                        {AGING_LABELS[k]}
                      </th>
                    ))}
                    <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-red-400 font-semibold">Total Overdue</th>
                    <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-foreground font-semibold">Total Receivable</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="text-center py-8 text-muted-foreground">Carregando dados...</td>
                    </tr>
                  ) : data?.data?.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-8 text-muted-foreground">Nenhum dado encontrado</td>
                    </tr>
                  ) : (
                    <>
                      {data?.data?.map((row, idx) => {
                        const rowOverdue = row.aging_90 + row.aging_180 + row.aging_240 + row.aging_360 + row.aging_360_plus;
                        const rowTotal = row.not_due + rowOverdue;
                        return (
                          <tr key={idx} className="border-b border-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.03)]">
                            <td className="py-2.5 px-4 font-medium text-foreground">{row.product}</td>
                            {agingKeys.map((k) => (
                              <td key={k} className="py-2.5 px-4 text-right tabular-nums" style={{ color: (row[k] as number) > 0 ? AGING_COLORS[k] : "rgba(255,255,255,0.25)" }}>
                                {formatBRL(row[k] as number)}
                              </td>
                            ))}
                            <td className="py-2.5 px-4 text-right tabular-nums text-red-400 font-medium">{formatBRL(rowOverdue)}</td>
                            <td className="py-2.5 px-4 text-right tabular-nums text-foreground font-medium">{formatBRL(rowTotal)}</td>
                          </tr>
                        );
                      })}
                      {/* Grand Total */}
                      {totals && (
                        <tr className="border-t-2 border-primary/40 bg-[rgba(255,200,0,0.05)]">
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
          </CardContent>
        </Card>

        {/* Charts */}
        {!loading && data?.data && data.data.length > 0 && (
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Stacked Bar Chart */}
            <Card className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-foreground">Aging por Produto</CardTitle>
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

            {/* Pie Chart */}
            <Card className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]">
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
    <Card className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]">
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
