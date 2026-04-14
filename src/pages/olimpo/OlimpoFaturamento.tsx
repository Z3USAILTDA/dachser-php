import { useState, useEffect, useMemo } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { DollarSign, FileText, TrendingUp, TrendingDown, Users, RefreshCw, Building2, ArrowUpRight, ArrowDownRight, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, LabelList,
  AreaChart, Area, LineChart, Line,
} from "recharts";

// ── Types ──
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

// ── Z3US Color System (from Amazon Trans) ──
const ZEUS_COLORS = {
  amber: "#F2A007",
  amberLight: "#FACC15",
  amberDark: "#D97706",
  success: "#22C55E",
  successDark: "#16A34A",
  blue: "#3B82F6",
  cyan: "#22D3EE",
  teal: "#14B8A6",
  slate: "#64748B",
  danger: "#EF4444",
};

const MODAL_COLORS: Record<string, string> = {
  AI: ZEUS_COLORS.amber,
  SI: ZEUS_COLORS.success,
  TCK: ZEUS_COLORS.blue,
  ASO: ZEUS_COLORS.teal,
  SE: "#EC4899",
  AE: ZEUS_COLORS.cyan,
};

const REGION_COLORS: Record<string, string> = {
  Sudeste: ZEUS_COLORS.amber,
  Sul: ZEUS_COLORS.success,
};

const CHART_PALETTE = [ZEUS_COLORS.amber, ZEUS_COLORS.success, ZEUS_COLORS.blue, ZEUS_COLORS.teal, ZEUS_COLORS.amberDark, ZEUS_COLORS.successDark, ZEUS_COLORS.slate, ZEUS_COLORS.cyan];

// ── Z3US Chart Config (exact Amazon Trans patterns) ──
const TOOLTIP_STYLE = {
  backgroundColor: "hsl(222 41% 6%)",
  border: "1px solid hsl(220 30% 22%)",
  borderRadius: "8px",
  boxShadow: "0 10px 30px -10px rgba(0,0,0,0.5)",
};

const GRID_PROPS = {
  strokeDasharray: "3 3",
  stroke: "rgba(255,255,255,0.06)",
  vertical: false,
  strokeOpacity: 0.25,
};

const AXIS_TICK = { fill: '#94a3b8', fontSize: 11 };
const AXIS_LINE = { stroke: '#334155' };

const MONTH_SHORT = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];

