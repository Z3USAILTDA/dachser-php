import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ChartLine, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import logoZ3us from "@/assets/logo-z3us.png";
import dachserBg from "@/assets/dachser-background.jpg";
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
  const [user, setUser] = useState<{ id: number; username: string; is_admin: number } | null>(null);
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

  // Filtros
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

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      if (parsedUser.is_admin !== 1) {
        navigate("/dashboard");
        return;
      }
      setUser(parsedUser);
    } else {
      navigate("/");
    }
  }, [navigate]);

  useEffect(() => {
    if (user?.is_admin === 1) {
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

  if (!user) return null;

  return (
    <div className="min-h-screen relative overflow-x-hidden">
      {/* Background */}
      <div className="fixed inset-0">
        <img
          src={dachserBg}
          alt="DACHSER Logistics"
          className="w-full h-full object-cover"
          style={{ filter: "saturate(0.8)" }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(circle at 10% 0%, rgba(255, 200, 0, 0.22), transparent 55%),
              radial-gradient(circle at 90% 100%, rgba(255, 200, 0, 0.16), transparent 55%),
              linear-gradient(180deg, rgba(0, 0, 0, 0.7), rgba(0, 0, 0, 0.82))
            `,
          }}
        />
      </div>

      {/* Top Left - Back + Header */}
      <div className="relative z-50 flex items-center gap-5 pt-5 pl-2 mb-4">
        <button
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-primary/90 bg-primary/15 text-primary font-bold text-sm backdrop-blur-sm hover:bg-primary/25 transition-all"
        >
          <ArrowLeft size={16} />
          <span>Voltar</span>
        </button>

        <header>
          <h1 className="text-2xl font-bold tracking-[0.24em] text-foreground">DACHSER</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Intelligent Logistics – Métricas de Uso
          </p>
          <div className="flex gap-1.5 mt-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_10px_hsl(var(--primary))]" />
            <span className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_10px_hsl(var(--primary))]" />
            <span className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_10px_hsl(var(--primary))]" />
          </div>
        </header>
      </div>

      {/* Top Right - User */}
      <div className="fixed top-5 right-2 z-50 flex items-center gap-2.5 text-sm">
        <div className="px-4 py-1.5 rounded-full bg-background/70 border border-border/30 text-muted-foreground max-w-[220px] truncate">
          @{user?.username}
        </div>
        <div className="w-8 h-8 rounded-full border border-border/25 flex items-center justify-center bg-background/70 text-primary">
          <ChartLine size={16} />
        </div>
      </div>

      {/* Main Content */}
      <main className="relative z-10 max-w-[95%] mx-auto pt-4 pb-6 px-2">
        {/* Grid: Stats + Filters */}
        <div className="grid grid-cols-1 lg:grid-cols-[2.2fr_1.2fr] gap-5 mb-5">
          {/* Stats Panel */}
          <section className="bg-background rounded-2xl border border-border/30 shadow-[0_18px_40px_rgba(0,0,0,0.85)] p-5">
            <div className="flex items-center justify-between text-sm uppercase tracking-[0.18em]">
              <span className="font-semibold">Métricas Gerais</span>
              <span className="text-muted-foreground text-xs normal-case tracking-normal">
                Período: {new Date(dateFrom).toLocaleDateString("pt-BR")} –{" "}
                {new Date(dateTo).toLocaleDateString("pt-BR")} ({getDaysDiff()} dias)
              </span>
            </div>

            {/* Chips */}
            <div className="flex flex-wrap gap-2 mt-3">
              <div className="px-3 py-1.5 rounded-full border border-border/50 bg-card text-xs flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                Logs internos
              </div>
              {usernameFilter && (
                <div className="px-3 py-1.5 rounded-full border border-border/50 bg-card text-xs">
                  Usuário: {usernameFilter}
                </div>
              )}
              {moduleFilter && (
                <div className="px-3 py-1.5 rounded-full border border-border/50 bg-card text-xs">
                  Módulo: {moduleFilter.toUpperCase()}
                </div>
              )}
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
              <div className="p-3 rounded-xl bg-card border border-border/50">
                <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                  Total de Logs
                </div>
                <div className="text-xl font-bold mt-1">{stats.total}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {stats.avgPerDay.toFixed(1)} / dia (média)
                </div>
              </div>
              <div className="p-3 rounded-xl bg-card border border-border/50">
                <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                  Usuários distintos
                </div>
                <div className="text-xl font-bold mt-1">{stats.distinctUsers}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {stats.distinctUsers ? "Atividade distribuída" : "Sem uso no período"}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-card border border-border/50">
                <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                  Endpoints distintos
                </div>
                <div className="text-xl font-bold mt-1">{stats.distinctEndpoints}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  Cobertura de features
                </div>
              </div>
              <div className="p-3 rounded-xl bg-card border border-border/50">
                <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                  Métodos GET x POST
                </div>
                <div className="text-xl font-bold mt-1">
                  {stats.getCalls} / {stats.postCalls}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">GET / POST</div>
              </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 md:grid-cols-[1.3fr_1fr] gap-3 mt-5">
              <div className="rounded-xl bg-[#05060c] border border-border/20 p-3">
                <div className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground mb-1">
                  Logs por Dia
                </div>
                <div className="text-[10px] text-muted-foreground mb-2">
                  Volume diário de chamadas no período filtrado.
                </div>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dailyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis
                        dataKey="date"
                        tick={{ fill: "#ccc", fontSize: 10 }}
                        axisLine={false}
                      />
                      <YAxis
                        tick={{ fill: "#ccc", fontSize: 10 }}
                        axisLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "#111",
                          border: "1px solid rgba(255,200,0,0.3)",
                          borderRadius: "8px",
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="total"
                        stroke="#ffc800"
                        strokeWidth={2}
                        dot={{ r: 3, fill: "#ffc800" }}
                        fill="rgba(255,200,0,0.15)"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-xl bg-[#05060c] border border-border/20 p-3">
                <div className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground mb-1">
                  Top 5 Endpoints
                </div>
                <div className="text-[10px] text-muted-foreground mb-2">
                  Endpoints mais acionados no período.
                </div>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={endpointData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis type="number" tick={{ fill: "#ccc", fontSize: 10 }} />
                      <YAxis
                        type="category"
                        dataKey="endpoint"
                        tick={{ fill: "#ccc", fontSize: 9 }}
                        width={100}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "#111",
                          border: "1px solid rgba(255,200,0,0.3)",
                          borderRadius: "8px",
                        }}
                      />
                      <Bar dataKey="total" fill="rgba(255,200,0,0.7)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </section>

          {/* Filters Panel */}
          <aside className="bg-background rounded-2xl border border-border/30 shadow-[0_18px_40px_rgba(0,0,0,0.85)] p-5">
            <div className="text-sm uppercase tracking-[0.18em] font-semibold">
              Visão de Filtros
            </div>
            <p className="text-xs text-muted-foreground mt-1 mb-4">
              Refine por período, usuário e módulo.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground block mb-1">
                  De
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-3 py-2 rounded-full border border-border/30 bg-[#13141a] text-foreground text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground block mb-1">
                  Até
                </label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-3 py-2 rounded-full border border-border/30 bg-[#13141a] text-foreground text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground block mb-1">
                  Usuário
                </label>
                <input
                  type="text"
                  placeholder="login..."
                  value={usernameFilter}
                  onChange={(e) => {
                    setUsernameFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-3 py-2 rounded-full border border-border/30 bg-[#13141a] text-foreground text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground block mb-1">
                  Módulo
                </label>
                <select
                  value={moduleFilter}
                  onChange={(e) => {
                    setModuleFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-3 py-2 rounded-full border border-border/30 bg-[#13141a] text-foreground text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  <option value="">(todos)</option>
                  <option value="air">AIR</option>
                  <option value="chb">CHB</option>
                  <option value="maritime">MARITIME</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground block mb-1">
                  Registros por página
                </label>
                <select
                  value={perPage}
                  onChange={(e) => {
                    setPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="w-full px-3 py-2 rounded-full border border-border/30 bg-[#13141a] text-foreground text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                </select>
              </div>

              <button
                onClick={clearFilters}
                className="flex items-center gap-2 px-4 py-2 rounded-full border border-border/30 bg-background/50 text-foreground text-sm font-semibold uppercase tracking-[0.12em] hover:bg-background/70 transition-all"
              >
                <RotateCcw size={14} />
                Limpar
              </button>
            </div>
          </aside>
        </div>

        {/* Table Section */}
        <section className="bg-background rounded-2xl border border-border/30 shadow-[0_18px_40px_rgba(0,0,0,0.9)] p-4">
          <div className="flex justify-between items-end gap-3 mb-3">
            <div>
              <div className="text-sm uppercase tracking-[0.18em] font-semibold">
                Resumo de Logs
              </div>
              <p className="text-xs text-muted-foreground">
                Eventos individuais de consumo por usuário, método e endpoint.
              </p>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-background/50 border border-border/30 text-xs">
              <span className="w-2 h-2 rounded-full bg-primary" />
              {stats.total} logs encontrados
            </div>
          </div>

          <div className="max-h-[52vh] overflow-auto rounded-xl border border-border/30">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#14151c] sticky top-0 z-10">
                  <th className="py-2.5 px-3 text-left text-[11px] uppercase tracking-[0.12em] font-medium text-muted-foreground w-[20%]">
                    Data / Hora
                  </th>
                  <th className="py-2.5 px-3 text-left text-[11px] uppercase tracking-[0.12em] font-medium text-muted-foreground w-[16%]">
                    Usuário
                  </th>
                  <th className="py-2.5 px-3 text-left text-[11px] uppercase tracking-[0.12em] font-medium text-muted-foreground w-[10%]">
                    Método
                  </th>
                  <th className="py-2.5 px-3 text-left text-[11px] uppercase tracking-[0.12em] font-medium text-muted-foreground">
                    Endpoint
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-muted-foreground">
                      Carregando...
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-muted-foreground">
                      Sem registros no período.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr
                      key={log.id}
                      className="border-b border-border/20 hover:bg-background/50 transition-colors"
                    >
                      <td className="py-2.5 px-3">{formatDate(log.event_time)}</td>
                      <td className="py-2.5 px-3">{log.username}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full text-[11px] border ${getMethodClass(
                            log.method
                          )}`}
                        >
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
          {totalPages > 1 && (
            <div className="flex flex-wrap gap-1.5 justify-end mt-3 text-xs">
              {currentPage > 1 && (
                <>
                  <button
                    onClick={() => setCurrentPage(1)}
                    className="px-3 py-1.5 rounded-full border border-border/30 bg-background/50 hover:bg-background/70"
                  >
                    « Primeiro
                  </button>
                  <button
                    onClick={() => setCurrentPage((p) => p - 1)}
                    className="px-3 py-1.5 rounded-full border border-border/30 bg-background/50 hover:bg-background/70"
                  >
                    ‹ Anterior
                  </button>
                </>
              )}

              {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                const page = Math.max(1, currentPage - 3) + i;
                if (page > totalPages) return null;
                return (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`px-3 py-1.5 rounded-full border ${
                      page === currentPage
                        ? "border-primary/90 bg-primary/20 text-primary font-bold"
                        : "border-border/30 bg-background/50 hover:bg-background/70"
                    }`}
                  >
                    {page}
                  </button>
                );
              })}

              {currentPage < totalPages && (
                <>
                  <button
                    onClick={() => setCurrentPage((p) => p + 1)}
                    className="px-3 py-1.5 rounded-full border border-border/30 bg-background/50 hover:bg-background/70"
                  >
                    Próxima ›
                  </button>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    className="px-3 py-1.5 rounded-full border border-border/30 bg-background/50 hover:bg-background/70"
                  >
                    Última »
                  </button>
                </>
              )}
            </div>
          )}
        </section>

        {/* Footer */}
        <div className="mt-5 text-center text-[10px] text-muted-foreground uppercase tracking-[0.16em]">
          Z3US.AI • For Logistics
        </div>
      </main>
    </div>
  );
};

export default MetricsUsage;
