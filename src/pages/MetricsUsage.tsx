import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ChartLine, RotateCcw, Download, FileText, HelpCircle } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { TablePagination } from "@/components/layout/TablePagination";
import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/hooks/useUsageLog";
import { parseDBDate, formatDateTimeBR } from "@/utils/timezone";
import { prettifyEndpoint, prettifyMethod } from "@/utils/endpointLabels";
import { PageLayout } from "@/components/layout/PageLayout";
import { PageCard } from "@/components/layout/PageCard";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

interface LogEntry {
  id: number;
  username: string;
  endpoint: string;
  method: string;
  event_time: string;
}

interface MetricsStats {
  total: number;
  distinctUsers: number;
  distinctEndpoints: number;
  getCalls: number;
  postCalls: number;
  avgPerDay: number;
}

interface DailyData {
  date: string;
  total: number;
}

interface EndpointData {
  endpoint: string;
  total: number;
}

const MetricsUsage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<{ id: number; username: string; is_admin: number; metrics_only?: number } | null>(null);
  const [isMetricsOnly, setIsMetricsOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<MetricsStats>({
    total: 0,
    distinctUsers: 0,
    distinctEndpoints: 0,
    getCalls: 0,
    postCalls: 0,
    avgPerDay: 0,
  });
  const [dailyData, setDailyData] = useState<DailyData[]>([]);
  const [endpointData, setEndpointData] = useState<EndpointData[]>([]);
  const [availableUsers, setAvailableUsers] = useState<string[]>([]);
  const [moduleStats, setModuleStats] = useState<Array<{
    module: string;
    label: string;
    totalAccesses: number;
    uniqueUsers: number;
    avgTimeOnScreenSec: number;
    topEndpoint: string | null;
  }>>([]);
  const [loadingModules, setLoadingModules] = useState(false);

  interface SessionEvent { endpoint: string; method: string; event_time: string; }
  interface SessionRow {
    sessionId: string;
    username: string;
    startedAt: string;
    endedAt: string;
    eventCount: number;
    uniqueEndpoints: number;
    durationSec: number;
    events: SessionEvent[];
  }
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [sessionsPage, setSessionsPage] = useState(1);
  const [sessionsTotalPages, setSessionsTotalPages] = useState(1);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);

  // Função auxiliar para obter data no formato YYYY-MM-DD em fuso local (São Paulo)
  const getLocalDateString = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const today = new Date();
  const defaultFrom = new Date(today);
  defaultFrom.setDate(defaultFrom.getDate() - 7);

  const [dateFrom, setDateFrom] = useState(getLocalDateString(defaultFrom));
  const [dateTo, setDateTo] = useState(getLocalDateString(today));
  const [usernameFilter, setUsernameFilter] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [perPage, setPerPage] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Fetch available users for the filter dropdown (runs after user is set)
  useEffect(() => {
    const fetchAvailableUsers = async () => {
      try {
        const storedUser = localStorage.getItem("user");
        const parsedUser = storedUser ? JSON.parse(storedUser) : null;
        const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
          body: { action: "get_metric_users", requesterUsername: parsedUser?.username || null },
        });
        if (!error && data?.users) {
          setAvailableUsers(data.users);
        }
      } catch (err) {
        console.error("Error fetching users for filter:", err);
      }
    };
    fetchAvailableUsers();
  }, []);

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      // Permitir acesso se is_admin=1 OU metrics_only=1
      if (parsedUser.is_admin !== 1 && parsedUser.metrics_only !== 1) {
        navigate("/dashboard");
        return;
      }
      setUser(parsedUser);
      setIsMetricsOnly(parsedUser.metrics_only === 1);
    } else {
      navigate("/");
    }
  }, [navigate]);

  useEffect(() => {
    if (user?.is_admin === 1 || user?.metrics_only === 1) {
      fetchMetrics();
      fetchModuleStats();
    }
  }, [user, dateFrom, dateTo, usernameFilter, moduleFilter, perPage, currentPage]);

  useEffect(() => {
    if (user?.is_admin === 1 || user?.metrics_only === 1) {
      fetchSessions();
    }
  }, [user, dateFrom, dateTo, usernameFilter, sessionsPage]);

  const fetchModuleStats = async () => {
    setLoadingModules(true);
    try {
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "get_metrics_by_module",
          dateFrom,
          dateTo,
          username: usernameFilter,
          requesterUsername: user?.username,
        },
      });
      if (!error && data?.modules) setModuleStats(data.modules);
    } catch (err) {
      console.error("Error fetching module stats:", err);
    } finally {
      setLoadingModules(false);
    }
  };

  const fetchSessions = async () => {
    setLoadingSessions(true);
    try {
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "get_metrics_sessions",
          dateFrom,
          dateTo,
          username: usernameFilter,
          requesterUsername: user?.username,
          perPage: 25,
          page: sessionsPage,
        },
      });
      if (!error && data?.sessions) {
        setSessions(data.sessions);
        setSessionsTotalPages(data.totalPages || 1);
      }
    } catch (err) {
      console.error("Error fetching sessions:", err);
    } finally {
      setLoadingSessions(false);
    }
  };

  const formatDuration = (sec: number) => {
    if (!sec || sec <= 0) return "—";
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };


  const fetchMetrics = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "get_metrics",
          dateFrom,
          dateTo,
          username: usernameFilter,
          module: moduleFilter,
          perPage,
          page: currentPage,
          requesterUsername: user?.username,
        },
      });

      if (error) throw error;

      if (data) {
        setLogs(data.logs || []);
        setStats(data.stats || {
          total: 0,
          distinctUsers: 0,
          distinctEndpoints: 0,
          getCalls: 0,
          postCalls: 0,
          avgPerDay: 0,
        });
        setDailyData(data.dailyData || []);
        setEndpointData(data.endpointData || []);
        setTotalPages(data.totalPages || 1);
      }
    } catch (error) {
      console.error("Error fetching metrics:", error);
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => {
    const newFrom = new Date();
    newFrom.setDate(newFrom.getDate() - 7);
    setDateFrom(getLocalDateString(newFrom));
    setDateTo(getLocalDateString(new Date()));
    setUsernameFilter("");
    setModuleFilter("");
    setCurrentPage(1);
  };

  const getDaysDiff = () => {
    const from = new Date(dateFrom);
    const to = new Date(dateTo);
    return Math.max(1, Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  };

  const getMethodClass = (method: string) => {
    switch (method) {
      case "GET":
        return "bg-emerald-500/15 border-emerald-500/80 text-emerald-400";
      case "POST":
        return "bg-primary/10 border-primary/90 text-primary";
      case "DELETE":
        return "bg-red-500/12 border-red-500/90 text-red-400";
      default:
        return "bg-background/50 border-border";
    }
  };

  const formatDate = (dateStr: string) => {
    // Usar utilitário de timezone para interpretar corretamente o horário de São Paulo
    const parsed = parseDBDate(dateStr);
    if (!parsed) return dateStr;
    return formatDateTimeBR(parsed);
  };

  const handleExportExcel = () => {
    if (logs.length === 0) {
      toast({ title: "Aviso", description: "Nenhum dado para exportar", variant: "destructive" });
      return;
    }
    trackEvent("metrics.export.excel");

    const exportData = logs.map(log => ({
      "Data/Hora": formatDate(log.event_time),
      "Usuário": log.username,
      "Método": log.method,
      "Endpoint": log.endpoint,
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Logs");
    
    // Auto-size columns
    const colWidths = Object.keys(exportData[0] || {}).map(key => ({
      wch: Math.max(key.length, ...exportData.map(row => String(row[key as keyof typeof row] || "").length))
    }));
    worksheet["!cols"] = colWidths;

    const fileName = `metricas_${dateFrom}_${dateTo}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    
    toast({ title: "Exportado", description: `${logs.length} registro(s) exportado(s) para Excel` });
  };

  const handleExportPDF = () => {
    if (logs.length === 0) {
      toast({ title: "Aviso", description: "Nenhum dado para exportar", variant: "destructive" });
      return;
    }
    trackEvent("metrics.export.pdf");

    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(16);
    doc.setTextColor(40);
    doc.text("DACHSER - Métricas de Uso", 14, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Período: ${new Date(dateFrom).toLocaleDateString("pt-BR")} - ${new Date(dateTo).toLocaleDateString("pt-BR")}`, 14, 28);
    doc.text(`Total de logs: ${stats.total} | Usuários: ${stats.distinctUsers} | Endpoints: ${stats.distinctEndpoints}`, 14, 34);
    
    // Table
    const tableData = logs.map(log => [
      formatDate(log.event_time),
      log.username,
      log.method,
      log.endpoint,
    ]);

    autoTable(doc, {
      head: [["Data/Hora", "Usuário", "Método", "Endpoint"]],
      body: tableData,
      startY: 42,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [245, 184, 67], textColor: [0, 0, 0] },
      alternateRowStyles: { fillColor: [245, 245, 245] },
    });

    const fileName = `metricas_${dateFrom}_${dateTo}.pdf`;
    doc.save(fileName);
    
    toast({ title: "Exportado", description: `${logs.length} registro(s) exportado(s) para PDF` });
  };

  const rightContent = (
    <div className="flex items-center gap-3">
      <button
        onClick={() => navigate("/admin/manual")}
        className="w-8 h-8 rounded-full border border-white/25 flex items-center justify-center bg-black/70 text-gray-400 hover:text-[#ffc800] transition-colors"
        title="Manual do usuário"
      >
        <HelpCircle className="h-4 w-4" />
      </button>
      <div className="w-8 h-8 rounded-full border border-white/25 flex items-center justify-center bg-black/70 text-primary">
        <ChartLine size={16} />
      </div>
    </div>
  );

  return (
    <PageLayout title="DACHSER" subtitle="Métricas de Uso" pageIcon={ChartLine} backTo="/dashboard" exclusiveAccess={isMetricsOnly}>
      {/* Grid: Stats + Filters */}
      <div className="grid grid-cols-1 lg:grid-cols-[2.2fr_1.2fr] gap-5">
        {/* Stats Panel */}
        <PageCard>
          <div className="flex items-center justify-between text-sm uppercase tracking-[0.18em]">
            <span className="font-semibold">Métricas Gerais</span>
            <span className="text-muted-foreground text-xs normal-case tracking-normal">
              Período: {new Date(dateFrom).toLocaleDateString("pt-BR")} –{" "}
              {new Date(dateTo).toLocaleDateString("pt-BR")} ({getDaysDiff()} dias)
            </span>
          </div>

          {/* Chips */}
          <div className="flex flex-wrap gap-2 mt-3">
            <div className="px-3 py-1.5 rounded-full border border-white/12 bg-white/5 text-xs flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              Logs internos
            </div>
            {usernameFilter && (
              <div className="px-3 py-1.5 rounded-full border border-white/12 bg-white/5 text-xs">
                Usuário: {usernameFilter}
              </div>
            )}
            {moduleFilter && (
              <div className="px-3 py-1.5 rounded-full border border-white/12 bg-white/5 text-xs">
                Módulo: {moduleFilter.toUpperCase()}
              </div>
            )}
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <div className="p-3 rounded-xl bg-[#0a0b10] border border-white/10">
              <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Total de Logs</div>
              <div className="text-xl font-bold mt-1">{stats.total}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{stats.avgPerDay.toFixed(1)} / dia (média)</div>
            </div>
            <div className="p-3 rounded-xl bg-[#0a0b10] border border-white/10">
              <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Usuários distintos</div>
              <div className="text-xl font-bold mt-1">{stats.distinctUsers}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{stats.distinctUsers ? "Atividade distribuída" : "Sem uso no período"}</div>
            </div>
            <div className="p-3 rounded-xl bg-[#0a0b10] border border-white/10">
              <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Endpoints distintos</div>
              <div className="text-xl font-bold mt-1">{stats.distinctEndpoints}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Cobertura de features</div>
            </div>
            <div className="p-3 rounded-xl bg-[#0a0b10] border border-white/10">
              <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Métodos GET x POST</div>
              <div className="text-xl font-bold mt-1">{stats.getCalls} / {stats.postCalls}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">GET / POST</div>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 md:grid-cols-[1.3fr_1fr] gap-3 mt-5">
            <div className="rounded-xl bg-[#05060c] border border-white/10 p-3">
              <div className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground mb-1">Logs por Dia</div>
              <div className="text-[10px] text-muted-foreground mb-2">Volume diário de chamadas no período filtrado.</div>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                    <XAxis dataKey="date" tick={{ fill: "#ccc", fontSize: 10 }} axisLine={false} />
                    <YAxis tick={{ fill: "#ccc", fontSize: 10 }} axisLine={false} />
                    <Tooltip contentStyle={{ background: "#111", border: "1px solid rgba(255,200,0,0.3)", borderRadius: "8px" }} />
                    <Line type="monotone" dataKey="total" stroke="#ffc800" strokeWidth={2} dot={{ r: 3, fill: "#ffc800" }} fill="rgba(255,200,0,0.15)" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl bg-[#05060c] border border-white/10 p-3">
              <div className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground mb-1">Top 5 Endpoints</div>
              <div className="text-[10px] text-muted-foreground mb-2">Endpoints mais acionados no período.</div>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={endpointData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                    <XAxis type="number" tick={{ fill: "#ccc", fontSize: 10 }} />
                    <YAxis type="category" dataKey="endpoint" tick={{ fill: "#ccc", fontSize: 9 }} width={100} />
                    <Tooltip contentStyle={{ background: "#111", border: "1px solid rgba(255,200,0,0.3)", borderRadius: "8px" }} />
                    <Bar dataKey="total" fill="rgba(255,200,0,0.7)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </PageCard>

        {/* Filters Panel */}
        <PageCard>
          <div className="text-sm uppercase tracking-[0.18em] font-semibold">Visão de Filtros</div>
          <p className="text-xs text-muted-foreground mt-1 mb-4">Refine por período, usuário e módulo.</p>

          <div className="space-y-3">
            <div>
              <label className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground block mb-1">De</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1); }}
                className="w-full px-3 py-2 rounded-full border border-white/20 bg-[#13141a] text-foreground text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground block mb-1">Até</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1); }}
                className="w-full px-3 py-2 rounded-full border border-white/20 bg-[#13141a] text-foreground text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground block mb-1">Usuário</label>
              <select
                value={usernameFilter}
                onChange={(e) => { setUsernameFilter(e.target.value); setCurrentPage(1); }}
                className="w-full px-3 py-2 rounded-full border border-white/20 bg-[#13141a] text-foreground text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              >
                <option value="">(todos)</option>
                {availableUsers.map((username) => (
                  <option key={username} value={username}>{username}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground block mb-1">Módulo</label>
              <select
                value={moduleFilter}
                onChange={(e) => { setModuleFilter(e.target.value); setCurrentPage(1); }}
                className="w-full px-3 py-2 rounded-full border border-white/20 bg-[#13141a] text-foreground text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              >
                <option value="">(todos)</option>
                <option value="air">AIR</option>
                <option value="chb">CHB</option>
                <option value="maritimo">SEA</option>
                <option value="fin">FIN</option>
                <option value="olimpo">OLIMPO</option>
                <option value="admin">ADMIN</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground block mb-1">Registros por página</label>
              <select
                value={perPage}
                onChange={(e) => { setPerPage(Number(e.target.value)); setCurrentPage(1); }}
                className="w-full px-3 py-2 rounded-full border border-white/20 bg-[#13141a] text-foreground text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
            </div>

            <button
              onClick={clearFilters}
              className="flex items-center gap-2 px-4 py-2 rounded-full border border-white/20 bg-white/5 text-foreground text-sm font-semibold uppercase tracking-[0.12em] hover:bg-white/10 transition-all w-full justify-center"
            >
              <RotateCcw size={14} />
              Limpar
            </button>
          </div>
        </PageCard>
      </div>

      {/* Uso por Módulo */}
      <PageCard>
        <div className="flex justify-between items-end gap-3 mb-3">
          <div>
            <div className="text-sm uppercase tracking-[0.18em] font-semibold">Uso por Módulo</div>
            <p className="text-xs text-muted-foreground">
              Acessos, usuários únicos e tempo médio estimado na tela por módulo (gap entre eventos consecutivos, capado em 30 min).
            </p>
          </div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
            {loadingModules ? "Carregando..." : `${moduleStats.length} módulos`}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {moduleStats.length === 0 && !loadingModules ? (
            <div className="col-span-full text-center text-muted-foreground text-sm py-6">
              Sem atividade no período.
            </div>
          ) : (
            moduleStats.filter((m) => m.module?.toLowerCase() !== "admin").map((m) => {
              const mins = Math.floor(m.avgTimeOnScreenSec / 60);
              const secs = m.avgTimeOnScreenSec % 60;
              const timeLabel = m.avgTimeOnScreenSec > 0
                ? (mins > 0 ? `${mins}m ${secs}s` : `${secs}s`)
                : "—";
              const isActive = moduleFilter === m.module;
              return (
                <button
                  key={m.module}
                  onClick={() => { setModuleFilter(isActive ? "" : m.module); setCurrentPage(1); }}
                  className={`text-left rounded-xl p-3 border transition-all hover:bg-white/5 ${
                    isActive
                      ? "border-primary/60 bg-primary/5 shadow-[0_0_0_1px_rgba(255,200,0,0.4)]"
                      : "border-white/10 bg-[#0a0b10]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] uppercase tracking-[0.16em] font-semibold text-primary">
                      {m.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{m.totalAccesses} acessos</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-[9px] uppercase tracking-[0.1em] text-muted-foreground">Usuários</div>
                      <div className="text-base font-bold">{m.uniqueUsers}</div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase tracking-[0.1em] text-muted-foreground">Tempo médio</div>
                      <div className="text-base font-bold">{timeLabel}</div>
                    </div>
                  </div>
                  {m.topEndpoint && (() => {
                    const pretty = prettifyEndpoint(m.topEndpoint);
                    return (
                      <div className="mt-2 pt-2 border-t border-white/10">
                        <div className="text-[9px] uppercase tracking-[0.1em] text-muted-foreground">Top endpoint</div>
                        <div className="text-[11px] truncate text-foreground/80" title={m.topEndpoint}>
                          <span className="truncate">{pretty.label}</span>
                        </div>
                      </div>
                    );
                  })()}
                </button>
              );
            })
          )}
        </div>
      </PageCard>

      {/* Sessões */}
      <PageCard>
        <div className="flex justify-between items-end gap-3 mb-3">
          <div>
            <div className="text-sm uppercase tracking-[0.18em] font-semibold">Sessões</div>
            <p className="text-xs text-muted-foreground">
              Cada linha é uma sessão (1 aba do navegador). Clique para ver a timeline cronológica de telas visitadas.
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/12 text-xs">
            <span className="w-2 h-2 rounded-full bg-primary" />
            {loadingSessions ? "Carregando..." : `${sessions.length} sessão(ões)`}
          </div>
        </div>

        <div className="max-h-[60vh] overflow-auto rounded-xl border border-white/12">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#14151c] sticky top-0 z-10">
                <th className="py-2.5 px-3 w-8" />
                <th className="py-2.5 px-3 text-left text-[11px] uppercase tracking-[0.12em] font-medium text-muted-foreground">Usuário</th>
                <th className="py-2.5 px-3 text-left text-[11px] uppercase tracking-[0.12em] font-medium text-muted-foreground">Início</th>
                <th className="py-2.5 px-3 text-left text-[11px] uppercase tracking-[0.12em] font-medium text-muted-foreground">Fim</th>
                <th className="py-2.5 px-3 text-left text-[11px] uppercase tracking-[0.12em] font-medium text-muted-foreground">Tempo ativo</th>
                <th className="py-2.5 px-3 text-left text-[11px] uppercase tracking-[0.12em] font-medium text-muted-foreground">Eventos</th>
                <th className="py-2.5 px-3 text-left text-[11px] uppercase tracking-[0.12em] font-medium text-muted-foreground">Telas únicas</th>
              </tr>
            </thead>
            <tbody>
              {loadingSessions ? (
                <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">Carregando...</td></tr>
              ) : sessions.length === 0 ? (
                <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">
                  Nenhuma sessão registrada no período. Sessões só aparecem após o próximo acesso (precisa do session_id gravado).
                </td></tr>
              ) : (
                sessions.map((s) => {
                  const isOpen = expandedSession === s.sessionId;

                  // ===== Tempo ativo real (soma dos #dur=ms dos eventos VO) =====
                  const activeMsTotal = s.events.reduce((acc, ev) => {
                    if (ev.method === "VO" || ev.method === "V_OUT" || ev.method === "VIEW_END") {
                      const m = ev.endpoint.match(/#dur=(\d+)$/);
                      if (m) return acc + Number(m[1]);
                    }
                    return acc;
                  }, 0);
                  const activeSecTotal = Math.round(activeMsTotal / 1000);

                  // ===== Telas únicas (ignora event:* e desduplica por endpoint limpo) =====
                  const uniqueScreens = new Set<string>();
                  s.events.forEach((ev) => {
                    const cleaned = ev.endpoint.replace(/#dur=\d+$/, "");
                    if (cleaned.startsWith("event:")) return;
                    uniqueScreens.add(cleaned);
                  });

                  // ===== Resumo por tela (apenas eventos VO contam como tempo) =====
                  const screenSummary = new Map<string, { visits: number; ms: number }>();
                  s.events.forEach((ev) => {
                    const isOut =
                      ev.method === "VO" || ev.method === "V_OUT" || ev.method === "VIEW_END";
                    if (!isOut) return;
                    const m = ev.endpoint.match(/#dur=(\d+)$/);
                    const cleaned = ev.endpoint.replace(/#dur=\d+$/, "");
                    if (cleaned.startsWith("event:")) return;
                    const cur = screenSummary.get(cleaned) || { visits: 0, ms: 0 };
                    cur.visits += 1;
                    cur.ms += m ? Number(m[1]) : 0;
                    screenSummary.set(cleaned, cur);
                  });
                  const summaryRows = Array.from(screenSummary.entries())
                    .map(([endpoint, agg]) => ({ endpoint, ...agg, pretty: prettifyEndpoint(endpoint) }))
                    .sort((a, b) => b.ms - a.ms);

                  return (
                    <>
                      <tr
                        key={s.sessionId}
                        className="border-b border-white/10 hover:bg-white/5 transition-colors cursor-pointer"
                        onClick={() => setExpandedSession(isOpen ? null : s.sessionId)}
                      >
                        <td className="py-2.5 px-3 text-muted-foreground">{isOpen ? "▾" : "▸"}</td>
                        <td className="py-2.5 px-3 font-medium">{s.username}</td>
                        <td className="py-2.5 px-3 text-muted-foreground">{formatDate(s.startedAt)}</td>
                        <td className="py-2.5 px-3 text-muted-foreground">{formatDate(s.endedAt)}</td>
                        <td className="py-2.5 px-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] border border-primary/40 bg-primary/10 text-primary">
                            {formatDuration(activeSecTotal)}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">{s.eventCount}</td>
                        <td className="py-2.5 px-3 text-muted-foreground">{uniqueScreens.size}</td>
                      </tr>
                      {isOpen && (
                        <tr key={`${s.sessionId}-timeline`} className="bg-[#0a0b10]">
                          <td colSpan={7} className="px-4 py-3">
                            <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground mb-3 flex items-center gap-3 flex-wrap">
                              <span>Sessão · ID: <span className="font-mono">{s.sessionId.slice(0, 8)}…</span></span>
                              {activeSecTotal > 0 && (
                                <span className="text-primary normal-case tracking-normal">
                                  Tempo ativo total: <span className="font-semibold">{formatDuration(activeSecTotal)}</span>
                                </span>
                              )}
                            </div>

                            {/* ===== Bloco A: Resumo por tela ===== */}
                            {summaryRows.length > 0 && (
                              <div className="mb-4 rounded-xl border border-white/10 bg-[#05060c] overflow-hidden">
                                <div className="px-3 py-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground border-b border-white/10 bg-white/[0.02]">
                                  Resumo por tela
                                </div>
                                <div className="divide-y divide-white/5">
                                  {summaryRows.map((row) => (
                                    <div key={row.endpoint} className="flex items-center gap-3 px-3 py-2 text-xs">
                                      <div className="flex-1 min-w-0">
                                        <div className="text-foreground/90 truncate">{row.pretty.label}</div>
                                        <div className="text-[10px] text-muted-foreground truncate">{row.pretty.module}</div>
                                      </div>
                                      <div className="text-right shrink-0">
                                        <div className="text-primary font-semibold tabular-nums">
                                          {formatDuration(Math.round(row.ms / 1000))}
                                        </div>
                                        <div className="text-[10px] text-muted-foreground">
                                          {row.visits} visita{row.visits > 1 ? "s" : ""}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* ===== Bloco B: Cronológico limpo ===== */}
                            <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground mb-2">
                              Cronológico
                            </div>
                            <ol className="relative border-l border-white/15 ml-2 space-y-2">
                              {s.events
                                .filter((ev) => {
                                  // Esconde V_IN (entradas) — redundantes com V_OUT
                                  if (ev.method === "VI" || ev.method === "V_IN") return false;
                                  return true;
                                })
                                .map((ev, idx) => {
                                  const isOut =
                                    ev.method === "VO" || ev.method === "V_OUT" || ev.method === "VIEW_END";
                                  const durMatch = isOut ? ev.endpoint.match(/#dur=(\d+)$/) : null;
                                  const explicitDurSec = durMatch ? Math.round(Number(durMatch[1]) / 1000) : null;
                                  const cleaned = ev.endpoint.replace(/#dur=\d+$/, "");
                                  const pretty = prettifyEndpoint(cleaned);
                                  const isEvent = cleaned.startsWith("event:") || pretty.isAction;
                                  const time = formatDate(ev.event_time).split(" ")[1] || formatDate(ev.event_time);
                                  return (
                                    <li key={`${ev.event_time}-${idx}`} className="ml-3 pl-2">
                                      <div
                                        className={`absolute -left-1.5 mt-1 w-3 h-3 rounded-full border border-black ${
                                          isEvent ? "bg-emerald-400" : "bg-primary"
                                        }`}
                                      />
                      <div className="flex items-center gap-2 text-xs flex-wrap">
                                        <span className="text-muted-foreground tabular-nums">
                                          {time}
                                        </span>
                                        <span className="text-foreground/90 truncate">{pretty.label}</span>
                                        {!isEvent && (
                                          <span className="text-[10px] text-muted-foreground">
                                            · {pretty.module}
                                          </span>
                                        )}
                                        {explicitDurSec !== null && explicitDurSec > 0 && (
                                          <span className="text-[10px] text-primary">
                                            · permaneceu {formatDuration(explicitDurSec)}
                                          </span>
                                        )}
                                      </div>
                                    </li>
                                  );
                                })}
                            </ol>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <TablePagination
          currentPage={sessionsPage}
          totalPages={sessionsTotalPages}
          onPageChange={setSessionsPage}
        />
      </PageCard>

      {/* Table Section */}
      <PageCard>
        <div className="flex justify-between items-end gap-3 mb-3">
          <div>
            <div className="text-sm uppercase tracking-[0.18em] font-semibold">Resumo de Logs</div>
            <p className="text-xs text-muted-foreground">Eventos individuais de consumo por usuário, método e endpoint.</p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={handleExportExcel}
              variant="outline"
              size="sm"
              className="h-8 rounded-full"
              disabled={logs.length === 0}
            >
              <Download className="w-4 h-4 mr-1" /> Excel
            </Button>
            <Button
              onClick={handleExportPDF}
              variant="outline"
              size="sm"
              className="h-8 rounded-full"
              disabled={logs.length === 0}
            >
              <FileText className="w-4 h-4 mr-1" /> PDF
            </Button>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/12 text-xs">
              <span className="w-2 h-2 rounded-full bg-primary" />
              {stats.total} logs encontrados
            </div>
          </div>
        </div>

        <div className="max-h-[52vh] overflow-auto rounded-xl border border-white/12">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#14151c] sticky top-0 z-10">
                <th className="py-2.5 px-3 text-left text-[11px] uppercase tracking-[0.12em] font-medium text-muted-foreground w-[20%]">Data / Hora</th>
                <th className="py-2.5 px-3 text-left text-[11px] uppercase tracking-[0.12em] font-medium text-muted-foreground w-[16%]">Usuário</th>
                <th className="py-2.5 px-3 text-left text-[11px] uppercase tracking-[0.12em] font-medium text-muted-foreground w-[10%]">Método</th>
                <th className="py-2.5 px-3 text-left text-[11px] uppercase tracking-[0.12em] font-medium text-muted-foreground">Endpoint</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">Carregando...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">Sem registros no período.</td></tr>
              ) : (
                logs.map((log) => {
                  const pretty = prettifyEndpoint(log.endpoint);
                  const method = prettifyMethod(log.method);
                  const cleanedRaw = log.endpoint.replace(/#dur=\d+$/, "");
                  return (
                    <tr key={log.id} className="border-b border-white/10 hover:bg-white/5 transition-colors">
                      <td className="py-2.5 px-3">{formatDate(log.event_time)}</td>
                      <td className="py-2.5 px-3">{log.username}</td>
                      <td className="py-2.5 px-3">
                        <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full text-[11px] border ${getMethodClass(log.method)}`}>
                          {method.label}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <div className="min-w-0">
                            <div className="text-foreground/90 truncate">{pretty.label}</div>
                            <div className="text-[10px] text-muted-foreground font-mono truncate">{cleanedRaw}</div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
      </PageCard>

      {/* Footer */}
      <div className="text-center text-[10px] text-muted-foreground uppercase tracking-[0.16em]">
        Z3US.AI • For Logistics
      </div>
    </PageLayout>
  );
};

export default MetricsUsage;
