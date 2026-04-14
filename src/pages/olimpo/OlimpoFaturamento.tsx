import { useState, useEffect, useMemo } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, FileText, TrendingUp, TrendingDown, Users, RefreshCw, Building2, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, LabelList,
  AreaChart, Area, LineChart, Line,
} from "recharts";

interface FaturamentoRow {
  processo: string;
  faturado_em: string | null;
  filial: string | null;
  modal: string | null;
  cliente: string | null;
  valor_total_faturado: number | null;
  regiao: string | null;
  divisao_por_modal: string | null;
}

const MODAL_COLORS: Record<string, string> = {
  AI: "#4a6fa5",
  SI: "#e8913a",
  TCK: "#8b9dc3",
  ASO: "#48a868",
  SE: "#b065a1",
  AE: "#5cb3c8",
};

const REGION_COLORS: Record<string, string> = {
  Sudeste: "#4a6fa5",
  Sul: "#8b9dc3",
};

const MONTH_NAMES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
const MONTH_SHORT = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];

const safeNum = (v: any): number => {
  if (v == null) return 0;
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return isNaN(n) || !isFinite(n) ? 0 : n;
};

const formatBRLFull = (v: any) => {
  const n = safeNum(v);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
};

const formatMonthLabel = (d: string) => {
  const [y, m] = d.split("-");
  return `${MONTH_SHORT[parseInt(m) - 1]}/${y}`;
};

const formatMonthFull = (d: string) => {
  const [y, m] = d.split("-");
  return `${MONTH_NAMES[parseInt(m) - 1].charAt(0).toUpperCase() + MONTH_NAMES[parseInt(m) - 1].slice(1)} ${y}`;
};

