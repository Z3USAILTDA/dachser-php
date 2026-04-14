import { useState, useEffect, useMemo } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { DollarSign, FileText, TrendingUp, TrendingDown, Users, RefreshCw, Building2, ArrowUpRight, ArrowDownRight, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import ChartDetailPanel, { type ChartColumn } from "@/components/charts/ChartDetailPanel";
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

// ── Z3US Color System ──
const ZEUS_COLORS = {
  amber: "#F2A007", amberLight: "#FACC15", amberDark: "#D97706",
  success: "#22C55E", successDark: "#16A34A",
  blue: "#3B82F6", cyan: "#22D3EE", teal: "#14B8A6",
  slate: "#64748B", danger: "#EF4444",
};

const MODAL_COLORS: Record<string, string> = {
  AI: ZEUS_COLORS.amber, SI: ZEUS_COLORS.success, TCK: ZEUS_COLORS.blue,
  ASO: ZEUS_COLORS.teal, SE: "#EC4899", AE: ZEUS_COLORS.cyan,
};
const REGION_COLORS: Record<string, string> = { Sudeste: ZEUS_COLORS.amber, Sul: ZEUS_COLORS.success };
const CHART_PALETTE = [ZEUS_COLORS.amber, ZEUS_COLORS.success, ZEUS_COLORS.blue, ZEUS_COLORS.teal, ZEUS_COLORS.amberDark, ZEUS_COLORS.successDark, ZEUS_COLORS.slate, ZEUS_COLORS.cyan];

const GRID_PROPS = { strokeDasharray: "3 3", stroke: "rgba(255,255,255,0.06)", vertical: false, strokeOpacity: 0.25 };
const AXIS_TICK = { fill: '#94a3b8', fontSize: 11 };
const AXIS_LINE = { stroke: '#334155' };
const MONTH_SHORT = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];

