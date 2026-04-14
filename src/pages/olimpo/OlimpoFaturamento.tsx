import { useState, useEffect, useMemo } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { Card } from "@/components/ui/card";
import { DollarSign, FileText, TrendingUp, TrendingDown, Users, RefreshCw, Building2, ArrowUpRight, ArrowDownRight, BarChart3, PieChartIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  AI: "#F2A007",
  SI: "#22C55E",
  TCK: "#3B82F6",
  ASO: "#8B5CF6",
  SE: "#EC4899",
  AE: "#06B6D4",
};

const REGION_COLORS: Record<string, string> = {
  Sudeste: "#F2A007",
  Sul: "#3B82F6",
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

const formatCompact = (v: any) => {
  const n = safeNum(v);
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(2).replace(".", ",")}M`;
  if (n >= 1_000) return `R$ ${(n / 1_000).toFixed(0)}k`;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
};

/* ── Z3US Design Tokens ── */
const z3usTooltip = {
  backgroundColor: "hsl(222 41% 6%)",
  border: "1px solid hsl(220 30% 22%)",
  borderRadius: 8,
};
const z3usTooltipLabel = { color: "#F2A007", fontSize: 11, fontWeight: 600 };
const z3usGrid = "rgba(255,255,255,0.06)";
const z3usTick = { fill: "#94A3B8", fontSize: 10 };
const z3usLabel = { fill: "#CBD5E1", fontSize: 10, fontWeight: 600, filter: "drop-shadow(0 0 4px rgba(242,160,7,0.3))" };
const z3usLegend = { fontSize: 10, color: "#94A3B8" };
const z3usMargin = { top: 12, right: 12, left: 8, bottom: 5 };

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
      <div className="space-y-5">
        <p className="text-xs text-muted-foreground/70">
          Período: {firstMonth} – {lastMonthShort} · Base: TOTVS RM
        </p>

        {/* ── KPI Cards — Z3US Enhanced ── */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <ZeusKpiCard
            icon={DollarSign}
            label="Faturamento Total"
            value={formatCompact(kpis.total)}
            loading={loading}
            variation={kpis.variation}
            color="#F2A007"
            sparkData={sparklineValor}
            sparkType="bar"
          />
          <ZeusKpiCard
            icon={FileText}
            label="Processos Faturados"
            value={kpis.count.toLocaleString("pt-BR")}
            loading={loading}
            variation={kpis.countVariation}
            color="#22C55E"
            sparkData={sparklineCount}
            sparkType="bar"
          />
          <ZeusKpiCard
            icon={kpis.variation >= 0 ? TrendingUp : TrendingDown}
            label={`Var. vs ${kpis.prevMonthLabel || "Mês Ant."}`}
            value={`${kpis.variation >= 0 ? "+" : ""}${kpis.variation.toFixed(1)}%`}
            loading={loading}
            color={kpis.variation >= 0 ? "#22C55E" : "#EF4444"}
            sparkData={sparklineValor}
            sparkType="line"
          />
          <ZeusKpiCard
            icon={Users}
            label="Maior Cliente"
            value={formatCompact(kpis.topClientVal)}
            loading={loading}
            subtitle={kpis.topClient !== "-" ? kpis.topClient : undefined}
            color="#F2A007"
            sparkData={sparklineValor}
            sparkType="line"
          />
        </div>

        {/* ── Main Chart — Area ── */}
        <ZeusChartCard title="Quantidade de Files — Total Faturado" subtitle="Evolução mensal de processos faturados">
          <ResponsiveContainer width="100%" height={240}>
            {chartMonthlyCount.length > 2 ? (
              <AreaChart data={chartMonthlyCount} margin={{ top: 20, right: 20, left: 10, bottom: 5 }}>
                <defs>
                  <linearGradient id="areaGradZ3us" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#F2A007" stopOpacity={0.3} />
                    <stop offset="50%" stopColor="#F2A007" stopOpacity={0.08} />
                    <stop offset="100%" stopColor="#F2A007" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={z3usGrid} vertical={false} />
                <XAxis dataKey="name" tick={z3usTick} tickLine={false} axisLine={false} />
                <YAxis tick={z3usTick} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={z3usTooltip}
                  labelStyle={z3usTooltipLabel}
                  formatter={(v: number) => [v.toLocaleString("pt-BR"), "Total"]}
                  cursor={{ stroke: "#F2A007", strokeWidth: 1, strokeDasharray: "4 4" }}
                />
                <Area
                  type="monotone"
                  dataKey="Quantidade"
                  stroke="#F2A007"
                  strokeWidth={2.5}
                  fill="url(#areaGradZ3us)"
                  dot={{ r: 4, fill: "#F2A007", stroke: "#080C16", strokeWidth: 2 }}
                  activeDot={{ r: 7, fill: "#F5B843", stroke: "#fff", strokeWidth: 2 }}
                />
              </AreaChart>
            ) : (
              <BarChart data={chartMonthlyCount} margin={{ top: 20, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={z3usGrid} vertical={false} />
                <XAxis dataKey="name" tick={z3usTick} tickLine={false} axisLine={false} />
                <YAxis tick={z3usTick} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={z3usTooltip} labelStyle={z3usTooltipLabel} formatter={(v: number) => [v.toLocaleString("pt-BR"), "Total"]} />
                <Bar dataKey="Quantidade" name="Total" fill="#F2A007" radius={[4, 4, 0, 0]} barSize={28}>
                  <LabelList dataKey="Quantidade" position="top" style={z3usLabel} />
                </Bar>
              </BarChart>
            )}
          </ResponsiveContainer>
        </ZeusChartCard>

        {/* ── Row 2 — 3 cards ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ZeusChartCard title="Qtd. por Modal" subtitle="Distribuição por modal">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartModalCount} margin={z3usMargin}>
                <CartesianGrid strokeDasharray="3 3" stroke={z3usGrid} vertical={false} />
                <XAxis dataKey="name" tick={z3usTick} tickLine={false} axisLine={false} />
                <YAxis tick={z3usTick} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={z3usTooltip} labelStyle={z3usTooltipLabel} formatter={(v: number) => v.toLocaleString("pt-BR")} />
                <Legend wrapperStyle={z3usLegend} />
                {allModals.map((mod) => (
                  <Bar key={mod} dataKey={mod} fill={MODAL_COLORS[mod] || "#64748B"} radius={[3, 3, 0, 0]} barSize={16} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ZeusChartCard>

          <ZeusChartCard title="Distribuição Regional" subtitle="Último mês">
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
                    <Cell key={i} fill={REGION_COLORS[entry.name] || ["#F2A007", "#3B82F6", "#06B6D4"][i % 3]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={z3usTooltip} labelStyle={z3usTooltipLabel} formatter={(v: number) => v.toLocaleString("pt-BR")} />
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
                      style={{ backgroundColor: REGION_COLORS[entry.name] || ["#F2A007", "#3B82F6", "#06B6D4"][i % 3] }}
                    />
                    <span className="text-muted-foreground">{entry.name}</span>
                    <span className="font-semibold text-foreground">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </ZeusChartCard>

          <ZeusChartCard title="Valor Total Mensal" subtitle="Evolução mensal">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartMonthlyValor} margin={z3usMargin}>
                <defs>
                  <linearGradient id="barGradValZ3" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#F2A007" stopOpacity={1} />
                    <stop offset="100%" stopColor="#F2A007" stopOpacity={0.5} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={z3usGrid} vertical={false} />
                <XAxis dataKey="name" tick={z3usTick} tickLine={false} axisLine={false} />
                <YAxis tick={z3usTick} tickLine={false} axisLine={false} tickFormatter={(v) => `R$${(v / 1_000_000).toFixed(1)}M`} />
                <Tooltip contentStyle={z3usTooltip} labelStyle={z3usTooltipLabel} formatter={(v: number) => [formatBRLFull(v), "Valor"]} />
                <Bar dataKey="Valor" fill="url(#barGradValZ3)" radius={[4, 4, 0, 0]} barSize={24}>
                  <LabelList dataKey="Valor" position="top" formatter={(v: number) => formatCompact(v)} style={z3usLabel} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ZeusChartCard>
        </div>

        {/* ── Row 3 — 3 cards ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ZeusChartCard title="Valor Faturado por Modal" subtitle="Por modal">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartModalValor} margin={z3usMargin}>
                <CartesianGrid strokeDasharray="3 3" stroke={z3usGrid} vertical={false} />
                <XAxis dataKey="name" tick={z3usTick} tickLine={false} axisLine={false} />
                <YAxis tick={z3usTick} tickLine={false} axisLine={false} tickFormatter={(v) => `R$${(v / 1_000_000).toFixed(1)}M`} />
                <Tooltip contentStyle={z3usTooltip} labelStyle={z3usTooltipLabel} formatter={(v: number) => formatBRLFull(v)} />
                <Legend wrapperStyle={z3usLegend} />
                {allModals.map((mod) => (
                  <Bar key={mod} dataKey={mod} fill={MODAL_COLORS[mod] || "#64748B"} radius={[3, 3, 0, 0]} barSize={18} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ZeusChartCard>

          <ZeusChartCard title="Qtd. por Modal — Último Mês" subtitle="Último mês">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={lastMonthModalData} margin={z3usMargin}>
                <CartesianGrid strokeDasharray="3 3" stroke={z3usGrid} vertical={false} />
                <XAxis dataKey="name" tick={z3usTick} tickLine={false} axisLine={false} />
                <YAxis tick={z3usTick} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={z3usTooltip} labelStyle={z3usTooltipLabel} formatter={(v: number) => v.toLocaleString("pt-BR")} />
                <Bar dataKey="count" name="Quantidade" radius={[4, 4, 0, 0]} barSize={28}>
                  {lastMonthModalData.map((entry, i) => (
                    <Cell key={i} fill={MODAL_COLORS[entry.name] || "#64748B"} />
                  ))}
                  <LabelList dataKey="count" position="top" style={z3usLabel} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ZeusChartCard>

          <ZeusChartCard title="Qtd. por Divisão Modal" subtitle="Divisão">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={divisionData} margin={z3usMargin}>
                <CartesianGrid strokeDasharray="3 3" stroke={z3usGrid} vertical={false} />
                <XAxis dataKey="name" tick={z3usTick} tickLine={false} axisLine={false} />
                <YAxis tick={z3usTick} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={z3usTooltip} labelStyle={z3usTooltipLabel} formatter={(v: number) => v.toLocaleString("pt-BR")} />
                <Bar dataKey="count" name="Quantidade" fill="#F2A007" radius={[4, 4, 0, 0]} barSize={28}>
                  <LabelList dataKey="count" position="top" style={z3usLabel} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ZeusChartCard>
        </div>

        {/* ── Row 4 ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ZeusChartCard title="Valor por Divisão Modal" subtitle="Divisão">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={divisionData} margin={z3usMargin}>
                <defs>
                  <linearGradient id="barGradDivZ3" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#F2A007" stopOpacity={1} />
                    <stop offset="100%" stopColor="#F2A007" stopOpacity={0.4} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={z3usGrid} vertical={false} />
                <XAxis dataKey="name" tick={z3usTick} tickLine={false} axisLine={false} />
                <YAxis tick={z3usTick} tickLine={false} axisLine={false} tickFormatter={(v) => `R$${(v / 1_000_000).toFixed(1)}M`} />
                <Tooltip contentStyle={z3usTooltip} labelStyle={z3usTooltipLabel} formatter={(v: number) => formatBRLFull(v)} />
                <Bar dataKey="valor" name="Valor" radius={[4, 4, 0, 0]} barSize={28}>
                  {divisionData.map((_, i) => (
                    <Cell key={i} fill="url(#barGradDivZ3)" />
                  ))}
                  <LabelList dataKey="valor" position="top" formatter={(v: number) => formatCompact(v)} style={z3usLabel} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ZeusChartCard>
        </div>
      </div>
    </PageLayout>
  );
}

/* ══════════════════════════════════════════════
   Z3US Design Components
   ══════════════════════════════════════════════ */

/* ── Z3US KPI Card ── */
function ZeusKpiCard({ icon: Icon, label, value, loading, variation, subtitle, color, sparkData, sparkType }: {
  icon: React.ElementType;
  label: string; value: string; loading: boolean;
  variation?: number; subtitle?: string;
  color: string;
  sparkData: { v: number }[]; sparkType: "bar" | "line";
}) {
  const hasVariation = variation !== undefined && variation !== 0;
  const isPositive = (variation ?? 0) >= 0;

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-border/30"
      style={{ background: "linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(2, 6, 23, 0.98))" }}
    >
      {/* Top color bar */}
      <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${color}, ${color}80)` }} />

      <div className="p-4 flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: `${color}18`, border: `1px solid ${color}30` }}
            >
              <Icon className="h-4 w-4" style={{ color }} />
            </div>
            <p className="text-[11px] font-semibold tracking-wider uppercase" style={{ color: "#94A3B8" }}>{label}</p>
          </div>
          {!loading && hasVariation && (
            <div className={`flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${isPositive ? "text-emerald-400 bg-emerald-500/10" : "text-red-400 bg-red-500/10"}`}>
              {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {isPositive ? "+" : ""}{variation!.toFixed(1)}%
            </div>
          )}
        </div>

        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p
              className={`text-2xl font-bold tracking-tight ${loading ? "animate-pulse" : ""}`}
              style={{ color: loading ? "#64748B" : "#F1F5F9", filter: loading ? "none" : `drop-shadow(0 0 8px ${color}40)` }}
            >
              {loading ? "..." : value}
            </p>
            {!loading && subtitle && (
              <p className="text-[10px] truncate mt-0.5 max-w-[140px]" style={{ color: "#64748B" }}>{subtitle}</p>
            )}
          </div>
          {!loading && sparkData.length > 0 && (
            <div className="w-24 h-10 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                {sparkType === "bar" ? (
                  <BarChart data={sparkData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <Bar dataKey="v" fill={color} radius={[2, 2, 0, 0]} opacity={0.7} />
                  </BarChart>
                ) : (
                  <LineChart data={sparkData} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                    <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Z3US Chart Card ── */
function ZeusChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "rgba(8, 12, 22, 0.9)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <div>
          <h3 className="text-xs font-semibold tracking-wide uppercase" style={{ color: "#E2E8F0" }}>{title}</h3>
          {subtitle && <p className="text-[10px] mt-0.5" style={{ color: "#64748B" }}>{subtitle}</p>}
        </div>
        <button className="text-[10px] font-medium px-2.5 py-1 rounded-md transition-colors"
          style={{ color: "#F2A007", background: "rgba(242,160,7,0.08)", border: "1px solid rgba(242,160,7,0.15)" }}
        >
          Ver detalhes
        </button>
      </div>
      <div className="px-3 pb-4">{children}</div>
    </div>
  );
}
