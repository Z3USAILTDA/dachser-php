import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ChartLine, RotateCcw, Download, FileText, HelpCircle } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { TablePagination } from "@/components/layout/TablePagination";
import { supabase } from "@/integrations/supabase/client";
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

  const today = new Date();
  const defaultFrom = new Date(today);
  defaultFrom.setDate(defaultFrom.getDate() - 7);

  const [dateFrom, setDateFrom] = useState(defaultFrom.toISOString().split("T")[0]);
  const [dateTo, setDateTo] = useState(today.toISOString().split("T")[0]);
  const [usernameFilter, setUsernameFilter] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [perPage, setPerPage] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Fetch available users for the filter dropdown
  useEffect(() => {
    const fetchAvailableUsers = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
          body: { action: "get_metric_users" },
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
    }
  }, [user, dateFrom, dateTo, usernameFilter, moduleFilter, perPage, currentPage]);

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
    setDateFrom(newFrom.toISOString().split("T")[0]);
    setDateTo(new Date().toISOString().split("T")[0]);
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
    const date = new Date(dateStr);
    return date.toLocaleDateString("pt-BR") + " " + date.toLocaleTimeString("pt-BR");
  };

  const handleExportExcel = () => {
    if (logs.length === 0) {
      toast({ title: "Aviso", description: "Nenhum dado para exportar", variant: "destructive" });
      return;
    }

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
                logs.map((log) => (
                  <tr key={log.id} className="border-b border-white/10 hover:bg-white/5 transition-colors">
                    <td className="py-2.5 px-3">{formatDate(log.event_time)}</td>
                    <td className="py-2.5 px-3">{log.username}</td>
                    <td className="py-2.5 px-3">
                      <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full text-[11px] border ${getMethodClass(log.method)}`}>
                        {log.method}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-muted-foreground">{log.endpoint}</td>
                  </tr>
                ))
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