// ── Utilities ──
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
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1).replace(".", ",")}M`;
  if (n >= 1_000) return `R$ ${(n / 1_000).toFixed(0)}K`;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
};

const formatNumber = (v: number) => Math.round(v).toLocaleString("pt-BR");

const formatCurrencyCompact = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `R$ ${(abs / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}M`;
  if (abs >= 1_000) return `R$ ${(abs / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}K`;
  return `R$ ${abs.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
};

// ── Z3US Custom Tooltip (exact Amazon Trans) ──
function Z3usTooltip({ active, payload, label, valueFormatter }: {
  active?: boolean; payload?: any[]; label?: string;
  valueFormatter?: (v: number, name?: string) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div style={{
      background: "hsl(222 41% 5%)",
      border: "1px solid hsl(40 95% 48% / 0.25)",
      borderRadius: "10px",
      boxShadow: "0 10px 30px rgba(0,0,0,0.5), 0 0 20px rgba(242,160,7,0.1)",
      padding: "10px 14px",
      minWidth: "140px",
    }}>
      {label && (
        <p style={{ color: "hsl(210 20% 75%)", fontSize: "11px", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: "8px" }}>
          {label}
        </p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        {payload.map((entry: any, index: number) => {
          const value = entry.value ?? 0;
          const formatted = valueFormatter ? valueFormatter(value, entry.name) : formatNumber(value);
          return (
            <div key={index} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <div style={{ width: "8px", height: "8px", borderRadius: "2px", backgroundColor: entry.color || ZEUS_COLORS.amber }} />
                <span style={{ color: "hsl(210 20% 70%)", fontSize: "12px", fontWeight: 400 }}>{entry.name || entry.dataKey}</span>
              </div>
              <span style={{ color: "hsl(40 95% 55%)", fontSize: "13px", fontWeight: 700 }}>{formatted}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Z3US Pie Tooltip ──
function Z3usPieTooltip({ active, payload, total }: { active?: boolean; payload?: any[]; total?: number }) {
  if (!active || !payload || payload.length === 0) return null;
  const entry = payload[0];
  const value = entry?.value ?? 0;
  const name = entry?.payload?.name || entry?.name || "";
  const percent = total && total > 0 ? ((value / total) * 100).toFixed(1) : "0";
  return (
    <div style={{
      background: "hsl(222 41% 5%)",
      border: "1px solid hsl(40 95% 48% / 0.25)",
      borderRadius: "10px",
      boxShadow: "0 10px 30px rgba(0,0,0,0.5), 0 0 20px rgba(242,160,7,0.1)",
      padding: "12px 16px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
        <div style={{ width: "10px", height: "10px", borderRadius: "2px", backgroundColor: entry?.color || ZEUS_COLORS.amber }} />
        <span style={{ color: "hsl(210 20% 90%)", fontSize: "13px", fontWeight: 600 }}>{name}</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
        <span style={{ color: "hsl(40 95% 55%)", fontSize: "16px", fontWeight: 700 }}>{formatNumber(value)}</span>
        <span style={{ color: "hsl(210 20% 60%)", fontSize: "12px", fontWeight: 500 }}>({percent}%)</span>
      </div>
    </div>
  );
}

// ══════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════
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

  // ── Data processing (unchanged logic) ──
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
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, ...v }));
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
    let topClient = "-"; let topClientVal = 0;
    clientMap.forEach((v, k) => { if (v > topClientVal) { topClient = k; topClientVal = v; } });
    const prevMonthLabel = prev ? formatMonthLabel(prev.month).toUpperCase() : "";
    return { total: last.valor, count: last.count, variation, countVariation, topClient, topClientVal, lastMonth: last.month, prevMonthLabel };
  }, [monthlyData, data]);

  const regionData = useMemo(() => {
    const map = new Map<string, number>();
    const lastMonth = monthlyData.length > 0 ? monthlyData[monthlyData.length - 1].month : null;
    data.forEach((r) => {
      if (!r.faturado_em || !lastMonth || r.faturado_em.substring(0, 7) !== lastMonth) return;
      const reg = r.regiao || "Outros";
      map.set(reg, (map.get(reg) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [data, monthlyData]);

  const lastMonthModalData = useMemo(() => {
    if (monthlyData.length === 0) return [];
    const last = monthlyData[monthlyData.length - 1];
    return Object.entries(last.byModal).map(([name, v]) => ({ name, count: v.count, valor: v.valor })).sort((a, b) => b.count - a.count);
  }, [monthlyData]);

  const divisionData = useMemo(() => {
    const lastMonth = monthlyData.length > 0 ? monthlyData[monthlyData.length - 1].month : null;
    const divMap: Record<string, { count: number; valor: number }> = {};
    data.forEach((r) => {
      if (!r.faturado_em || !lastMonth || r.faturado_em.substring(0, 7) !== lastMonth) return;
      const div = r.divisao_por_modal || "Outros";
      if (!divMap[div]) divMap[div] = { count: 0, valor: 0 };
      divMap[div].count++;
      divMap[div].valor += safeNum(r.valor_total_faturado);
    });
    return Object.entries(divMap).map(([name, v]) => ({ name, ...v }));
  }, [data, monthlyData]);

  const chartMonthlyCount = useMemo(() => monthlyData.map((m) => ({ name: formatMonthLabel(m.month), Quantidade: m.count })), [monthlyData]);
  const chartMonthlyValor = useMemo(() => monthlyData.map((m) => ({ name: formatMonthLabel(m.month), Valor: m.valor })), [monthlyData]);

  const chartModalCount = useMemo(() => monthlyData.map((m) => {
    const row: Record<string, any> = { name: formatMonthLabel(m.month) };
    allModals.forEach((mod) => { row[mod] = m.byModal[mod]?.count || 0; });
    return row;
  }), [monthlyData, allModals]);

  const chartModalValor = useMemo(() => monthlyData.map((m) => {
    const row: Record<string, any> = { name: formatMonthLabel(m.month) };
    allModals.forEach((mod) => { row[mod] = m.byModal[mod]?.valor || 0; });
    return row;
  }), [monthlyData, allModals]);

  const sparklineCount = useMemo(() => monthlyData.slice(-6).map((m) => ({ v: m.count })), [monthlyData]);
  const sparklineValor = useMemo(() => monthlyData.slice(-6).map((m) => ({ v: m.valor })), [monthlyData]);

  const firstMonth = monthlyData.length > 0 ? formatMonthLabel(monthlyData[0].month) : "";
  const lastMonthShort = monthlyData.length > 0 ? formatMonthLabel(monthlyData[monthlyData.length - 1].month) : "";

  const totalRegion = regionData.reduce((s, e) => s + e.value, 0);

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

        {/* ── KPI Cards — exact Amazon Trans KPICardEnhanced ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPICardEnhanced icon={DollarSign} value={formatCompact(kpis.total)} label="Faturamento Total" color={ZEUS_COLORS.amber} loading={loading} sparkData={sparklineValor} sparkType="bar" />
          <KPICardEnhanced icon={FileText} value={kpis.count.toLocaleString("pt-BR")} label="Processos Faturados" color={ZEUS_COLORS.success} loading={loading} sparkData={sparklineCount} sparkType="bar" />
          <KPICardEnhanced icon={kpis.variation >= 0 ? TrendingUp : TrendingDown} value={`${kpis.variation >= 0 ? "+" : ""}${kpis.variation.toFixed(1)}%`} label={`Var. vs ${kpis.prevMonthLabel || "Mês Ant."}`} color={kpis.variation >= 0 ? ZEUS_COLORS.success : ZEUS_COLORS.danger} loading={loading} sparkData={sparklineValor} sparkType="line" />
          <KPICardEnhanced icon={Users} value={formatCompact(kpis.topClientVal)} label="Maior Cliente" color={ZEUS_COLORS.amber} loading={loading} subtitle={kpis.topClient !== "-" ? kpis.topClient : undefined} sparkData={sparklineValor} sparkType="line" />
        </div>

        {/* ── Main Chart — AreaChart ── */}
        <ZeusChartCard title="Quantidade de Files — Total Faturado" subtitle="Evolução mensal de processos faturados">
          <ResponsiveContainer width="100%" height={260}>
            {chartMonthlyCount.length > 2 ? (
              <AreaChart data={chartMonthlyCount} margin={{ top: 25, right: 20, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="areaGradZ3us" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ZEUS_COLORS.amber} stopOpacity={0.3} />
                    <stop offset="50%" stopColor={ZEUS_COLORS.amber} stopOpacity={0.08} />
                    <stop offset="100%" stopColor={ZEUS_COLORS.amber} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="name" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                <YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                <Tooltip content={<Z3usTooltip />} cursor={{ stroke: ZEUS_COLORS.amber, strokeWidth: 1, strokeDasharray: "4 4" }} />
                <Area
                  type="monotone"
                  dataKey="Quantidade"
                  stroke={ZEUS_COLORS.amber}
                  strokeWidth={2.5}
                  fill="url(#areaGradZ3us)"
                  dot={{ r: 4, fill: ZEUS_COLORS.amber, stroke: "#080C16", strokeWidth: 2 }}
                  activeDot={{ r: 7, fill: ZEUS_COLORS.amberLight, stroke: "#fff", strokeWidth: 2 }}
                  style={{ filter: `drop-shadow(0 0 6px ${ZEUS_COLORS.amber}55)` }}
                />
              </AreaChart>
            ) : (
              <BarChart data={chartMonthlyCount} margin={{ top: 25, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="name" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                <YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                <Tooltip content={<Z3usTooltip />} cursor={{ fill: `rgba(242, 160, 7, 0.08)` }} />
                <Bar dataKey="Quantidade" name="Total" fill={ZEUS_COLORS.amber} radius={[4, 4, 0, 0]} barSize={28} style={{ filter: `drop-shadow(0 0 10px ${ZEUS_COLORS.amber}55)` }}>
                  <LabelList dataKey="Quantidade" position="top" fill={ZEUS_COLORS.amber} fontSize={11} fontWeight={600} />
                </Bar>
              </BarChart>
            )}
          </ResponsiveContainer>
        </ZeusChartCard>

        {/* ── Row 2 — 3 cards ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Top 10 Clientes por Frete — Horizontal Bar (like Amazon Trans) */}
          <ZeusChartCard title="Top Clientes por Faturamento" subtitle="Último mês" colSpan={1}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={lastMonthModalData.length > 0 ? (() => {
                const lastMonth = monthlyData.length > 0 ? monthlyData[monthlyData.length - 1].month : null;
                const clientMap = new Map<string, number>();
                data.forEach((r) => {
                  if (!r.faturado_em || !lastMonth || r.faturado_em.substring(0, 7) !== lastMonth) return;
                  const c = r.cliente || "Desconhecido";
                  clientMap.set(c, (clientMap.get(c) || 0) + safeNum(r.valor_total_faturado));
                });
                return Array.from(clientMap.entries())
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 10)
                  .map(([cliente, frete]) => ({ cliente: cliente.length > 14 ? cliente.substring(0, 14) + "…" : cliente, frete }));
              })() : []} layout="vertical" margin={{ top: 5, right: 90, left: 10, bottom: 5 }}>
                <CartesianGrid {...GRID_PROPS} horizontal={false} />
                <XAxis type="number" tick={AXIS_TICK} tickFormatter={(v) => formatCurrencyCompact(v)} tickLine={false} />
                <YAxis type="category" dataKey="cliente" tick={{ fill: '#94a3b8', fontSize: 10 }} width={100} tickLine={false} />
                <Tooltip content={<Z3usTooltip valueFormatter={(v) => formatBRLFull(v)} />} cursor={{ fill: 'rgba(242, 160, 7, 0.08)' }} />
                <Bar dataKey="frete" fill={ZEUS_COLORS.amber} radius={[0, 4, 4, 0]} style={{ filter: `drop-shadow(0 0 8px ${ZEUS_COLORS.amber}55)` }}>
                  <LabelList dataKey="frete" position="right" fill={ZEUS_COLORS.amber} fontSize={10} fontWeight={600} formatter={(v: number) => formatCurrencyCompact(v)} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ZeusChartCard>

          {/* Distribuição Regional — Donut (like Amazon Trans) */}
          <ZeusChartCard title="Distribuição Regional" subtitle="Último mês">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={regionData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={95}
                  paddingAngle={3}
                  strokeWidth={0}
                >
                  {regionData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={REGION_COLORS[entry.name] || CHART_PALETTE[i % CHART_PALETTE.length]}
                      style={{ filter: `drop-shadow(0 0 12px ${REGION_COLORS[entry.name] || CHART_PALETTE[i % CHART_PALETTE.length]}44)` }}
                    />
                  ))}
                </Pie>
                <Tooltip content={<Z3usPieTooltip total={totalRegion} />} />
                <text x="50%" y="46%" textAnchor="middle" fill="#64748b" fontSize={11}>Total</text>
                <text x="50%" y="56%" textAnchor="middle" fill={ZEUS_COLORS.amber} fontSize={18} fontWeight={700}>{formatNumber(totalRegion)}</text>
              </PieChart>
            </ResponsiveContainer>
            {/* Legend with glow dots (Amazon Trans style) */}
            <div className="flex justify-center gap-5 mt-1 pb-2">
              {regionData.map((entry, i) => {
                const color = REGION_COLORS[entry.name] || CHART_PALETTE[i % CHART_PALETTE.length];
                const pct = totalRegion > 0 ? ((entry.value / totalRegion) * 100).toFixed(1) : "0";
                return (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}66` }} />
                    <span className="text-[11px] text-slate-300">{entry.name} ({pct}%)</span>
                  </div>
                );
              })}
            </div>
          </ZeusChartCard>

          {/* Valor Total Mensal — Vertical Bars with glow */}
          <ZeusChartCard title="Valor Total Mensal" subtitle="Evolução mensal">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartMonthlyValor} margin={{ top: 25, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="name" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                <YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} tickFormatter={(v) => formatCurrencyCompact(v)} />
                <Tooltip content={<Z3usTooltip valueFormatter={(v) => formatBRLFull(v)} />} cursor={{ fill: 'rgba(242, 160, 7, 0.08)' }} />
                <Bar dataKey="Valor" fill={ZEUS_COLORS.amber} radius={[4, 4, 0, 0]} barSize={24} style={{ filter: `drop-shadow(0 0 10px ${ZEUS_COLORS.amber}55)` }}>
                  <LabelList dataKey="Valor" position="top" fill={ZEUS_COLORS.amber} fontSize={11} fontWeight={600} formatter={(v: number) => formatCompact(v)} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ZeusChartCard>
        </div>

        {/* ── Row 3 — 3 cards ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Qtd por Modal — Stacked */}
          <ZeusChartCard title="Qtd. por Modal" subtitle="Distribuição por modal">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartModalCount} margin={{ top: 25, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="name" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                <YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                <Tooltip content={<Z3usTooltip />} cursor={{ fill: 'rgba(242, 160, 7, 0.08)' }} />
                <Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />
                {allModals.map((mod) => (
                  <Bar key={mod} dataKey={mod} fill={MODAL_COLORS[mod] || "#64748B"} radius={[3, 3, 0, 0]} barSize={16} style={{ filter: `drop-shadow(0 0 8px ${MODAL_COLORS[mod] || "#64748B"}44)` }} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ZeusChartCard>

          {/* Valor por Modal */}
          <ZeusChartCard title="Valor Faturado por Modal" subtitle="Por modal">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartModalValor} margin={{ top: 25, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="name" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                <YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} tickFormatter={(v) => formatCurrencyCompact(v)} />
                <Tooltip content={<Z3usTooltip valueFormatter={(v) => formatBRLFull(v)} />} cursor={{ fill: 'rgba(242, 160, 7, 0.08)' }} />
                <Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />
                {allModals.map((mod) => (
                  <Bar key={mod} dataKey={mod} fill={MODAL_COLORS[mod] || "#64748B"} radius={[3, 3, 0, 0]} barSize={18} style={{ filter: `drop-shadow(0 0 8px ${MODAL_COLORS[mod] || "#64748B"}44)` }} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ZeusChartCard>

          {/* Qtd por Modal — Último Mês — Horizontal Bar (like "Tipo de Veículo") */}
          <ZeusChartCard title="Qtd. por Modal — Último Mês" subtitle="Último mês">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={lastMonthModalData} layout="vertical" margin={{ top: 5, right: 60, left: 10, bottom: 5 }}>
                <CartesianGrid {...GRID_PROPS} horizontal={false} />
                <XAxis type="number" tick={AXIS_TICK} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} width={60} tickLine={false} />
                <Tooltip content={<Z3usTooltip />} cursor={{ fill: 'rgba(242, 160, 7, 0.08)' }} />
                <Bar dataKey="count" name="Quantidade" radius={[0, 4, 4, 0]}>
                  {lastMonthModalData.map((entry, i) => (
                    <Cell key={i} fill={MODAL_COLORS[entry.name] || CHART_PALETTE[i % CHART_PALETTE.length]} style={{ filter: `drop-shadow(0 0 8px ${MODAL_COLORS[entry.name] || CHART_PALETTE[i % CHART_PALETTE.length]}55)` }} />
                  ))}
                  <LabelList dataKey="count" position="right" fill={ZEUS_COLORS.amber} fontSize={11} fontWeight={700} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ZeusChartCard>
        </div>

        {/* ── Row 4 — 2 cards ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Liberações por Divisão — Vertical Bars (like "Liberações por Destino") */}
          <ZeusChartCard title="Qtd. por Divisão Modal" subtitle="Divisão">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={divisionData} margin={{ top: 25, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="name" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                <YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                <Tooltip content={<Z3usTooltip />} cursor={{ fill: 'rgba(34, 197, 94, 0.08)' }} />
                <Bar dataKey="count" name="Quantidade" fill={ZEUS_COLORS.success} radius={[4, 4, 0, 0]} barSize={40} style={{ filter: `drop-shadow(0 0 10px ${ZEUS_COLORS.success}55)` }}>
                  <LabelList dataKey="count" position="top" fill={ZEUS_COLORS.success} fontSize={11} fontWeight={600} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ZeusChartCard>

          {/* Valor por Divisão — Area (like "Evolução de Custos") */}
          <ZeusChartCard title="Valor por Divisão Modal" subtitle="Divisão">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={divisionData} margin={{ top: 25, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="name" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                <YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} tickFormatter={(v) => formatCurrencyCompact(v)} />
                <Tooltip content={<Z3usTooltip valueFormatter={(v) => formatBRLFull(v)} />} cursor={{ fill: 'rgba(242, 160, 7, 0.08)' }} />
                <Bar dataKey="valor" name="Valor" fill={ZEUS_COLORS.amber} radius={[4, 4, 0, 0]} barSize={40} style={{ filter: `drop-shadow(0 0 10px ${ZEUS_COLORS.amber}55)` }}>
                  <LabelList dataKey="valor" position="top" fill={ZEUS_COLORS.amber} fontSize={11} fontWeight={600} formatter={(v: number) => formatCompact(v)} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ZeusChartCard>
        </div>
      </div>
    </PageLayout>
  );
}

// ══════════════════════════════════════
// Z3US Components (exact Amazon Trans)
// ══════════════════════════════════════

/* ── KPICardEnhanced — exact copy from GestaoFrota.tsx ── */
function KPICardEnhanced({ icon: Icon, value, label, color, loading, subtitle, sparkData, sparkType }: {
  icon: React.ElementType;
  value: string | number;
  label: string;
  color: string;
  loading: boolean;
  subtitle?: string;
  sparkData: { v: number }[];
  sparkType: "bar" | "line";
}) {
  return (
    <div
      className="relative rounded-xl p-4 overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(2, 6, 23, 0.98) 100%)',
        border: '1px solid rgba(148, 163, 184, 0.12)',
        boxShadow: `0 4px 20px -4px ${color}22, 0 0 0 1px ${color}15`,
      }}
    >
      {/* Top color bar */}
      <div
        className="absolute top-0 left-0 right-0 h-1"
        style={{ background: `linear-gradient(90deg, ${color}, ${color}66)` }}
      />
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${color}15`, border: `1px solid ${color}30` }}
        >
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-2xl font-bold ${loading ? "animate-pulse text-slate-500" : "text-white"}`}>
            {loading ? "..." : value}
          </p>
          <p className="text-[11px] text-slate-400">{label}</p>
          {!loading && subtitle && (
            <p className="text-[10px] text-slate-500 truncate max-w-[140px]">{subtitle}</p>
          )}
        </div>
        {/* Sparkline */}
        {!loading && sparkData.length > 0 && (
          <div className="w-20 h-8 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              {sparkType === "bar" ? (
                <BarChart data={sparkData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <Bar dataKey="v" fill={color} radius={[2, 2, 0, 0]} opacity={0.6} />
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
  );
}

/* ── ZeusChartCard — exact Amazon Trans z3us-card style ── */
function ZeusChartCard({ title, subtitle, children, colSpan, minHeight = 200, headerRight }: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  colSpan?: number;
  minHeight?: number;
  headerRight?: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl p-3 flex flex-col ${colSpan === 2 ? "lg:col-span-2" : ""}`}
      style={{
        background: 'linear-gradient(180deg, hsl(220 20% 8%) 0%, hsl(222 45% 4%) 100%)',
        border: '1px solid hsl(220 10% 18% / 0.6)',
        boxShadow: '0 4px 20px -4px rgba(0,0,0,0.4)',
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-xs font-semibold text-foreground/80 uppercase tracking-wide">{title}</h3>
          {subtitle && <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        {headerRight ? headerRight : (
          <button className="h-6 text-[10px] gap-1 text-slate-400 hover:text-white px-2 flex items-center">
            <ChevronDown className="w-3 h-3" />
            Ver detalhes
          </button>
        )}
      </div>
      <div className="flex-1 min-h-0" style={{ minHeight }}>
        {children}
      </div>
    </div>
  );
}