// ── Utilities ──
const safeNum = (v: any): number => { if (v == null) return 0; const n = typeof v === "string" ? parseFloat(v) : Number(v); return isNaN(n) || !isFinite(n) ? 0 : n; };
const formatBRLFull = (v: any) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(safeNum(v));
const formatMonthLabel = (d: string) => { const [y, m] = d.split("-"); return `${MONTH_SHORT[parseInt(m) - 1]}/${y}`; };
const formatCompact = (v: any) => { const n = safeNum(v); if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1).replace(".", ",")}M`; if (n >= 1_000) return `R$ ${(n / 1_000).toFixed(0)}K`; return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n); };
const formatNumber = (v: number) => Math.round(v).toLocaleString("pt-BR");
const formatCurrencyCompact = (v: number) => { const abs = Math.abs(v); if (abs >= 1_000_000) return `R$ ${(abs / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}M`; if (abs >= 1_000) return `R$ ${(abs / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}K`; return `R$ ${abs.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`; };

// ── Z3US Tooltips ──
function Z3usTooltip({ active, payload, label, valueFormatter }: { active?: boolean; payload?: any[]; label?: string; valueFormatter?: (v: number, name?: string) => string; }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div style={{ background: "hsl(222 41% 5%)", border: "1px solid hsl(40 95% 48% / 0.25)", borderRadius: "10px", boxShadow: "0 10px 30px rgba(0,0,0,0.5), 0 0 20px rgba(242,160,7,0.1)", padding: "10px 14px", minWidth: "140px" }}>
      {label && <p style={{ color: "hsl(210 20% 75%)", fontSize: "11px", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: "8px" }}>{label}</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        {payload.map((entry: any, index: number) => (
          <div key={index} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "2px", backgroundColor: entry.color || ZEUS_COLORS.amber }} />
              <span style={{ color: "hsl(210 20% 70%)", fontSize: "12px" }}>{entry.name || entry.dataKey}</span>
            </div>
            <span style={{ color: "hsl(40 95% 55%)", fontSize: "13px", fontWeight: 700 }}>{valueFormatter ? valueFormatter(entry.value ?? 0, entry.name) : formatNumber(entry.value ?? 0)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Z3usPieTooltip({ active, payload, total }: { active?: boolean; payload?: any[]; total?: number }) {
  if (!active || !payload || payload.length === 0) return null;
  const entry = payload[0]; const value = entry?.value ?? 0; const name = entry?.payload?.name || entry?.name || "";
  const percent = total && total > 0 ? ((value / total) * 100).toFixed(1) : "0";
  return (
    <div style={{ background: "hsl(222 41% 5%)", border: "1px solid hsl(40 95% 48% / 0.25)", borderRadius: "10px", boxShadow: "0 10px 30px rgba(0,0,0,0.5), 0 0 20px rgba(242,160,7,0.1)", padding: "12px 16px" }}>
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

// ── Column definitions for detail panels ──
const COL_CLIENTES: ChartColumn[] = [
  { key: "cliente", label: "Cliente", type: "text" },
  { key: "frete", label: "Valor Faturado", type: "currency" },
];
const COL_REGIAO: ChartColumn[] = [
  { key: "name", label: "Região", type: "text" },
  { key: "value", label: "Quantidade", type: "number" },
];
const COL_MENSAL: ChartColumn[] = [
  { key: "name", label: "Mês", type: "text" },
  { key: "Valor", label: "Valor", type: "currency" },
];
const COL_MENSAL_QTD: ChartColumn[] = [
  { key: "name", label: "Mês", type: "text" },
  { key: "Quantidade", label: "Quantidade", type: "number" },
];
const COL_MODAL_LAST: ChartColumn[] = [
  { key: "name", label: "Modal", type: "text" },
  { key: "count", label: "Quantidade", type: "number" },
  { key: "valor", label: "Valor", type: "currency" },
];
const COL_DIVISAO: ChartColumn[] = [
  { key: "name", label: "Divisão", type: "text" },
  { key: "count", label: "Quantidade", type: "number" },
  { key: "valor", label: "Valor", type: "currency" },
];

// ══════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════
export default function OlimpoFaturamento() {
  const [data, setData] = useState<FaturamentoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedChart, setExpandedChart] = useState<string | null>(null);
  const { toast } = useToast();

  const toggleChart = (id: string) => setExpandedChart((prev) => (prev === id ? null : id));

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("mariadb-proxy", { body: { action: "get_faturamento_dashboard" } });
      if (error) throw error;
      setData(res?.data || []);
    } catch (e: any) {
      console.error(e);
      toast({ title: "Erro ao carregar dados", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
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
      entry.count++; entry.valor += safeNum(r.valor_total_faturado);
      const modal = (r.modal || "OUTROS").toUpperCase();
      if (!entry.byModal[modal]) entry.byModal[modal] = { count: 0, valor: 0 };
      entry.byModal[modal].count++; entry.byModal[modal].valor += safeNum(r.valor_total_faturado);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, ...v }));
  }, [data]);

  const allModals = useMemo(() => { const s = new Set<string>(); monthlyData.forEach((m) => Object.keys(m.byModal).forEach((k) => s.add(k))); return Array.from(s).sort(); }, [monthlyData]);

  const kpis = useMemo(() => {
    if (monthlyData.length === 0) return { total: 0, count: 0, variation: 0, countVariation: 0, topClient: "-", topClientVal: 0, lastMonth: "", prevMonthLabel: "" };
    const last = monthlyData[monthlyData.length - 1]; const prev = monthlyData.length > 1 ? monthlyData[monthlyData.length - 2] : null;
    const variation = prev && prev.valor > 0 ? ((last.valor - prev.valor) / prev.valor) * 100 : 0;
    const countVariation = prev && prev.count > 0 ? ((last.count - prev.count) / prev.count) * 100 : 0;
    const clientMap = new Map<string, number>();
    data.forEach((r) => { if (!r.faturado_em || r.faturado_em.substring(0, 7) !== last.month) return; const c = r.cliente || "Desconhecido"; clientMap.set(c, (clientMap.get(c) || 0) + safeNum(r.valor_total_faturado)); });
    let topClient = "-"; let topClientVal = 0;
    clientMap.forEach((v, k) => { if (v > topClientVal) { topClient = k; topClientVal = v; } });
    return { total: last.valor, count: last.count, variation, countVariation, topClient, topClientVal, lastMonth: last.month, prevMonthLabel: prev ? formatMonthLabel(prev.month).toUpperCase() : "" };
  }, [monthlyData, data]);

  const regionData = useMemo(() => {
    const map = new Map<string, number>(); const lastMonth = monthlyData.length > 0 ? monthlyData[monthlyData.length - 1].month : null;
    data.forEach((r) => { if (!r.faturado_em || !lastMonth || r.faturado_em.substring(0, 7) !== lastMonth) return; const reg = r.regiao || "Outros"; map.set(reg, (map.get(reg) || 0) + 1); });
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
    data.forEach((r) => { if (!r.faturado_em || !lastMonth || r.faturado_em.substring(0, 7) !== lastMonth) return; const div = r.divisao_por_modal || "Outros"; if (!divMap[div]) divMap[div] = { count: 0, valor: 0 }; divMap[div].count++; divMap[div].valor += safeNum(r.valor_total_faturado); });
    return Object.entries(divMap).map(([name, v]) => ({ name, ...v }));
  }, [data, monthlyData]);

  const topClientesData = useMemo(() => {
    const lastMonth = monthlyData.length > 0 ? monthlyData[monthlyData.length - 1].month : null;
    if (!lastMonth) return [];
    const clientMap = new Map<string, number>();
    data.forEach((r) => { if (!r.faturado_em || r.faturado_em.substring(0, 7) !== lastMonth) return; const c = r.cliente || "Desconhecido"; clientMap.set(c, (clientMap.get(c) || 0) + safeNum(r.valor_total_faturado)); });
    return Array.from(clientMap.entries()).sort(([, a], [, b]) => b - a).slice(0, 10).map(([cliente, frete]) => ({ cliente, clienteShort: cliente.length > 14 ? cliente.substring(0, 14) + "…" : cliente, frete }));
  }, [data, monthlyData]);

  const chartMonthlyCount = useMemo(() => monthlyData.map((m) => ({ name: formatMonthLabel(m.month), Quantidade: m.count })), [monthlyData]);
  const chartMonthlyValor = useMemo(() => monthlyData.map((m) => ({ name: formatMonthLabel(m.month), Valor: m.valor })), [monthlyData]);
  const chartModalCount = useMemo(() => monthlyData.map((m) => { const row: Record<string, any> = { name: formatMonthLabel(m.month) }; allModals.forEach((mod) => { row[mod] = m.byModal[mod]?.count || 0; }); return row; }), [monthlyData, allModals]);
  const chartModalValor = useMemo(() => monthlyData.map((m) => { const row: Record<string, any> = { name: formatMonthLabel(m.month) }; allModals.forEach((mod) => { row[mod] = m.byModal[mod]?.valor || 0; }); return row; }), [monthlyData, allModals]);
  const sparklineCount = useMemo(() => monthlyData.slice(-6).map((m) => ({ v: m.count })), [monthlyData]);
  const sparklineValor = useMemo(() => monthlyData.slice(-6).map((m) => ({ v: m.valor })), [monthlyData]);

  const firstMonth = monthlyData.length > 0 ? formatMonthLabel(monthlyData[0].month) : "";
  const lastMonthShort = monthlyData.length > 0 ? formatMonthLabel(monthlyData[monthlyData.length - 1].month) : "";
  const totalRegion = regionData.reduce((s, e) => s + e.value, 0);

  // ── Expand Button (Amazon Trans style) ──
  const ExpandButton = ({ chartId }: { chartId: string }) => (
    <button
      className="h-6 text-[10px] gap-1 text-slate-400 hover:text-white px-2 flex items-center transition-colors"
      onClick={(e) => { e.stopPropagation(); toggleChart(chartId); }}
    >
      {expandedChart === chartId ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      {expandedChart === chartId ? "Fechar" : "Ver detalhes"}
    </button>
  );

  return (
    <PageLayout title="DACHSER" subtitle="Faturamento" pageIcon={DollarSign} backTo="/dashboard"
      rightContent={
        <div className="flex items-center gap-2">
          <div className="h-8 px-3 flex items-center rounded-md bg-card border border-border text-xs text-muted-foreground">
            Período: {firstMonth} – {lastMonthShort} · Base: TOTVS RM
          </div>
          <Button size="sm" onClick={fetchData} disabled={loading}
            className="h-8 border-border bg-card text-muted-foreground hover:text-foreground text-xs">
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </div>
      }
    >
      <div className="space-y-5">

        {/* KPI Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <KpiCard icon={DollarSign} label="Faturamento Total" value={formatCompact(kpis.total)} loading={loading} />
          <KpiCard icon={FileText} label="Processos Faturados" value={kpis.count.toLocaleString("pt-BR")} loading={loading} />
          <KpiCard icon={kpis.variation >= 0 ? TrendingUp : TrendingDown} label={`Var. vs ${kpis.prevMonthLabel || "Mês Ant."}`} value={`${kpis.variation >= 0 ? "+" : ""}${kpis.variation.toFixed(1)}%`} loading={loading} accent={kpis.variation < 0} />
          <KpiCard icon={Users} label="Maior Cliente" value={formatCompact(kpis.topClientVal)} loading={loading} subtitle={kpis.topClient !== "-" ? kpis.topClient : undefined} />
        </div>

        {/* Row 1 — 3 charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div>
            <ZeusChartCard title="Qtd. Files — Total Faturado" subtitle="Evolução mensal" headerRight={<ExpandButton chartId="evolucao" />}>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={chartMonthlyCount} margin={{ top: 25, right: 20, left: 0, bottom: 5 }}>
                  <defs><linearGradient id="areaGradZ3us" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={ZEUS_COLORS.amber} stopOpacity={0.3} /><stop offset="50%" stopColor={ZEUS_COLORS.amber} stopOpacity={0.08} /><stop offset="100%" stopColor={ZEUS_COLORS.amber} stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="name" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                  <YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                  <Tooltip content={<Z3usTooltip />} cursor={{ stroke: ZEUS_COLORS.amber, strokeWidth: 1, strokeDasharray: "4 4" }} />
                  <Area type="monotone" dataKey="Quantidade" stroke={ZEUS_COLORS.amber} strokeWidth={2.5} fill="url(#areaGradZ3us)" dot={{ r: 4, fill: ZEUS_COLORS.amber, stroke: "#080C16", strokeWidth: 2 }} activeDot={{ r: 7, fill: ZEUS_COLORS.amberLight, stroke: "#fff", strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </ZeusChartCard>
            <ChartDetailPanel isOpen={expandedChart === "evolucao"} onClose={() => setExpandedChart(null)} title="Evolução Mensal" columns={COL_MENSAL_QTD} data={chartMonthlyCount} exportName="evolucao_mensal" accentColor={ZEUS_COLORS.amber} />
          </div>

          <div>
            <ZeusChartCard title="Top Clientes por Faturamento" subtitle="Último mês" headerRight={<ExpandButton chartId="top-clientes" />}>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={topClientesData.map(d => ({ ...d, cliente: d.clienteShort }))} layout="vertical" margin={{ top: 5, right: 90, left: 10, bottom: 5 }}>
                  <CartesianGrid {...GRID_PROPS} horizontal={false} />
                  <XAxis type="number" tick={AXIS_TICK} tickFormatter={(v) => formatCurrencyCompact(v)} tickLine={false} />
                  <YAxis type="category" dataKey="cliente" tick={{ fill: '#94a3b8', fontSize: 10 }} width={100} tickLine={false} />
                  <Tooltip content={<Z3usTooltip valueFormatter={(v) => formatBRLFull(v)} />} cursor={{ fill: 'rgba(242, 160, 7, 0.08)' }} />
                  <Bar dataKey="frete" fill={ZEUS_COLORS.amber} radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="frete" position="right" fill={ZEUS_COLORS.amber} fontSize={10} fontWeight={600} formatter={(v: number) => formatCurrencyCompact(v)} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ZeusChartCard>
            <ChartDetailPanel isOpen={expandedChart === "top-clientes"} onClose={() => setExpandedChart(null)} title="Top Clientes por Faturamento" columns={COL_CLIENTES} data={topClientesData} exportName="top_clientes" accentColor={ZEUS_COLORS.amber} />
          </div>

          <div>
            <ZeusChartCard title="Distribuição Regional" subtitle="Último mês" headerRight={<ExpandButton chartId="regiao" />}>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={regionData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={95} paddingAngle={3} strokeWidth={0}>
                    {regionData.map((entry, i) => (<Cell key={i} fill={REGION_COLORS[entry.name] || CHART_PALETTE[i % CHART_PALETTE.length]} />))}
                  </Pie>
                  <Tooltip content={<Z3usPieTooltip total={totalRegion} />} />
                  <text x="50%" y="46%" textAnchor="middle" fill="#64748b" fontSize={11}>Total</text>
                  <text x="50%" y="56%" textAnchor="middle" fill={ZEUS_COLORS.amber} fontSize={18} fontWeight={700}>{formatNumber(totalRegion)}</text>
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-5 mt-1 pb-2">
                {regionData.map((entry, i) => {
                  const color = REGION_COLORS[entry.name] || CHART_PALETTE[i % CHART_PALETTE.length];
                  const pct = totalRegion > 0 ? ((entry.value / totalRegion) * 100).toFixed(1) : "0";
                  return (<div key={i} className="flex items-center gap-2"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} /><span className="text-[11px] text-slate-300">{entry.name} ({pct}%)</span></div>);
                })}
              </div>
            </ZeusChartCard>
            <ChartDetailPanel isOpen={expandedChart === "regiao"} onClose={() => setExpandedChart(null)} title="Distribuição Regional" columns={COL_REGIAO} data={regionData} exportName="regiao" accentColor={ZEUS_COLORS.success} />
          </div>
        </div>

        {/* Row 2 — 3 charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div>
            <ZeusChartCard title="Valor Total Mensal" subtitle="Evolução mensal" headerRight={<ExpandButton chartId="valor-mensal" />}>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={chartMonthlyValor} margin={{ top: 25, right: 10, left: 0, bottom: 5 }}>
                  <defs><linearGradient id="areaGradValorMensal" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={ZEUS_COLORS.amber} stopOpacity={0.3} /><stop offset="50%" stopColor={ZEUS_COLORS.amber} stopOpacity={0.08} /><stop offset="100%" stopColor={ZEUS_COLORS.amber} stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid {...GRID_PROPS} /><XAxis dataKey="name" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} /><YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} tickFormatter={(v) => formatCurrencyCompact(v)} />
                  <Tooltip content={<Z3usTooltip valueFormatter={(v) => formatBRLFull(v)} />} cursor={{ stroke: ZEUS_COLORS.amber, strokeWidth: 1, strokeDasharray: "4 4" }} />
                  <Area type="monotone" dataKey="Valor" stroke={ZEUS_COLORS.amber} strokeWidth={2.5} fill="url(#areaGradValorMensal)" dot={{ r: 4, fill: ZEUS_COLORS.amber, stroke: "#080C16", strokeWidth: 2 }} activeDot={{ r: 7, fill: ZEUS_COLORS.amberLight, stroke: "#fff", strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </ZeusChartCard>
            <ChartDetailPanel isOpen={expandedChart === "valor-mensal"} onClose={() => setExpandedChart(null)} title="Valor Total Mensal" columns={COL_MENSAL} data={chartMonthlyValor} exportName="valor_mensal" accentColor={ZEUS_COLORS.amber} />
          </div>

          <div>
            <ZeusChartCard title="Qtd. por Modal" subtitle="Distribuição por modal" headerRight={<ExpandButton chartId="qtd-modal" />}>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartModalCount} margin={{ top: 25, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid {...GRID_PROPS} /><XAxis dataKey="name" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} /><YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                  <Tooltip content={<Z3usTooltip />} cursor={{ fill: 'rgba(242, 160, 7, 0.08)' }} /><Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />
                  {allModals.map((mod) => (<Bar key={mod} dataKey={mod} fill={MODAL_COLORS[mod] || "#64748B"} radius={[3, 3, 0, 0]} barSize={16} />))}
                </BarChart>
              </ResponsiveContainer>
            </ZeusChartCard>
            <ChartDetailPanel isOpen={expandedChart === "qtd-modal"} onClose={() => setExpandedChart(null)} title="Qtd. por Modal (Mensal)" columns={[{ key: "name", label: "Mês", type: "text" }, ...allModals.map(m => ({ key: m, label: m, type: "number" as const }))]} data={chartModalCount} exportName="qtd_modal" accentColor={ZEUS_COLORS.blue} />
          </div>

          <div>
            <ZeusChartCard title="Valor Faturado por Modal" subtitle="Por modal" headerRight={<ExpandButton chartId="valor-modal" />}>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartModalValor} margin={{ top: 25, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid {...GRID_PROPS} /><XAxis dataKey="name" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} /><YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} tickFormatter={(v) => formatCurrencyCompact(v)} />
                  <Tooltip content={<Z3usTooltip valueFormatter={(v) => formatBRLFull(v)} />} cursor={{ fill: 'rgba(242, 160, 7, 0.08)' }} /><Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />
                  {allModals.map((mod) => (<Bar key={mod} dataKey={mod} fill={MODAL_COLORS[mod] || "#64748B"} radius={[3, 3, 0, 0]} barSize={18} />))}
                </BarChart>
              </ResponsiveContainer>
            </ZeusChartCard>
            <ChartDetailPanel isOpen={expandedChart === "valor-modal"} onClose={() => setExpandedChart(null)} title="Valor por Modal (Mensal)" columns={[{ key: "name", label: "Mês", type: "text" }, ...allModals.map(m => ({ key: m, label: m, type: "currency" as const }))]} data={chartModalValor} exportName="valor_modal" accentColor={ZEUS_COLORS.amber} />
          </div>
        </div>

        {/* Row 3 — 3 charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div>
            <ZeusChartCard title="Qtd. por Modal — Último Mês" subtitle="Último mês" headerRight={<ExpandButton chartId="modal-ultimo" />}>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={lastMonthModalData} layout="vertical" margin={{ top: 5, right: 60, left: 10, bottom: 5 }}>
                  <CartesianGrid {...GRID_PROPS} horizontal={false} /><XAxis type="number" tick={AXIS_TICK} tickLine={false} /><YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} width={60} tickLine={false} />
                  <Tooltip content={<Z3usTooltip />} cursor={{ fill: 'rgba(242, 160, 7, 0.08)' }} />
                  <Bar dataKey="count" name="Quantidade" radius={[0, 4, 4, 0]}>
                    {lastMonthModalData.map((entry, i) => (<Cell key={i} fill={MODAL_COLORS[entry.name] || CHART_PALETTE[i % CHART_PALETTE.length]} />))}
                    <LabelList dataKey="count" position="right" fill={ZEUS_COLORS.amber} fontSize={11} fontWeight={700} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ZeusChartCard>
            <ChartDetailPanel isOpen={expandedChart === "modal-ultimo"} onClose={() => setExpandedChart(null)} title="Modal — Último Mês" columns={COL_MODAL_LAST} data={lastMonthModalData} exportName="modal_ultimo_mes" accentColor={ZEUS_COLORS.teal} />
          </div>

          <div>
            <ZeusChartCard title="Qtd. por Divisão Modal" subtitle="Divisão" headerRight={<ExpandButton chartId="div-qtd" />}>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={divisionData} margin={{ top: 25, right: 20, left: 0, bottom: 5 }}>
                  <defs><linearGradient id="areaGradDivQtd" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={ZEUS_COLORS.success} stopOpacity={0.3} /><stop offset="50%" stopColor={ZEUS_COLORS.success} stopOpacity={0.08} /><stop offset="100%" stopColor={ZEUS_COLORS.success} stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid {...GRID_PROPS} /><XAxis dataKey="name" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} /><YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                  <Tooltip content={<Z3usTooltip />} cursor={{ stroke: ZEUS_COLORS.success, strokeWidth: 1, strokeDasharray: "4 4" }} />
                  <Area type="monotone" dataKey="count" name="Quantidade" stroke={ZEUS_COLORS.success} strokeWidth={2.5} fill="url(#areaGradDivQtd)" dot={{ r: 4, fill: ZEUS_COLORS.success, stroke: "#080C16", strokeWidth: 2 }} activeDot={{ r: 7, fill: ZEUS_COLORS.success, stroke: "#fff", strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </ZeusChartCard>
            <ChartDetailPanel isOpen={expandedChart === "div-qtd"} onClose={() => setExpandedChart(null)} title="Divisão Modal — Quantidade" columns={COL_DIVISAO} data={divisionData} exportName="divisao_qtd" accentColor={ZEUS_COLORS.success} />
          </div>

          <div>
            <ZeusChartCard title="Valor por Divisão Modal" subtitle="Divisão" headerRight={<ExpandButton chartId="div-valor" />}>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={divisionData} margin={{ top: 25, right: 20, left: 0, bottom: 5 }}>
                  <defs><linearGradient id="areaGradDivValor" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={ZEUS_COLORS.amber} stopOpacity={0.3} /><stop offset="50%" stopColor={ZEUS_COLORS.amber} stopOpacity={0.08} /><stop offset="100%" stopColor={ZEUS_COLORS.amber} stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid {...GRID_PROPS} /><XAxis dataKey="name" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} /><YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} tickFormatter={(v) => formatCurrencyCompact(v)} />
                  <Tooltip content={<Z3usTooltip valueFormatter={(v) => formatBRLFull(v)} />} cursor={{ stroke: ZEUS_COLORS.amber, strokeWidth: 1, strokeDasharray: "4 4" }} />
                  <Area type="monotone" dataKey="valor" name="Valor" stroke={ZEUS_COLORS.amber} strokeWidth={2.5} fill="url(#areaGradDivValor)" dot={{ r: 4, fill: ZEUS_COLORS.amber, stroke: "#080C16", strokeWidth: 2 }} activeDot={{ r: 7, fill: ZEUS_COLORS.amberLight, stroke: "#fff", strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </ZeusChartCard>
            <ChartDetailPanel isOpen={expandedChart === "div-valor"} onClose={() => setExpandedChart(null)} title="Divisão Modal — Valor" columns={COL_DIVISAO} data={divisionData} exportName="divisao_valor" accentColor={ZEUS_COLORS.amber} />
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

// ══════════════════════════════════════
// Z3US Components
// ══════════════════════════════════════

function KpiCard({ icon: Icon, label, value, loading, accent, subtitle }: {
  icon: any; label: string; value: string; loading: boolean; accent?: boolean; subtitle?: string;
}) {
  return (
    <Card className="bg-card border-border h-full">
      <CardContent className="p-4 flex items-center gap-3 h-full">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${accent ? "bg-red-500/10 border border-red-500/30" : "bg-primary/10 border border-primary/30"}`}>
          <Icon className={`h-5 w-5 ${accent ? "text-red-400" : "text-primary"}`} />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className={`text-lg font-bold ${loading ? "animate-pulse text-muted-foreground" : accent ? "text-red-400" : "text-foreground"}`}>
            {loading ? "..." : value}
          </p>
          <p className="text-[10px] text-muted-foreground truncate max-w-[160px] min-h-[14px]">
            {!loading && subtitle ? subtitle : "\u00A0"}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function ZeusChartCard({ title, subtitle, children, colSpan, minHeight = 200, headerRight }: {
  title: string; subtitle?: string; children: React.ReactNode; colSpan?: number; minHeight?: number; headerRight?: React.ReactNode;
}) {
  return (
    <Card className={`bg-card border-border h-full ${colSpan === 2 ? "lg:col-span-2" : ""}`}>
      <CardContent className="p-3 flex flex-col h-full">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-xs font-semibold text-foreground/80 uppercase tracking-wide">{title}</h3>
            {subtitle && <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          {headerRight}
        </div>
        <div className="flex-1 min-h-0" style={{ minHeight }}>{children}</div>
      </CardContent>
    </Card>
  );
}
