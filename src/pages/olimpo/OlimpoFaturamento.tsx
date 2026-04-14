import { useState, useEffect, useMemo } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { Building2, RefreshCw, TrendingUp, TrendingDown, FileText, DollarSign, Users, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
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
  AI: "#3b82f6",
  SI: "#f59e0b",
  TCK: "#8b5cf6",
  ASO: "#10b981",
  SE: "#ec4899",
  AE: "#06b6d4",
};

const REGION_COLORS = ["#ffc800", "#3b82f6", "#10b981", "#ec4899", "#8b5cf6"];

const formatBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);

const formatMonthLabel = (d: string) => {
  const [y, m] = d.split("-");
  const months = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  return `${months[parseInt(m) - 1]}/${y}`;
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

  // Group by month key "YYYY-MM"
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

  // All modals present
  const allModals = useMemo(() => {
    const s = new Set<string>();
    monthlyData.forEach((m) => Object.keys(m.byModal).forEach((k) => s.add(k)));
    return Array.from(s).sort();
  }, [monthlyData]);

  // KPIs
  const kpis = useMemo(() => {
    if (monthlyData.length === 0) return { total: 0, count: 0, variation: 0, topClient: "-", topClientVal: 0 };
    const last = monthlyData[monthlyData.length - 1];
    const prev = monthlyData.length > 1 ? monthlyData[monthlyData.length - 2] : null;
    const variation = prev && prev.valor > 0 ? ((last.valor - prev.valor) / prev.valor) * 100 : 0;
    // Top client
    const clientMap = new Map<string, number>();
    data.forEach((r) => {
      if (!r.faturado_em || r.faturado_em.substring(0, 7) !== last.month) return;
      const c = r.cliente || "Desconhecido";
      clientMap.set(c, (clientMap.get(c) || 0) + (r.valor_total_faturado || 0));
    });
    let topClient = "-";
    let topClientVal = 0;
    clientMap.forEach((v, k) => { if (v > topClientVal) { topClient = k; topClientVal = v; } });
    return { total: last.valor, count: last.count, variation, topClient, topClientVal };
  }, [monthlyData, data]);

  // Region data
  const regionData = useMemo(() => {
    const map = new Map<string, number>();
    data.forEach((r) => {
      const reg = r.regiao || "Outros";
      map.set(reg, (map.get(reg) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [data]);

  // Division data
  const divisionData = useMemo(() => {
    const map = new Map<string, { count: number; valor: number }>();
    data.forEach((r) => {
      const div = r.divisao_por_modal || "Outros";
      if (!map.has(div)) map.set(div, { count: 0, valor: 0 });
      const e = map.get(div)!;
      e.count++;
      e.valor += r.valor_total_faturado || 0;
    });
    return Array.from(map.entries()).map(([name, v]) => ({ name, ...v }));
  }, [data]);

  // Chart data for monthly bars
  const chartMonthlyCount = useMemo(() =>
    monthlyData.map((m) => ({ name: formatMonthLabel(m.month), Quantidade: m.count })), [monthlyData]);

  const chartMonthlyValor = useMemo(() =>
    monthlyData.map((m) => ({ name: formatMonthLabel(m.month), Valor: m.valor })), [monthlyData]);

  // Stacked by modal
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

  const cardStyle = {
    background: "rgba(5,6,18,.92)",
    border: "1px solid rgba(255,200,0,0.15)",
    boxShadow: "0 18px 40px rgba(0,0,0,.85)",
    borderRadius: "1rem",
  };

  const CustomTooltip = ({ active, payload, label, isCurrency }: any) => {
    if (!active || !payload) return null;
    return (
      <div style={{ background: "#0a0e1a", border: "1px solid rgba(255,200,0,0.3)", borderRadius: 8, padding: "10px 14px" }}>
        <p className="text-xs text-[#aaa] mb-1">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} className="text-sm font-semibold" style={{ color: p.color }}>
            {p.name}: {isCurrency ? formatBRL(p.value) : p.value.toLocaleString("pt-BR")}
          </p>
        ))}
      </div>
    );
  };

  return (
    <PageLayout title="DACHSER" subtitle="Olimpo — Faturamento" pageIcon={Building2}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-[#ffc800]" />
              Dashboard de Faturamento
            </h2>
            <p className="text-sm text-muted-foreground mt-1">Dados consolidados da base Totvs RM</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} className="border-[#ffc800]/30 text-[#ffc800] hover:bg-[#ffc800]/10">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiBox icon={<DollarSign className="h-5 w-5" />} title="Faturamento Total (mês)" value={formatBRL(kpis.total)} color="#ffc800" />
          <KpiBox icon={<FileText className="h-5 w-5" />} title="Processos Faturados" value={kpis.count.toLocaleString("pt-BR")} color="#3b82f6" />
          <KpiBox
            icon={kpis.variation >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
            title="Variação vs Mês Anterior"
            value={`${kpis.variation >= 0 ? "+" : ""}${kpis.variation.toFixed(1)}%`}
            color={kpis.variation >= 0 ? "#10b981" : "#ef4444"}
          />
          <KpiBox icon={<Users className="h-5 w-5" />} title="Maior Cliente" value={kpis.topClient} subtitle={formatBRL(kpis.topClientVal)} color="#8b5cf6" />
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 1. Qtd Files Total */}
          <div style={cardStyle} className="p-5">
            <h3 className="text-sm font-semibold text-[#ffc800] mb-4">Quantidade de Files — Total Faturado</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartMonthlyCount}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="name" tick={{ fill: "#888", fontSize: 11 }} />
                <YAxis tick={{ fill: "#888", fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="Quantidade" fill="#ffc800" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 2. Qtd por Modal */}
          <div style={cardStyle} className="p-5">
            <h3 className="text-sm font-semibold text-[#ffc800] mb-4">Quantidade Total Faturada por Modal</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartModalCount}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="name" tick={{ fill: "#888", fontSize: 11 }} />
                <YAxis tick={{ fill: "#888", fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {allModals.map((mod) => (
                  <Bar key={mod} dataKey={mod} stackId="a" fill={MODAL_COLORS[mod] || "#666"} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 3. Valor Total */}
          <div style={cardStyle} className="p-5">
            <h3 className="text-sm font-semibold text-[#ffc800] mb-4">Valor Total Faturado no RM</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartMonthlyValor}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="name" tick={{ fill: "#888", fontSize: 11 }} />
                <YAxis tick={{ fill: "#888", fontSize: 11 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip isCurrency />} />
                <Bar dataKey="Valor" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 4. Valor por Modal */}
          <div style={cardStyle} className="p-5">
            <h3 className="text-sm font-semibold text-[#ffc800] mb-4">Valor Total Faturado no RM por Modal</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartModalValor}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="name" tick={{ fill: "#888", fontSize: 11 }} />
                <YAxis tick={{ fill: "#888", fontSize: 11 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip isCurrency />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {allModals.map((mod) => (
                  <Bar key={mod} dataKey={mod} stackId="a" fill={MODAL_COLORS[mod] || "#666"} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 5. Donut Região */}
          <div style={cardStyle} className="p-5">
            <h3 className="text-sm font-semibold text-[#ffc800] mb-4">Quantidade Total Faturada por Região</h3>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={regionData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {regionData.map((_, i) => (
                    <Cell key={i} fill={REGION_COLORS[i % REGION_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => v.toLocaleString("pt-BR")} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* 6. Divisão Modal */}
          <div style={cardStyle} className="p-5">
            <h3 className="text-sm font-semibold text-[#ffc800] mb-4">Faturamento por Divisão Modal</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={divisionData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis type="number" tick={{ fill: "#888", fontSize: 11 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                <YAxis dataKey="name" type="category" tick={{ fill: "#888", fontSize: 11 }} width={120} />
                <Tooltip content={<CustomTooltip isCurrency />} />
                <Bar dataKey="valor" name="Valor" fill="#ffc800" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

function KpiBox({ icon, title, value, subtitle, color }: { icon: React.ReactNode; title: string; value: string; subtitle?: string; color: string }) {
  return (
    <div
      className="flex items-center gap-4 p-5 rounded-2xl"
      style={{
        background: "rgba(5,6,18,.92)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderLeft: `4px solid ${color}`,
        boxShadow: "0 8px 24px rgba(0,0,0,.6)",
      }}
    >
      <div className="flex items-center justify-center w-12 h-12 rounded-xl" style={{ background: `${color}20`, color }}>
        {icon}
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-[#aaa]">{title}</p>
        <p className="text-2xl font-bold text-white">{value}</p>
        {subtitle && <p className="text-xs text-[#888]">{subtitle}</p>}
      </div>
    </div>
  );
}
