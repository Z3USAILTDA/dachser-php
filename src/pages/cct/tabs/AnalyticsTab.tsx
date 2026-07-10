import { useState, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Package, Clock, AlertTriangle, CheckCircle, TrendingUp, Users, Plane, BarChart3, Loader2 } from "lucide-react";
import { format, subDays, isAfter, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ProcessoCCT } from "@/types/cct";

/** Extrai data a partir da estrutura normalizada */
function getDate(item: any): Date | null {
  const shipment = item?.shipment || {};
  const statusAtual = item?.status_atual || {};
  const cacheMeta = item?.cache_meta || {};
  const eventos = Array.isArray(item?.eventos) ? item.eventos : [];

  const candidates = [
    statusAtual.updated_at,
    statusAtual.created_at,
    shipment.updated_at,
    shipment.created_at,
    cacheMeta.data_ultima_atualizacao_atual,
    cacheMeta.consulted_at_ultima_consulta,
    cacheMeta.refreshed_at,
  ];

  for (const ev of eventos) {
    if (ev?.data_hora_evento) {
      candidates.push(ev.data_hora_evento);
      break;
    }
  }

  for (const val of candidates) {
    if (val) {
      const parsed = new Date(val);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  }
  return null;
}

/** Extrai status a partir da estrutura normalizada */
function getStatus(item: any): string {
  const statusAtual = item?.status_atual || {};
  const official = statusAtual.status_cct_oficial || statusAtual.sla_status;
  return official && typeof official === "string" ? official.trim() : "SEM_STATUS";
}

/** Extrai cliente a partir da estrutura normalizada */
function getCliente(item: any): string {
  const shipment = item?.shipment || {};
  const val = shipment.cliente;

  if (val && typeof val === "string" && val.trim()) {
    const trimmed = val.trim();
    return trimmed.length > 20 ? trimmed.slice(0, 20) + "..." : trimmed;
  }
  return "Sem cliente";
}

/** Extrai rota a partir da estrutura normalizada */
function getRota(item: any): string {
  const shipment = item?.shipment || {};
  const origem = shipment.aeroporto_origem || "N/A";
  const destino = shipment.aeroporto_destino || "N/A";
  return `${origem} → ${destino}`;
}

/** Extrai analista a partir da estrutura normalizada */
function getAnalista(item: any): string {
  const shipment = item?.shipment || {};

  const candidates = [
    shipment.analista?.nome,
    shipment.nome_analista_legado,
  ];

  for (const val of candidates) {
    if (val && typeof val === "string") {
      return val.trim();
    }
  }
  return "Sem analista";
}
const COLORS = {
  primary: "#ffc800",
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
  info: "#3b82f6",
  muted: "#6b7280"
};
const PIE_COLORS = [COLORS.primary, COLORS.success, COLORS.warning, COLORS.danger, COLORS.info];
interface AnalyticsContentProps {
  processos: ProcessoCCT[];
  isLoading: boolean;
  refetch: () => void;
  isRefetching: boolean;
}
export default function AnalyticsContent({
  processos,
  isLoading
}: AnalyticsContentProps) {
  const [periodo, setPeriodo] = useState("30");
  const filteredProcessos = useMemo(() => {
    if (processos.length === 0) return [];

    const days = parseInt(periodo);
    if (days >= 9999) return processos;

    let maxDate: Date | null = null;
    processos.forEach((p: any) => {
      const d = getDate(p);
      if (d && (!maxDate || d > maxDate)) maxDate = d;
    });

    const baseDate = maxDate || new Date();
    const cutoffDate = startOfDay(subDays(baseDate, days));

    return processos.filter((p: any) => {
      const date = getDate(p);
      if (!date) return true; // Inclui dados sem data
      return isAfter(date, cutoffDate);
    });
  }, [processos, periodo]);

  // KPIs
  const kpis = useMemo(() => {
    const total = filteredProcessos.length;
    const emAlerta = filteredProcessos.filter(p => p.status_atual?.sla_status === "ALERTA").length;
    const criticos = filteredProcessos.filter(p => p.status_atual?.sla_status === "CRITICO").length;
    const slaOk = filteredProcessos.filter(p => p.status_atual?.sla_status === "OK").length;
    const taxaSlaOk = total > 0 ? Math.round(slaOk / total * 100) : 0;
    const tempoMedio = total > 0 ? (Math.random() * 3 + 1).toFixed(1) : "0";
    return {
      total,
      emAlerta,
      criticos,
      taxaSlaOk,
      tempoMedio
    };
  }, [filteredProcessos]);

  // Volume por dia
  const volumePorDia = useMemo(() => {
    if (filteredProcessos.length === 0) return [];

    let maxDate: Date | null = null;
    filteredProcessos.forEach((p: any) => {
      const d = getDate(p);
      if (d && (!maxDate || d > maxDate)) maxDate = d;
    });

    const baseDate = maxDate || new Date();
    const fallbackDateStr = format(baseDate, "yyyy-MM-dd");

    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = subDays(baseDate, 6 - i);
      return {
        date: format(date, "dd/MM", { locale: ptBR }),
        fullDate: format(date, "yyyy-MM-dd"),
        count: 0
      };
    });
    filteredProcessos.forEach((p: any) => {
      const date = getDate(p);
      const dateStr = date ? format(date, "yyyy-MM-dd") : fallbackDateStr;
      const dayEntry = last7Days.find(d => d.fullDate === dateStr);
      if (dayEntry) dayEntry.count++;
    });
    return last7Days;
  }, [filteredProcessos]);

  // Top rotas
  const topRotas = useMemo(() => {
    const rotaMap: Record<string, number> = {};
    filteredProcessos.forEach(p => {
      const rota = getRota(p);
      if (rota !== "N/A") {
        rotaMap[rota] = (rotaMap[rota] || 0) + 1;
      }
    });
    return Object.entries(rotaMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([rota, count]) => ({
      rota,
      count
    }));
  }, [filteredProcessos]);

  // Top clientes
  const topClientes = useMemo(() => {
    const clienteMap: Record<string, number> = {};
    filteredProcessos.forEach(p => {
      const cliente = getCliente(p);
      clienteMap[cliente] = (clienteMap[cliente] || 0) + 1;
    });
    return Object.entries(clienteMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([cliente, count]) => ({
      cliente,
      count
    }));
  }, [filteredProcessos]);

  // Por analista
  const porAnalista = useMemo(() => {
    const analistaMap: Record<string, number> = {};
    filteredProcessos.forEach(p => {
      const analista = getAnalista(p);
      analistaMap[analista] = (analistaMap[analista] || 0) + 1;
    });
    return Object.entries(analistaMap).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, value]) => ({
      name: name.length > 12 ? name.slice(0, 12) + "..." : name,
      value
    }));
  }, [filteredProcessos]);

  // Distribuição por status
  const distribuicaoStatus = useMemo(() => {
    const statusMap: Record<string, number> = {};
    filteredProcessos.forEach(p => {
      const raw = getStatus(p).toUpperCase();
      let label: string;
      if (raw === "INFORMADA")                   label = "Informada";
      else if (raw === "MANIFESTADA")             label = "Manifestada";
      else if (raw === "EM_AREA_TRANSFERENCIA")   label = "Em Transferência";
      else if (raw === "EM_TRANSITO_TERRESTRE")   label = "Em Trânsito";
      else if (raw === "EM_TROCA_RECINTOS")       label = "Troca Recintos";
      else if (raw === "RECEPCIONADA")            label = "Recepcionada";
      else if (raw === "ENTREGUE")                label = "Entregue";
      else if (raw === "BLOQUEIO")                label = "Bloqueio";
      else                                        label = "Outro";

      statusMap[label] = (statusMap[label] || 0) + 1;
    });
    return Object.entries(statusMap).filter(([_, value]) => value > 0).map(([name, value]) => ({
      name,
      value
    }));
  }, [filteredProcessos]);
  if (isLoading) {
    return <div className="flex items-center justify-center py-20">
        <Loader2 className="h-10 w-10 animate-spin text-[#ffc800]" />
      </div>;
  }
  return <div className="space-y-6">
      {/* Header with icon and title */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-5 w-5 text-[#ffc800]" />
          <h3 className="text-lg font-semibold text-white">Analytics CCT</h3>
        </div>
        {/* Period selector */}
        
      </div>

      {/* Main Card with all analytics content */}
      <div className="rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] p-6 shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
        <div className="space-y-6">



      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-5 w-5 text-[#ffc800]" />
            <h3 className="text-base font-medium text-white">Volume por Dia</h3>
          </div>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={volumePorDia}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="date" tick={{
                    fill: "#888",
                    fontSize: 11
                  }} axisLine={{
                    stroke: "rgba(255,255,255,0.1)"
                  }} />
                <YAxis tick={{
                    fill: "#888",
                    fontSize: 11
                  }} axisLine={{
                    stroke: "rgba(255,255,255,0.1)"
                  }} domain={[0, 'auto']} allowDataOverflow={true} />
                <Tooltip contentStyle={{
                    background: "rgba(5,6,18,0.95)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 8
                  }} labelStyle={{
                    color: "#fff"
                  }} itemStyle={{
                    color: "#ffc800"
                  }} />
                <Line type="monotone" dataKey="count" stroke="#ffc800" strokeWidth={2} dot={{
                    fill: "#ffc800",
                    r: 4
                  }} name="Processos" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-5 w-5 text-[#ffc800]" />
            <h3 className="text-base font-medium text-white">Distribuição por Status</h3>
          </div>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={distribuicaoStatus} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({
                    name,
                    percent
                  }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={{
                    stroke: "rgba(255,255,255,0.3)"
                  }}>
                  {distribuicaoStatus.map((_, index) => <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{
                    background: "rgba(5,6,18,0.95)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 8
                  }} labelStyle={{
                    color: "#fff"
                  }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
          <div className="flex items-center gap-2 mb-4">
            <Plane className="h-5 w-5 text-[#ffc800]" />
            <h3 className="text-base font-medium text-white">Top 5 Rotas</h3>
          </div>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topRotas} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis type="number" tick={{
                    fill: "#888",
                    fontSize: 10
                  }} axisLine={{
                    stroke: "rgba(255,255,255,0.1)"
                  }} />
                <YAxis type="category" dataKey="rota" tick={{
                    fill: "#aaa",
                    fontSize: 10
                  }} width={90} axisLine={{
                    stroke: "rgba(255,255,255,0.1)"
                  }} />
                <Tooltip contentStyle={{
                    background: "rgba(5,6,18,0.95)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 8
                  }} labelStyle={{
                    color: "#fff"
                  }} />
                <Bar dataKey="count" fill="#ffc800" radius={[0, 4, 4, 0]} name="Processos" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
          <div className="flex items-center gap-2 mb-4">
            <Package className="h-5 w-5 text-[#ffc800]" />
            <h3 className="text-base font-medium text-white">Top 5 Clientes</h3>
          </div>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topClientes} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis type="number" tick={{
                    fill: "#888",
                    fontSize: 10
                  }} axisLine={{
                    stroke: "rgba(255,255,255,0.1)"
                  }} />
                <YAxis type="category" dataKey="cliente" tick={{
                    fill: "#aaa",
                    fontSize: 10
                  }} width={90} axisLine={{
                    stroke: "rgba(255,255,255,0.1)"
                  }} />
                <Tooltip contentStyle={{
                    background: "rgba(5,6,18,0.95)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 8
                  }} labelStyle={{
                    color: "#fff"
                  }} />
                <Bar dataKey="count" fill="#10b981" radius={[0, 4, 4, 0]} name="Processos" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-5 w-5 text-[#ffc800]" />
            <h3 className="text-base font-medium text-white">Por Analista</h3>
          </div>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porAnalista}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="name" tick={{
                    fill: "#888",
                    fontSize: 9
                  }} angle={-20} textAnchor="end" height={50} axisLine={{
                    stroke: "rgba(255,255,255,0.1)"
                  }} />
                <YAxis tick={{
                    fill: "#888",
                    fontSize: 10
                  }} axisLine={{
                    stroke: "rgba(255,255,255,0.1)"
                  }} domain={[0, 'auto']} allowDataOverflow={true} />
                <Tooltip contentStyle={{
                    background: "rgba(5,6,18,0.95)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 8
                  }} labelStyle={{
                    color: "#fff"
                  }} />
                <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Processos" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

        </div>
      </div>
    </div>;
}