import { useState, useEffect, useMemo } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { Building2, RefreshCw } from "lucide-react";
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
  Sudeste: "#1a2744",
  Sul: "#8b9dc3",
};

const MONTH_NAMES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
const MONTH_SHORT = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];

const formatBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);

const formatBRLFull = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

const formatMonthLabel = (d: string) => {
  const [y, m] = d.split("-");
  return `${MONTH_SHORT[parseInt(m) - 1]}/${y}`;
};

const formatMonthFull = (d: string) => {
  const [y, m] = d.split("-");
  return `${MONTH_NAMES[parseInt(m) - 1].charAt(0).toUpperCase() + MONTH_NAMES[parseInt(m) - 1].slice(1)} ${y}`;
};

const formatCompact = (v: number) => {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(2).replace(".", ",")}M`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}k`;
  return formatBRL(v);
};

// Custom label for bars
const renderBarLabel = (props: any, isCurrency = false) => {
  const { x, y, width, value } = props;
  if (!value) return null;
  return (
    <text x={x + width / 2} y={y - 6} fill="#2d3748" fontSize={10} textAnchor="middle" fontWeight={600}>
      {isCurrency ? formatCompact(value) : value?.toLocaleString("pt-BR")}
    </text>
  );
};

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

  // Group by month
  const monthlyData = useMemo(() => {
    const map = new Map<string, { count: number; valor: number; byModal: Record<string, { count: number; valor: number }> }>();
    data.forEach((r) => {
      if (!r.faturado_em) return;
      const mk = r.faturado_em.substring(0, 7);
      if (!map.has(mk)) map.set(mk, { count: 0, valor: 0, byModal: {} });
      const entry = map.get(mk)!;
      entry.count++;
      entry.valor += r.valor_total_faturado || 0;
      const modal = (r.modal || "OUTROS").toUpperCase();
      if (!entry.byModal[modal]) entry.byModal[modal] = { count: 0, valor: 0 };
      entry.byModal[modal].count++;
      entry.byModal[modal].valor += r.valor_total_faturado || 0;
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

  // KPIs from last month
  const kpis = useMemo(() => {
    if (monthlyData.length === 0) return { total: 0, count: 0, variation: 0, topClient: "-", topClientVal: 0, lastMonth: "", prevMonthLabel: "" };
    const last = monthlyData[monthlyData.length - 1];
    const prev = monthlyData.length > 1 ? monthlyData[monthlyData.length - 2] : null;
    const variation = prev && prev.valor > 0 ? ((last.valor - prev.valor) / prev.valor) * 100 : 0;
    const clientMap = new Map<string, number>();
    data.forEach((r) => {
      if (!r.faturado_em || r.faturado_em.substring(0, 7) !== last.month) return;
      const c = r.cliente || "Desconhecido";
      clientMap.set(c, (clientMap.get(c) || 0) + (r.valor_total_faturado || 0));
    });
    let topClient = "-";
    let topClientVal = 0;
    clientMap.forEach((v, k) => { if (v > topClientVal) { topClient = k; topClientVal = v; } });
    const prevMonthLabel = prev ? formatMonthLabel(prev.month).toUpperCase() : "";
    return { total: last.valor, count: last.count, variation, topClient, topClientVal, lastMonth: last.month, prevMonthLabel };
  }, [monthlyData, data]);

  // Region data
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

  // Last month modal data
  const lastMonthModalData = useMemo(() => {
    if (monthlyData.length === 0) return [];
    const last = monthlyData[monthlyData.length - 1];
    return Object.entries(last.byModal)
      .map(([name, v]) => ({ name, count: v.count, valor: v.valor }))
      .sort((a, b) => b.count - a.count);
  }, [monthlyData]);

  // Division data (last month)
  const divisionData = useMemo(() => {
    const lastMonth = monthlyData.length > 0 ? monthlyData[monthlyData.length - 1].month : null;
    const divMap: Record<string, { count: number; valor: number }> = {};
    data.forEach((r) => {
      if (!r.faturado_em || !lastMonth) return;
      if (r.faturado_em.substring(0, 7) !== lastMonth) return;
      const div = r.divisao_por_modal || "Outros";
      if (!divMap[div]) divMap[div] = { count: 0, valor: 0 };
      divMap[div].count++;
      divMap[div].valor += r.valor_total_faturado || 0;
    });
    return Object.entries(divMap).map(([name, v]) => ({ name, ...v }));
  }, [data, monthlyData]);

  // Chart data
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

  const CorpTooltip = ({ active, payload, label, isCurrency }: any) => {
    if (!active || !payload) return null;
    return (
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6, padding: "8px 12px", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
        <p style={{ fontSize: 11, color: "#718096", marginBottom: 4 }}>{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} style={{ fontSize: 12, fontWeight: 600, color: p.color, margin: 0 }}>
            {p.name}: {isCurrency ? formatBRLFull(p.value) : p.value.toLocaleString("pt-BR")}
          </p>
        ))}
      </div>
    );
  };

  const SlicerBadge = ({ label }: { label: string }) => (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", background: "#edf2f7", border: "1px solid #e2e8f0", borderRadius: 4, fontSize: 10, color: "#718096", cursor: "default" }}>
      {label} <span style={{ fontSize: 8 }}>▼</span>
    </div>
  );

  const ChartCard = ({ title, subtitle, slicer, children }: { title: string; subtitle?: string; slicer?: string; children: React.ReactNode }) => (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px 0" }}>
        {subtitle && <p style={{ fontSize: 10, color: "#a0aec0", fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>{subtitle}</p>}
        <h3 style={{ fontSize: 13, fontWeight: 700, color: "#2d3748", margin: 0 }}>{title}</h3>
      </div>
      <div style={{ padding: "8px 8px 4px" }}>{children}</div>
      {slicer && (
        <div style={{ padding: "4px 16px 10px", display: "flex", gap: 6 }}>
          <SlicerBadge label={slicer} />
        </div>
      )}
    </div>
  );

  return (
    <PageLayout title="DACHSER" subtitle="Olimpo — Faturamento" pageIcon={Building2}>
      <div style={{ background: "#f0f2f5", borderRadius: 16, minHeight: "100vh", margin: "-1rem", padding: 0 }}>
        {/* Executive Header */}
        <div style={{ background: "#1a2744", borderRadius: "16px 16px 0 0", padding: "24px 32px 12px" }}>
          <div className="flex items-center justify-between">
            <h1 style={{ color: "#fff", fontSize: 20, fontWeight: 800, letterSpacing: 1.5, margin: 0 }}>
              DASHBOARD GERENCIAL DE FATURAMENTO — {lastMonthFormatted.toUpperCase()}
            </h1>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchData}
              disabled={loading}
              style={{ borderColor: "rgba(255,255,255,0.3)", color: "#fff", background: "transparent" }}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
          <div style={{ background: "#243555", marginTop: 10, padding: "6px 16px", borderRadius: 4, display: "inline-block" }}>
            <p style={{ color: "#a0b4d0", fontSize: 11, margin: 0, fontWeight: 500 }}>
              Período de análise: {firstMonth} – {lastMonthShort} | Base: TOTVS RM
            </p>
          </div>
        </div>

        <div style={{ padding: "20px 24px 32px" }}>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <KpiExecCard header="FATURAMENTO TOTAL" headerColor="#2c5282" value={formatCompact(kpis.total)} subtitle={lastMonthFormatted} />
            <KpiExecCard header="PROCESSOS FATURADOS" headerColor="#2b6cb0" value={kpis.count.toLocaleString("pt-BR")} subtitle={lastMonthFormatted} />
            <KpiExecCard header={`VAR. vs ${kpis.prevMonthLabel || "MÊS ANT."}`} headerColor="#276749" value={`${kpis.variation >= 0 ? "+" : ""}${kpis.variation.toFixed(1)}%`} subtitle="Mês a Mês" />
            <KpiExecCard header="MAIOR CLIENTE" headerColor="#c27803" value={formatCompact(kpis.topClientVal)} subtitle={kpis.topClient} />
          </div>

          {/* Row 1: Charts 1-2 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <ChartCard title="Quantidade de Files — Total Faturado" subtitle="Contagem de PROCESSO" slicer="MÊS DO FATURAMENTO">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartMonthlyCount} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#edf2f7" />
                  <XAxis dataKey="name" tick={{ fill: "#718096", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#718096", fontSize: 10 }} />
                  <Tooltip content={<CorpTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Quantidade" name="Total" fill="#4a6fa5" radius={[3, 3, 0, 0]} maxBarSize={40}>
                    <LabelList dataKey="Quantidade" position="top" style={{ fill: "#2d3748", fontSize: 9, fontWeight: 600 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Quantidade Total Faturada por Modal" subtitle="Contagem de PROCESSO" slicer="MÊS DO FATURAMENTO">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartModalCount} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#edf2f7" />
                  <XAxis dataKey="name" tick={{ fill: "#718096", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#718096", fontSize: 10 }} />
                  <Tooltip content={<CorpTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {allModals.map((mod) => (
                    <Bar key={mod} dataKey={mod} fill={MODAL_COLORS[mod] || "#999"} radius={[3, 3, 0, 0]} maxBarSize={20} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Row 2: Charts 3-4 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <ChartCard title="Valor Total Faturado no RM" subtitle="Soma de VALOR TOTAL FATURADO" slicer="MÊS DO FATURAMENTO">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartMonthlyValor} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#edf2f7" />
                  <XAxis dataKey="name" tick={{ fill: "#718096", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#718096", fontSize: 10 }} tickFormatter={(v) => `R$${(v / 1_000_000).toFixed(1)}M`} />
                  <Tooltip content={<CorpTooltip isCurrency />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Valor" fill="#4a6fa5" radius={[3, 3, 0, 0]} maxBarSize={40}>
                    <LabelList dataKey="Valor" position="top" formatter={(v: number) => formatCompact(v)} style={{ fill: "#2d3748", fontSize: 9, fontWeight: 600 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Valor Total Faturado no RM por Modal" subtitle="Soma de VALOR TOTAL FATURADO" slicer="MÊS DO FATURAMENTO">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartModalValor} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#edf2f7" />
                  <XAxis dataKey="name" tick={{ fill: "#718096", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#718096", fontSize: 10 }} tickFormatter={(v) => `R$${(v / 1_000_000).toFixed(1)}M`} />
                  <Tooltip content={<CorpTooltip isCurrency />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {allModals.map((mod) => (
                    <Bar key={mod} dataKey={mod} fill={MODAL_COLORS[mod] || "#999"} radius={[3, 3, 0, 0]} maxBarSize={20} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Row 3: Charts 5-7 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <ChartCard title="Quantidade Total Faturada por Região" subtitle="Contagem de PROCESSO" slicer="Região">
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={regionData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                    label={({ name, value }) => `${name}: ${value.toLocaleString("pt-BR")}`}
                    labelLine={{ stroke: "#a0aec0" }}
                  >
                    {regionData.map((entry, i) => (
                      <Cell key={i} fill={REGION_COLORS[entry.name] || ["#1a2744", "#8b9dc3", "#4a6fa5"][i % 3]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => v.toLocaleString("pt-BR")} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Quantidade Total Faturada por Modal" subtitle="Contagem de PROCESSO" slicer="MODAL">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={lastMonthModalData} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#edf2f7" />
                  <XAxis dataKey="name" tick={{ fill: "#718096", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#718096", fontSize: 10 }} />
                  <Tooltip content={<CorpTooltip />} />
                  <Bar dataKey="count" name="Quantidade" radius={[3, 3, 0, 0]} maxBarSize={45}>
                    {lastMonthModalData.map((entry, i) => (
                      <Cell key={i} fill={MODAL_COLORS[entry.name] || "#999"} />
                    ))}
                    <LabelList dataKey="count" position="top" style={{ fill: "#2d3748", fontSize: 10, fontWeight: 600 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Valor Total Faturado no RM por Modal" subtitle="Soma de VALOR TOTAL FATURADO" slicer="MODAL">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={lastMonthModalData} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#edf2f7" />
                  <XAxis dataKey="name" tick={{ fill: "#718096", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#718096", fontSize: 10 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<CorpTooltip isCurrency />} />
                  <Bar dataKey="valor" name="Valor" radius={[3, 3, 0, 0]} maxBarSize={45}>
                    {lastMonthModalData.map((entry, i) => (
                      <Cell key={i} fill={MODAL_COLORS[entry.name] || "#999"} />
                    ))}
                    <LabelList dataKey="valor" position="top" formatter={(v: number) => formatCompact(v)} style={{ fill: "#2d3748", fontSize: 9, fontWeight: 600 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Row 4: Charts 8-9 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Quantidade Total Faturada por Divisão Modal" subtitle="Contagem de PROCESSO" slicer="Divisão por Modal">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={divisionData} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#edf2f7" />
                  <XAxis dataKey="name" tick={{ fill: "#718096", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#718096", fontSize: 10 }} />
                  <Tooltip content={<CorpTooltip />} />
                  <Bar dataKey="count" name="Quantidade" fill="#4a6fa5" radius={[3, 3, 0, 0]} maxBarSize={60}>
                    <LabelList dataKey="count" position="top" style={{ fill: "#2d3748", fontSize: 11, fontWeight: 700 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Valor Total Faturado no RM por Divisão Modal" subtitle="Soma de VALOR TOTAL FATURADO" slicer="Divisão por Modal">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={divisionData} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#edf2f7" />
                  <XAxis dataKey="name" tick={{ fill: "#718096", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#718096", fontSize: 10 }} tickFormatter={(v) => `R$${(v / 1_000_000).toFixed(1)}M`} />
                  <Tooltip content={<CorpTooltip isCurrency />} />
                  <Bar dataKey="valor" name="Valor" fill="#2c5282" radius={[3, 3, 0, 0]} maxBarSize={60}>
                    <LabelList dataKey="valor" position="top" formatter={(v: number) => formatCompact(v)} style={{ fill: "#2d3748", fontSize: 10, fontWeight: 700 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

function KpiExecCard({ header, headerColor, value, subtitle }: { header: string; headerColor: string; value: string; subtitle: string }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden", textAlign: "center" }}>
      <div style={{ background: headerColor, padding: "6px 12px" }}>
        <p style={{ color: "#fff", fontSize: 10, fontWeight: 700, letterSpacing: 1, margin: 0, textTransform: "uppercase" }}>{header}</p>
      </div>
      <div style={{ padding: "14px 12px 10px" }}>
        <p style={{ fontSize: 26, fontWeight: 800, color: "#2d3748", margin: 0, lineHeight: 1.2 }}>{value}</p>
        <p style={{ fontSize: 11, color: "#718096", margin: "4px 0 0", fontWeight: 500 }}>{subtitle}</p>
      </div>
    </div>
  );
}
