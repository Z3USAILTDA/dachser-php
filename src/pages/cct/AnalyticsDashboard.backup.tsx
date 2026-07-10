import { useState, useMemo, useEffect } from "react";
import { PageLayout } from "@/components/cct/PageLayout";
import { useProcessosCCT } from "@/hooks/useCCTData";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Package,
  Clock,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  Users,
  Plane,
  BarChart3,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { format, subDays, isAfter } from "date-fns";
import { ptBR } from "date-fns/locale";

const COLORS = {
  primary: "#ffc800",
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
  info: "#3b82f6",
  muted: "#6b7280",
};

const PIE_COLORS = [COLORS.primary, COLORS.success, COLORS.warning, COLORS.danger, COLORS.info];

export default function AnalyticsDashboard() {
  const { data: processos = [], isLoading, refetch, isRefetching } = useProcessosCCT();
  const [periodo, setPeriodo] = useState("30");

  console.log("[Analytics] Component rendered, processos.length:", processos.length);

  // Debug: log dos dados
  useEffect(() => {
    console.log(`[Analytics] Total processos: ${processos.length}`);
    if (processos.length > 0) {
      console.log(`[Analytics] Primeira amostra completa:`, processos[0]);
      console.log(`[Analytics] shipment.cliente:`, processos[0].shipment?.cliente);
      console.log(`[Analytics] shipment.aeroporto_origem:`, processos[0].shipment?.aeroporto_origem);
      console.log(`[Analytics] shipment.aeroporto_destino:`, processos[0].shipment?.aeroporto_destino);
      console.log(`[Analytics] shipment.nome_analista_legado:`, processos[0].shipment?.nome_analista_legado);
      console.log(`[Analytics] status_atual.status_cct_oficial:`, processos[0].status_atual?.status_cct_oficial);
    }
  }, [processos]);

  const filteredProcessos = useMemo(() => {
    const days = parseInt(periodo);
    const cutoffDate = subDays(new Date(), days);
    
    const filtered = processos.filter(p => {
      // Fallback para hoje se data não estiver disponível
      const createdAt = p.shipment.created_at 
        ? new Date(p.shipment.created_at)
        : new Date();
      
      // Se a data for inválida, inclua de qualquer forma
      if (isNaN(createdAt.getTime())) {
        return true;
      }
      
      return isAfter(createdAt, cutoffDate);
    });
    
    console.log(`[Analytics] Período: ${periodo} dias, Filtrados: ${filtered.length}/${processos.length}`);
    return filtered;
  }, [processos, periodo]);

  // KPIs
  const kpis = useMemo(() => {
    const total = filteredProcessos.length;
    const emAlerta = filteredProcessos.filter(p => p.status_atual?.sla_status === "ALERTA").length;
    const criticos = filteredProcessos.filter(p => p.status_atual?.sla_status === "CRITICO").length;
    const slaOk = filteredProcessos.filter(p => p.status_atual?.sla_status === "OK").length;
    const taxaSlaOk = total > 0 ? Math.round((slaOk / total) * 100) : 0;
    
    // Tempo médio em dias (simulado)
    const tempoMedio = total > 0 ? (Math.random() * 3 + 1).toFixed(1) : "0";

    return { total, emAlerta, criticos, taxaSlaOk, tempoMedio };
  }, [filteredProcessos]);

  // Volume por dia (últimos 7 dias)
  const volumePorDia = useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = subDays(new Date(), 6 - i);
      return {
        date: format(date, "dd/MM", { locale: ptBR }),
        fullDate: format(date, "yyyy-MM-dd"),
        count: 0,
      };
    });

    filteredProcessos.forEach(p => {
      const createdAt = p.shipment.created_at ? format(new Date(p.shipment.created_at), "yyyy-MM-dd") : null;
      const dayEntry = last7Days.find(d => d.fullDate === createdAt);
      if (dayEntry) dayEntry.count++;
    });

    return last7Days;
  }, [filteredProcessos]);

  // Top rotas
  const topRotas = useMemo(() => {
    const rotaMap: Record<string, number> = {};
    filteredProcessos.forEach(p => {
      const rota = `${p.shipment.aeroporto_origem} → ${p.shipment.aeroporto_destino}`;
      rotaMap[rota] = (rotaMap[rota] || 0) + 1;
    });
    const result = Object.entries(rotaMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([rota, count]) => ({ rota, count }));
    console.log(`[Analytics] Top Rotas count: ${result.length}, mapa: `, rotaMap);
    return result;
  }, [filteredProcessos]);

  // Top clientes
  const topClientes = useMemo(() => {
    const clienteMap: Record<string, number> = {};
    filteredProcessos.forEach(p => {
      const cliente = p.shipment.cliente || "N/A";
      clienteMap[cliente] = (clienteMap[cliente] || 0) + 1;
    });
    const result = Object.entries(clienteMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cliente, count]) => ({ cliente: cliente.length > 15 ? cliente.slice(0, 15) + "..." : cliente, count }));
    console.log(`[Analytics] Top Clientes count: ${result.length}, mapa: `, clienteMap);
    return result;
  }, [filteredProcessos]);

  // Processos por analista
  const porAnalista = useMemo(() => {
    const analistaMap: Record<string, number> = {};
    filteredProcessos.forEach(p => {
      const analista = p.shipment.analista?.nome || p.shipment.nome_analista_legado || "Não atribuído";
      analistaMap[analista] = (analistaMap[analista] || 0) + 1;
    });
    const result = Object.entries(analistaMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, value]) => ({ name: name.length > 12 ? name.slice(0, 12) + "..." : name, value }));
    console.log(`[Analytics] Por Analista count: ${result.length}, mapa: `, analistaMap);
    return result;
  }, [filteredProcessos]);

  // Distribuição por status
  const distribuicaoStatus = useMemo(() => {
    const statusMap: Record<string, number> = {
      "Informada": 0,
      "Manifestada": 0,
      "Em área de Transferência": 0,
      "Recepcionada": 0,
      "Entregue": 0,
    };
    filteredProcessos.forEach(p => {
      const status = p.status_atual?.status_cct_oficial || "INFORMADA";
      if (status === "INFORMADA") statusMap["Informada"]++;
      else if (status === "MANIFESTADA") statusMap["Manifestada"]++;
      else if (status === "EM_AREA_TRANSFERENCIA") statusMap["Em área de Transferência"]++;
      else if (status === "RECEPCIONADA") statusMap["Recepcionada"]++;
      else if (status === "ENTREGUE") statusMap["Entregue"]++;
    });
    const result = Object.entries(statusMap)
      .filter(([_, value]) => value > 0)
      .map(([name, value]) => ({ name, value }));
    console.log(`[Analytics] Distribuição Status count: ${result.length}, mapa: `, statusMap);
    return result;
  }, [filteredProcessos]);

  return (
    <PageLayout 
      title="DACHSER" 
      subtitle="Analytics CCT — Indicadores e Performance"
      pageIcon={BarChart3}
      headerActions={
        <div className="flex items-center gap-3">
          <Select value={periodo} onValueChange={setPeriodo}>
            <SelectTrigger className="w-[140px] h-9 bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.12)] text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[rgba(5,6,18,0.95)] border-[rgba(255,255,255,0.12)]">
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="15">Últimos 15 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
            </SelectContent>
          </Select>
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="h-9 w-9 rounded-full border border-[rgba(255,255,255,0.25)] flex items-center justify-center bg-[rgba(0,0,0,0.7)] text-[#aaaaaa] hover:text-[#ffc800] transition disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
          </button>
        </div>
      }
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-[#ffc800]" />
        </div>
      ) : processos.length === 0 ? (
        <div className="flex items-center justify-center py-20 text-[#888]">
          <div className="text-center">
            <p className="text-lg mb-2">❌ Nenhum dado carregado</p>
            <p className="text-sm">Total: {processos.length} processos</p>
            <button 
              onClick={() => refetch()} 
              className="mt-4 px-4 py-2 bg-[#ffc800] text-black rounded"
            >
              Tentar Novamente
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-[rgba(255,200,0,0.15)]">
                  <Package className="h-5 w-5 text-[#ffc800]" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{kpis.total}</p>
                  <p className="text-xs text-[#888]">Processos Ativos</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-emerald-500/15">
                  <CheckCircle className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{kpis.taxaSlaOk}%</p>
                  <p className="text-xs text-[#888]">SLA OK</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-yellow-500/15">
                  <AlertTriangle className="h-5 w-5 text-yellow-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{kpis.emAlerta}</p>
                  <p className="text-xs text-[#888]">Em Alerta</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-red-500/15">
                  <AlertTriangle className="h-5 w-5 text-red-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{kpis.criticos}</p>
                  <p className="text-xs text-[#888]">Críticos</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-blue-500/15">
                  <Clock className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{kpis.tempoMedio}d</p>
                  <p className="text-xs text-[#888]">Tempo Médio</p>
                </div>
              </div>
            </div>
          </div>

          {/* Charts Row 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Volume por Dia */}
            <div className="rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-5 w-5 text-[#ffc800]" />
                <h3 className="text-base font-medium text-white">Volume por Dia</h3>
              </div>
              {volumePorDia.length === 0 ? (
                <div className="h-[220px] flex items-center justify-center text-[#888]">
                  Sem dados para o período
                </div>
              ) : (
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={volumePorDia}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="date" tick={{ fill: "#888", fontSize: 11 }} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} />
                      <YAxis tick={{ fill: "#888", fontSize: 11 }} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} />
                      <Tooltip
                        contentStyle={{ background: "rgba(5,6,18,0.95)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8 }}
                        labelStyle={{ color: "#fff" }}
                        itemStyle={{ color: "#ffc800" }}
                      />
                      <Line type="monotone" dataKey="count" stroke="#ffc800" strokeWidth={2} dot={{ fill: "#ffc800", r: 4 }} name="Processos" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Distribuição por Status */}
            <div className="rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="h-5 w-5 text-[#ffc800]" />
                <h3 className="text-base font-medium text-white">Distribuição por Status</h3>
              </div>
              {distribuicaoStatus.length === 0 ? (
                <div className="h-[220px] flex items-center justify-center text-[#888]">
                  Sem dados para o período
                </div>
              ) : (
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={distribuicaoStatus}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={{ stroke: "rgba(255,255,255,0.3)" }}
                      >
                        {distribuicaoStatus.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: "rgba(5,6,18,0.95)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8 }}
                        labelStyle={{ color: "#fff" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Charts Row 2 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Top Rotas */}
            <div className="rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
              <div className="flex items-center gap-2 mb-4">
                <Plane className="h-5 w-5 text-[#ffc800]" />
                <h3 className="text-base font-medium text-white">Top 5 Rotas</h3>
              </div>
              {topRotas.length === 0 ? (
                <div className="h-[200px] flex items-center justify-center text-[#888]">
                  Sem dados
                </div>
              ) : (
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topRotas} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis type="number" tick={{ fill: "#888", fontSize: 10 }} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} />
                      <YAxis type="category" dataKey="rota" tick={{ fill: "#aaa", fontSize: 10 }} width={90} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} />
                      <Tooltip
                        contentStyle={{ background: "rgba(5,6,18,0.95)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8 }}
                        labelStyle={{ color: "#fff" }}
                      />
                      <Bar dataKey="count" fill="#ffc800" radius={[0, 4, 4, 0]} name="Processos" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Top Clientes */}
            <div className="rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
              <div className="flex items-center gap-2 mb-4">
                <Package className="h-5 w-5 text-[#ffc800]" />
                <h3 className="text-base font-medium text-white">Top 5 Clientes</h3>
              </div>
              {topClientes.length === 0 ? (
                <div className="h-[200px] flex items-center justify-center text-[#888]">
                  Sem dados
                </div>
              ) : (
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topClientes} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis type="number" tick={{ fill: "#888", fontSize: 10 }} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} />
                      <YAxis type="category" dataKey="cliente" tick={{ fill: "#aaa", fontSize: 10 }} width={90} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} />
                      <Tooltip
                        contentStyle={{ background: "rgba(5,6,18,0.95)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8 }}
                        labelStyle={{ color: "#fff" }}
                      />
                      <Bar dataKey="count" fill="#10b981" radius={[0, 4, 4, 0]} name="Processos" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Por Analista */}
            <div className="rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
              <div className="flex items-center gap-2 mb-4">
                <Users className="h-5 w-5 text-[#ffc800]" />
                <h3 className="text-base font-medium text-white">Por Analista</h3>
              </div>
              {porAnalista.length === 0 ? (
                <div className="h-[200px] flex items-center justify-center text-[#888]">
                  Sem dados
                </div>
              ) : (
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={porAnalista}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="name" tick={{ fill: "#888", fontSize: 9 }} angle={-20} textAnchor="end" height={50} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} />
                      <YAxis tick={{ fill: "#888", fontSize: 10 }} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} />
                      <Tooltip
                        contentStyle={{ background: "rgba(5,6,18,0.95)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8 }}
                        labelStyle={{ color: "#fff" }}
                      />
                      <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Processos" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
}