const formatCompact = (v: any) => {
  const n = safeNum(v);
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(2).replace(".", ",")}M`;
  if (n >= 1_000) return `R$ ${(n / 1_000).toFixed(0)}k`;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
};

const tooltipStyle = {
  backgroundColor: "rgba(0,0,0,0.85)",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 8,
};
const tooltipLabelStyle = { color: "#fff", fontSize: 11 };

const gridStroke = "rgba(255,255,255,0.08)";
const tickStyle = { fill: "#aaa", fontSize: 11 };
const labelStyle = { fill: "#ccc", fontSize: 10, fontWeight: 600 };
const legendStyle = { fontSize: 11, color: "#aaa" };
const chartMargin = { top: 10, right: 10, left: 10, bottom: 5 };

export default function OlimpoFaturamento() {
  const [data, setData] = useState<FaturamentoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { action: "get_faturamento_dashboard" },
      });
      if (error) throw error;
      setData(res?.data || []);
    } catch (e: any) {
      console.error(e);
      toast({ title: "Erro ao carregar dados", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const monthlyData = useMemo(() => {
    const map = new Map<string, { count: number; valor: number; byModal: Record<string, { count: number; valor: number }> }>();
    data.forEach((r) => {
      if (!r.faturado_em) return;
      const mk = r.faturado_em.substring(0, 7);
      if (!map.has(mk)) map.set(mk, { count: 0, valor: 0, byModal: {} });
      const entry = map.get(mk)!;
      entry.count++;
      entry.valor += safeNum(r.valor_total_faturado);
      const modal = (r.modal || "OUTROS").toUpperCase();
      if (!entry.byModal[modal]) entry.byModal[modal] = { count: 0, valor: 0 };
      entry.byModal[modal].count++;
      entry.byModal[modal].valor += safeNum(r.valor_total_faturado);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, ...v }));
  }, [data]);

  const allModals = useMemo(() => {
    const s = new Set<string>();
    monthlyData.forEach((m) => Object.keys(m.byModal).forEach((k) => s.add(k)));
    return Array.from(s).sort();
  }, [monthlyData]);

  const kpis = useMemo(() => {
    if (monthlyData.length === 0) return { total: 0, count: 0, variation: 0, countVariation: 0, topClient: "-", topClientVal: 0, lastMonth: "", prevMonthLabel: "" };
    const last = monthlyData[monthlyData.length - 1];
    const prev = monthlyData.length > 1 ? monthlyData[monthlyData.length - 2] : null;
    const variation = prev && prev.valor > 0 ? ((last.valor - prev.valor) / prev.valor) * 100 : 0;
    const countVariation = prev && prev.count > 0 ? ((last.count - prev.count) / prev.count) * 100 : 0;
    const clientMap = new Map<string, number>();
    data.forEach((r) => {
      if (!r.faturado_em || r.faturado_em.substring(0, 7) !== last.month) return;
      const c = r.cliente || "Desconhecido";
      clientMap.set(c, (clientMap.get(c) || 0) + safeNum(r.valor_total_faturado));
    });
    let topClient = "-";
    let topClientVal = 0;
    clientMap.forEach((v, k) => { if (v > topClientVal) { topClient = k; topClientVal = v; } });
    const prevMonthLabel = prev ? formatMonthLabel(prev.month).toUpperCase() : "";
    return { total: last.valor, count: last.count, variation, countVariation, topClient, topClientVal, lastMonth: last.month, prevMonthLabel };
  }, [monthlyData, data]);

  const regionData = useMemo(() => {
    const map = new Map<string, number>();
    const lastMonth = monthlyData.length > 0 ? monthlyData[monthlyData.length - 1].month : null;
    data.forEach((r) => {
      if (!r.faturado_em || !lastMonth) return;
      if (r.faturado_em.substring(0, 7) !== lastMonth) return;
      const reg = r.regiao || "Outros";
      map.set(reg, (map.get(reg) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [data, monthlyData]);

  const lastMonthModalData = useMemo(() => {
    if (monthlyData.length === 0) return [];
    const last = monthlyData[monthlyData.length - 1];
    return Object.entries(last.byModal)
      .map(([name, v]) => ({ name, count: v.count, valor: v.valor }))
      .sort((a, b) => b.count - a.count);
  }, [monthlyData]);

  const divisionData = useMemo(() => {
    const lastMonth = monthlyData.length > 0 ? monthlyData[monthlyData.length - 1].month : null;
    const divMap: Record<string, { count: number; valor: number }> = {};
    data.forEach((r) => {
      if (!r.faturado_em || !lastMonth) return;
      if (r.faturado_em.substring(0, 7) !== lastMonth) return;
      const div = r.divisao_por_modal || "Outros";
      if (!divMap[div]) divMap[div] = { count: 0, valor: 0 };
      divMap[div].count++;
      divMap[div].valor += safeNum(r.valor_total_faturado);
    });
    return Object.entries(divMap).map(([name, v]) => ({ name, ...v }));
  }, [data, monthlyData]);

  const chartMonthlyCount = useMemo(() =>
    monthlyData.map((m) => ({ name: formatMonthLabel(m.month), Quantidade: m.count })), [monthlyData]);

  const chartMonthlyValor = useMemo(() =>
    monthlyData.map((m) => ({ name: formatMonthLabel(m.month), Valor: m.valor })), [monthlyData]);

  const chartModalCount = useMemo(() =>
    monthlyData.map((m) => {
      const row: Record<string, any> = { name: formatMonthLabel(m.month) };
      allModals.forEach((mod) => { row[mod] = m.byModal[mod]?.count || 0; });
      return row;
    }), [monthlyData, allModals]);

  const chartModalValor = useMemo(() =>
    monthlyData.map((m) => {
      const row: Record<string, any> = { name: formatMonthLabel(m.month) };
      allModals.forEach((mod) => { row[mod] = m.byModal[mod]?.valor || 0; });
      return row;
    }), [monthlyData, allModals]);

  // Sparkline data for KPI cards
  const sparklineCount = useMemo(() => monthlyData.slice(-6).map((m) => ({ v: m.count })), [monthlyData]);
  const sparklineValor = useMemo(() => monthlyData.slice(-6).map((m) => ({ v: m.valor })), [monthlyData]);

  const firstMonth = monthlyData.length > 0 ? formatMonthLabel(monthlyData[0].month) : "";
  const lastMonthShort = monthlyData.length > 0 ? formatMonthLabel(monthlyData[monthlyData.length - 1].month) : "";

  return (
    <PageLayout
      title="DACHSER"
      subtitle="Olimpo — Faturamento"
      pageIcon={Building2}
      backTo="/dashboard"
      rightContent={
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} className="border-border/30 hover:border-primary/50 transition-all">
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      }
    >
      <div className="space-y-6">
        <p className="text-xs text-muted-foreground/70">
          Período: {firstMonth} – {lastMonthShort} · Base: TOTVS RM
        </p>

        {/* KPI Cards — inspired by reference with sparklines */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <SparklineKpiCard
            label="Faturamento Total"
            value={formatCompact(kpis.total)}
            loading={loading}
            variation={kpis.variation}
            sparkData={sparklineValor}
            sparkColor="#4a6fa5"
            sparkType="bar"
          />
          <SparklineKpiCard
            label="Processos Faturados"
            value={kpis.count.toLocaleString("pt-BR")}
            loading={loading}
            variation={kpis.countVariation}
            sparkData={sparklineCount}
            sparkColor="#22c55e"
            sparkType="bar"
          />
          <SparklineKpiCard
            label={`Var. vs ${kpis.prevMonthLabel || "Mês Ant."}`}
            value={`${kpis.variation >= 0 ? "+" : ""}${kpis.variation.toFixed(1)}%`}
            loading={loading}
            accent={kpis.variation < 0}
            sparkData={sparklineValor}
            sparkColor={kpis.variation >= 0 ? "#22c55e" : "#ef4444"}
            sparkType="line"
          />
          <SparklineKpiCard
            label="Maior Cliente"
            value={formatCompact(kpis.topClientVal)}
            loading={loading}
            subtitle={kpis.topClient !== "-" ? kpis.topClient : undefined}
            sparkData={sparklineValor}
            sparkColor="#e8913a"
            sparkType="line"
          />
        </div>

        {/* Main Chart — AreaChart like reference */}
        <GlassCard className="p-0">
          <div className="flex items-center justify-between px-6 pt-5 pb-2">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Quantidade de Files — Total Faturado</h3>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">Evolução mensal de processos faturados</p>
            </div>
            <Badge variant="outline" className="text-[10px] px-2.5 py-1 font-medium text-primary border-primary/30 bg-primary/10">
              Tendência
            </Badge>
          </div>
          <div className="px-4 pb-4">
            <ResponsiveContainer width="100%" height={240}>
              {chartMonthlyCount.length > 2 ? (
                <AreaChart data={chartMonthlyCount} margin={{ top: 20, right: 20, left: 10, bottom: 5 }}>
                  <defs>
                    <linearGradient id="areaGradientMain" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4a6fa5" stopOpacity={0.35} />
                      <stop offset="50%" stopColor="#4a6fa5" stopOpacity={0.1} />
                      <stop offset="100%" stopColor="#4a6fa5" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                  <XAxis dataKey="name" tick={tickStyle} />
                  <YAxis tick={tickStyle} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={tooltipLabelStyle}
                    formatter={(v: number) => [v.toLocaleString("pt-BR"), "Total"]}
                    cursor={{ stroke: "#4a6fa5", strokeWidth: 1, strokeDasharray: "4 4" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="Quantidade"
                    stroke="#4a6fa5"
                    strokeWidth={2.5}
                    fill="url(#areaGradientMain)"
                    dot={{ r: 4, fill: "#4a6fa5", stroke: "#0a0e1a", strokeWidth: 2 }}
                    activeDot={{ r: 7, fill: "#6b8fc5", stroke: "#fff", strokeWidth: 2 }}
                  />
                </AreaChart>
              ) : (
                <BarChart data={chartMonthlyCount} margin={{ top: 20, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                  <XAxis dataKey="name" tick={tickStyle} />
                  <YAxis tick={tickStyle} />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} formatter={(v: number) => [v.toLocaleString("pt-BR"), "Total"]} />
                  <Legend wrapperStyle={legendStyle} />
                  <Bar dataKey="Quantidade" name="Total" fill="#4a6fa5" radius={[4, 4, 0, 0]} barSize={28}>
                    <LabelList dataKey="Quantidade" position="top" style={labelStyle} />
                  </Bar>
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </GlassCard>

        {/* Row 2 — 2 cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="Qtd. por Modal" badge="Por Modal">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartModalCount} margin={chartMargin}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="name" tick={tickStyle} />
                <YAxis tick={tickStyle} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} formatter={(v: number) => v.toLocaleString("pt-BR")} />
                <Legend wrapperStyle={legendStyle} />
                {allModals.map((mod) => (
                  <Bar key={mod} dataKey={mod} fill={MODAL_COLORS[mod] || "#999"} radius={[3, 3, 0, 0]} barSize={16} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Distribuição Regional" badge="Regiões">
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={regionData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={4}
                  strokeWidth={0}
                >
                  {regionData.map((entry, i) => (
                    <Cell key={i} fill={REGION_COLORS[entry.name] || ["#4a6fa5", "#8b9dc3", "#5cb3c8"][i % 3]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} formatter={(v: number) => v.toLocaleString("pt-BR")} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap justify-center gap-4 px-2 pb-2">
              {regionData.map((entry, i) => {
                const total = regionData.reduce((s, e) => s + e.value, 0);
                const pct = total > 0 ? ((entry.value / total) * 100).toFixed(0) : "0";
                return (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: REGION_COLORS[entry.name] || ["#4a6fa5", "#8b9dc3", "#5cb3c8"][i % 3] }}
                    />
                    <span className="text-muted-foreground">{entry.name}</span>
                    <span className="font-semibold text-foreground">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </ChartCard>

          <ChartCard title="Valor Total Mensal" badge="Mensal">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartMonthlyValor} margin={chartMargin}>
                <defs>
                  <linearGradient id="barGradVal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5a7fb5" stopOpacity={1} />
                    <stop offset="100%" stopColor="#3a5f95" stopOpacity={0.8} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="name" tick={tickStyle} />
                <YAxis tick={tickStyle} tickFormatter={(v) => `R$${(v / 1_000_000).toFixed(1)}M`} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} formatter={(v: number) => [formatBRLFull(v), "Valor"]} />
                <Bar dataKey="Valor" fill="url(#barGradVal)" radius={[4, 4, 0, 0]} barSize={24}>
                  <LabelList dataKey="Valor" position="top" formatter={(v: number) => formatCompact(v)} style={labelStyle} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Row 3 — Valor por Modal + Divisão */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="Valor Faturado por Modal" badge="Modal">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartModalValor} margin={chartMargin}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="name" tick={tickStyle} />
                <YAxis tick={tickStyle} tickFormatter={(v) => `R$${(v / 1_000_000).toFixed(1)}M`} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} formatter={(v: number) => formatBRLFull(v)} />
                <Legend wrapperStyle={legendStyle} />
                {allModals.map((mod) => (
                  <Bar key={mod} dataKey={mod} fill={MODAL_COLORS[mod] || "#999"} radius={[3, 3, 0, 0]} barSize={18} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Qtd. por Modal — Último Mês" badge="Último Mês">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={lastMonthModalData} margin={chartMargin}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="name" tick={tickStyle} />
                <YAxis tick={tickStyle} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} formatter={(v: number) => v.toLocaleString("pt-BR")} />
                <Bar dataKey="count" name="Quantidade" radius={[4, 4, 0, 0]} barSize={28}>
                  {lastMonthModalData.map((entry, i) => (
                    <Cell key={i} fill={MODAL_COLORS[entry.name] || "#999"} />
                  ))}
                  <LabelList dataKey="count" position="top" style={labelStyle} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Row 4 — Divisão Modal */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="Qtd. por Divisão Modal" badge="Divisão">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={divisionData} margin={chartMargin}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="name" tick={tickStyle} />
                <YAxis tick={tickStyle} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} formatter={(v: number) => v.toLocaleString("pt-BR")} />
                <Bar dataKey="count" name="Quantidade" fill="#4a6fa5" radius={[4, 4, 0, 0]} barSize={28}>
                  <LabelList dataKey="count" position="top" style={labelStyle} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Valor por Divisão Modal" badge="Divisão">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={divisionData} margin={chartMargin}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="name" tick={tickStyle} />
                <YAxis tick={tickStyle} tickFormatter={(v) => `R$${(v / 1_000_000).toFixed(1)}M`} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} formatter={(v: number) => formatBRLFull(v)} />
                <Bar dataKey="valor" name="Valor" radius={[4, 4, 0, 0]} barSize={28}>
                  <defs>
                    <linearGradient id="barGradDiv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5a7fb5" stopOpacity={1} />
                    <stop offset="100%" stopColor="#3a5f95" stopOpacity={0.7} />
                    </linearGradient>
                  </defs>
                  {divisionData.map((_, i) => (
                    <Cell key={i} fill="url(#barGradDiv)" />
                  ))}
                  <LabelList dataKey="valor" position="top" formatter={(v: number) => formatCompact(v)} style={labelStyle} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </div>
    </PageLayout>
  );
}

/* ── Glass Card wrapper ── */
function GlassCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <Card className={`bg-card border-border ${className}`}>
      {children}
    </Card>
  );
}

/* ── KPI Card with Sparkline ── */
function SparklineKpiCard({ label, value, loading, variation, subtitle, accent, sparkData, sparkColor, sparkType }: {
  label: string; value: string; loading: boolean;
  variation?: number; subtitle?: string; accent?: boolean;
  sparkData: { v: number }[]; sparkColor: string; sparkType: "bar" | "line";
}) {
  const hasVariation = variation !== undefined && variation !== 0;
  const isPositive = (variation ?? 0) >= 0;

  return (
    <GlassCard>
      <div className="p-4 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-medium text-muted-foreground/70 tracking-wide uppercase">{label}</p>
          {!loading && hasVariation && (
            <div className={`flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${isPositive ? "text-emerald-400 bg-emerald-500/10" : "text-red-400 bg-red-500/10"}`}>
              {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {isPositive ? "+" : ""}{variation!.toFixed(1)}%
            </div>
          )}
        </div>
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className={`text-2xl font-bold tracking-tight ${loading ? "animate-pulse text-muted-foreground" : accent ? "text-red-400" : "text-foreground"}`}>
              {loading ? "..." : value}
            </p>
            {!loading && subtitle && (
              <p className="text-[10px] text-muted-foreground/60 truncate mt-0.5 max-w-[140px]">{subtitle}</p>
            )}
          </div>
          {!loading && sparkData.length > 0 && (
            <div className="w-24 h-10 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                {sparkType === "bar" ? (
                  <BarChart data={sparkData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <Bar dataKey="v" fill={sparkColor} radius={[2, 2, 0, 0]} />
                  </BarChart>
                ) : (
                  <LineChart data={sparkData} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                    <Line type="monotone" dataKey="v" stroke={sparkColor} strokeWidth={2} dot={false} />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </GlassCard>
  );
}

/* ── Chart Card ── */
function ChartCard({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
  return (
    <GlassCard>
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {badge && (
          <Badge variant="outline" className="text-[10px] px-2 py-0.5 font-normal text-muted-foreground border-white/10 bg-white/[0.03]">
            {badge}
          </Badge>
        )}
      </div>
      <div className="px-3 pb-4">{children}</div>
    </GlassCard>
  );
}
