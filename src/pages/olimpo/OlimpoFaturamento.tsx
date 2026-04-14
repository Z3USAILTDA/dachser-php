import { useState, useEffect, useMemo } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, FileText, TrendingUp, Users, RefreshCw, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, LabelList,
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

const formatBRL = (v: any) => {
  const n = safeNum(v);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
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
  return formatBRL(n);
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
    if (monthlyData.length === 0) return { total: 0, count: 0, variation: 0, topClient: "-", topClientVal: 0, lastMonth: "", prevMonthLabel: "" };
    const last = monthlyData[monthlyData.length - 1];
    const prev = monthlyData.length > 1 ? monthlyData[monthlyData.length - 2] : null;
    const variation = prev && prev.valor > 0 ? ((last.valor - prev.valor) / prev.valor) * 100 : 0;
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
    return { total: last.valor, count: last.count, variation, topClient, topClientVal, lastMonth: last.month, prevMonthLabel };
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

  const lastMonthFormatted = kpis.lastMonth ? formatMonthFull(kpis.lastMonth) : "";
  const firstMonth = monthlyData.length > 0 ? formatMonthLabel(monthlyData[0].month) : "";
  const lastMonthShort = monthlyData.length > 0 ? formatMonthLabel(monthlyData[monthlyData.length - 1].month) : "";

  return (
    <PageLayout
      title="DACHSER"
      subtitle="Olimpo — Faturamento"
      pageIcon={Building2}
      backTo="/dashboard"
      rightContent={
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      }
    >
      <div className="space-y-6">
        <p className="text-xs text-muted-foreground">
          Período: {firstMonth} – {lastMonthShort} | Base: TOTVS RM
        </p>

        {/* KPI Cards */}
        <div className="grid gap-6 md:grid-cols-4">
          <KpiCard icon={DollarSign} label="Faturamento Total" value={formatCompact(kpis.total)} loading={loading} />
          <KpiCard icon={FileText} label="Processos Faturados" value={kpis.count.toLocaleString("pt-BR")} loading={loading} />
          <KpiCard icon={TrendingUp} label={`Var. vs ${kpis.prevMonthLabel || "Mês Ant."}`} value={`${kpis.variation >= 0 ? "+" : ""}${kpis.variation.toFixed(1)}%`} loading={loading} accent={kpis.variation < 0} />
          <KpiCard icon={Users} label="Maior Cliente" value={formatCompact(kpis.topClientVal)} loading={loading} />
        </div>

        {/* Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartCard title="Quantidade de Files — Total Faturado" sub="Contagem de PROCESSO">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={chartMonthlyCount} margin={chartMargin}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="name" tick={tickStyle} />
                <YAxis tick={tickStyle} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} formatter={(v: number) => [v.toLocaleString("pt-BR"), "Total"]} />
                <Legend wrapperStyle={legendStyle} />
                <Bar dataKey="Quantidade" name="Total" fill="#4a6fa5" radius={[3, 3, 0, 0]} barSize={28}>
                  <LabelList dataKey="Quantidade" position="top" style={labelStyle} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Quantidade Total Faturada por Modal" sub="Contagem de PROCESSO">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={chartModalCount} margin={chartMargin}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="name" tick={tickStyle} />
                <YAxis tick={tickStyle} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} formatter={(v: number) => v.toLocaleString("pt-BR")} />
                <Legend wrapperStyle={legendStyle} />
                {allModals.map((mod) => (
                  <Bar key={mod} dataKey={mod} fill={MODAL_COLORS[mod] || "#999"} radius={[3, 3, 0, 0]} barSize={20} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartCard title="Valor Total Faturado no RM" sub="Soma de VALOR TOTAL FATURADO">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={chartMonthlyValor} margin={chartMargin}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="name" tick={tickStyle} />
                <YAxis tick={tickStyle} tickFormatter={(v) => `R$${(v / 1_000_000).toFixed(1)}M`} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} formatter={(v: number) => [formatBRLFull(v), "Valor"]} />
                <Legend wrapperStyle={legendStyle} />
                <Bar dataKey="Valor" fill="#4a6fa5" radius={[3, 3, 0, 0]} barSize={28}>
                  <LabelList dataKey="Valor" position="top" formatter={(v: number) => formatCompact(v)} style={labelStyle} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Valor Total Faturado no RM por Modal" sub="Soma de VALOR TOTAL FATURADO">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={chartModalValor} margin={chartMargin}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="name" tick={tickStyle} />
                <YAxis tick={tickStyle} tickFormatter={(v) => `R$${(v / 1_000_000).toFixed(1)}M`} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} formatter={(v: number) => formatBRLFull(v)} />
                <Legend wrapperStyle={legendStyle} />
                {allModals.map((mod) => (
                  <Bar key={mod} dataKey={mod} fill={MODAL_COLORS[mod] || "#999"} radius={[3, 3, 0, 0]} barSize={20} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Row 3 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <ChartCard title="Quantidade por Região" sub="Contagem de PROCESSO">
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie
                  data={regionData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={110}
                  paddingAngle={2}
                  labelLine={false}
                  label={({ name, value, cx, x, y }) => (
                    <text x={x} y={y} fill="#ccc" fontSize={11} textAnchor={x > cx ? "start" : "end"} dominantBaseline="central">
                      {name}: {value.toLocaleString("pt-BR")}
                    </text>
                  )}
                >
                  {regionData.map((entry, i) => (
                    <Cell key={i} fill={REGION_COLORS[entry.name] || ["#4a6fa5", "#8b9dc3", "#5cb3c8"][i % 3]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} formatter={(v: number) => v.toLocaleString("pt-BR")} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Quantidade por Modal" sub="Contagem de PROCESSO">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={lastMonthModalData} margin={chartMargin}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="name" tick={tickStyle} />
                <YAxis tick={tickStyle} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} formatter={(v: number) => v.toLocaleString("pt-BR")} />
                <Bar dataKey="count" name="Quantidade" radius={[3, 3, 0, 0]} barSize={28}>
                  {lastMonthModalData.map((entry, i) => (
                    <Cell key={i} fill={MODAL_COLORS[entry.name] || "#999"} />
                  ))}
                  <LabelList dataKey="count" position="top" style={labelStyle} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Valor por Modal" sub="Soma de VALOR TOTAL FATURADO">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={lastMonthModalData} margin={chartMargin}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="name" tick={tickStyle} />
                <YAxis tick={tickStyle} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} formatter={(v: number) => formatBRLFull(v)} />
                <Bar dataKey="valor" name="Valor" radius={[3, 3, 0, 0]} barSize={28}>
                  {lastMonthModalData.map((entry, i) => (
                    <Cell key={i} fill={MODAL_COLORS[entry.name] || "#999"} />
                  ))}
                  <LabelList dataKey="valor" position="top" formatter={(v: number) => formatCompact(v)} style={labelStyle} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Row 4 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartCard title="Quantidade por Divisão Modal" sub="Contagem de PROCESSO">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={divisionData} margin={chartMargin}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="name" tick={tickStyle} />
                <YAxis tick={tickStyle} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} formatter={(v: number) => v.toLocaleString("pt-BR")} />
                <Bar dataKey="count" name="Quantidade" fill="#4a6fa5" radius={[3, 3, 0, 0]} barSize={28}>
                  <LabelList dataKey="count" position="top" style={labelStyle} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Valor por Divisão Modal" sub="Soma de VALOR TOTAL FATURADO">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={divisionData} margin={chartMargin}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="name" tick={tickStyle} />
                <YAxis tick={tickStyle} tickFormatter={(v) => `R$${(v / 1_000_000).toFixed(1)}M`} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} formatter={(v: number) => formatBRLFull(v)} />
                <Bar dataKey="valor" name="Valor" fill="#2c5282" radius={[3, 3, 0, 0]} barSize={28}>
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

function KpiCard({ icon: Icon, label, value, loading, accent }: {
  icon: any; label: string; value: string; loading: boolean; accent?: boolean;
}) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center border ${accent ? "bg-red-500/10 border-red-500/30 text-red-400" : "bg-primary/10 border-primary/30"}`}>
          <Icon className={`h-5 w-5 ${accent ? "" : "text-primary"}`} />
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

function ChartCard({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        {sub && <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{sub}</p>}
        <CardTitle className="text-sm text-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}
