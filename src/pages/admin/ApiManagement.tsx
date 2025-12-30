import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, Server, TrendingUp, AlertCircle, RefreshCw, Loader2, Calendar, DollarSign, LayoutDashboard, BarChart3, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChartTooltip } from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell } from "recharts";
import { cn } from "@/lib/utils";
import { PageLayout } from "@/components/layout/PageLayout";
import { PageCard } from "@/components/layout/PageCard";

interface ApiStats {
  api_name: string;
  total_calls: number;
  last_call: string | null;
  avg_response_time_ms: number | null;
  error_count: number;
  success_rate: number;
}

interface ApiUsageLog {
  id: number;
  api_name: string;
  endpoint: string;
  method: string;
  status_code: number;
  response_time_ms: number;
  created_at: string;
  user_email: string | null;
}

interface DailyTrend {
  date: string;
  api_name: string;
  calls: number;
  errors: number;
  avg_response_time: number;
}

interface DailyTotal {
  date: string;
  total_calls: number;
  total_errors: number;
}

// Preços estimados por chamada (em USD)
interface ApiPricing {
  costPerCall: number;
  unit: string;
  notes: string;
}

const API_PRICING: Record<string, ApiPricing> = {
  "Anthropic": { 
    costPerCall: 0.015,
    unit: "por chamada (~1K tokens)",
    notes: "Claude 3.5 Sonnet: $3/1M input, $15/1M output"
  },
  "LovableAI": { 
    costPerCall: 0.002,
    unit: "por chamada (~1K tokens)",
    notes: "Gemini 2.5 Flash via Lovable Gateway"
  },
  "Resend": { 
    costPerCall: 0.001,
    unit: "por email",
    notes: "$1/1000 emails após tier gratuito"
  },
  "JSONCargo": { 
    costPerCall: 0.05,
    unit: "por consulta",
    notes: "Preço estimado - verificar contrato"
  },
  "FlightRadar": { 
    costPerCall: 0.02,
    unit: "por consulta",
    notes: "Preço estimado - verificar plano contratado"
  },
  "Leadcomex": { 
    costPerCall: 0.01,
    unit: "por chamada",
    notes: "Preço estimado - verificar contrato"
  },
};

const RESTRICTED_USERS = ["ana.tozzo"];

const API_COLORS: Record<string, string> = {
  "JSONCargo": "#3b82f6",
  "Anthropic": "#8b5cf6",
  "LovableAI": "#10b981",
  "Resend": "#f59e0b",
  "FlightRadar": "#ef4444",
  "Leadcomex": "#06b6d4",
};

const getApiColor = (apiName: string): string => {
  return API_COLORS[apiName] || "#6b7280";
};

const getApiCost = (apiName: string, calls: number): number => {
  const pricing = API_PRICING[apiName];
  if (!pricing) return 0;
  return calls * pricing.costPerCall;
};

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-US', { 
    style: 'currency', 
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
};

// Dashboard Tab Component - API Cards
const DashboardTab = ({ 
  apiStats, 
  isLoading,
  formatDate,
  getStatusColor 
}: { 
  apiStats: ApiStats[];
  isLoading: boolean;
  formatDate: (dateStr: string | null) => string;
  getStatusColor: (successRate: number) => string;
}) => {
  return (
    <div className="space-y-5 animate-fade-in">
      {/* API Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          <div className="col-span-full flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-[#ffc800] animate-spin" />
          </div>
        ) : apiStats.length === 0 ? (
          <div className="col-span-full flex flex-col items-center justify-center py-12 text-center">
            <Server className="w-12 h-12 text-white/30 mb-4" />
            <p className="text-white/60 text-lg font-medium">Nenhum dado de API registrado</p>
            <p className="text-white/40 text-sm mt-2 max-w-md">
              As estatísticas aparecerão aqui conforme as edge functions forem instrumentadas para registrar chamadas de API.
            </p>
          </div>
        ) : (
          apiStats.map((api) => {
            const cost = getApiCost(api.api_name, Number(api.total_calls || 0));
            return (
              <PageCard key={api.api_name} className="hover:border-white/20 transition">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getApiColor(api.api_name) }} />
                    <span className="text-base font-semibold text-white">{api.api_name}</span>
                  </div>
                  <Badge className={getStatusColor(Number(api.success_rate || 0))}>
                    {Number(api.success_rate || 0).toFixed(1)}%
                  </Badge>
                </div>
                <p className="text-[10px] text-muted-foreground mb-3">
                  Última chamada: {formatDate(api.last_call)}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-2 rounded-lg bg-[#0a0b10] border border-white/10">
                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Chamadas</div>
                    <div className="text-lg font-bold text-white mt-0.5">
                      {Number(api.total_calls || 0).toLocaleString()}
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-[#0a0b10] border border-white/10">
                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Custo Est.</div>
                    <div className="text-lg font-bold text-emerald-400 mt-0.5">
                      {formatCurrency(cost)}
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-[#0a0b10] border border-white/10">
                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Tempo Médio</div>
                    <div className="text-lg font-bold text-white mt-0.5">
                      {api.avg_response_time_ms ? `${Number(api.avg_response_time_ms)}ms` : "N/A"}
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-[#0a0b10] border border-white/10">
                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Erros</div>
                    <div className={`text-lg font-bold mt-0.5 ${Number(api.error_count || 0) > 0 ? "text-red-400" : "text-green-400"}`}>
                      {Number(api.error_count || 0)}
                    </div>
                  </div>
                </div>
              </PageCard>
            );
          })
        )}
      </div>

      {/* Info Note */}
      <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
        <p className="text-blue-300 text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>
            Os dados exibidos são baseados nos logs de uso do sistema. Para implementar um tracking mais detalhado,
            é necessário adicionar instrumentação nas edge functions que fazem chamadas às APIs externas.
          </span>
        </p>
      </div>
    </div>
  );
};

// Analytics Tab Component - Charts and Trends
const AnalyticsTab = ({
  apiStats,
  dailyTrend,
  dailyTotal,
  isLoading,
  selectedPeriod,
  setSelectedPeriod
}: {
  apiStats: ApiStats[];
  dailyTrend: DailyTrend[];
  dailyTotal: DailyTotal[];
  isLoading: boolean;
  selectedPeriod: "7" | "30";
  setSelectedPeriod: (period: "7" | "30") => void;
}) => {
  const formatShortDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  };

  // Filter data based on selected period
  const getFilteredData = <T extends { date: string }>(data: T[]): T[] => {
    const days = parseInt(selectedPeriod);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return data.filter(item => new Date(item.date) >= cutoff);
  };

  // Transform daily trend data for chart (pivot by API)
  const getChartData = () => {
    const filtered = getFilteredData(dailyTrend);
    const grouped: Record<string, Record<string, number>> = {};
    
    filtered.forEach(item => {
      if (!grouped[item.date]) {
        grouped[item.date] = { date: item.date } as any;
      }
      grouped[item.date][item.api_name] = Number(item.calls || 0);
    });

    return Object.values(grouped).map(item => ({
      ...item,
      date: formatShortDate(item.date as unknown as string)
    }));
  };

  // Get unique API names for chart legend
  const getUniqueApis = (): string[] => {
    return [...new Set(dailyTrend.map(item => item.api_name))];
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-[#ffc800] animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Trend Charts Section */}
      {dailyTotal.length > 0 && (
        <PageCard>
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm uppercase tracking-[0.18em] font-semibold flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[#ffc800]" />
                Tendência de Uso
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Chamadas de API ao longo do tempo
              </p>
            </div>
            <Tabs value={selectedPeriod} onValueChange={(v) => setSelectedPeriod(v as "7" | "30")}>
              <TabsList className="bg-[#0a0b10] border border-white/10">
                <TabsTrigger value="7" className="data-[state=active]:bg-[#ffc800] data-[state=active]:text-black text-white/70 text-xs">
                  <Calendar className="w-3 h-3 mr-1" />
                  7 dias
                </TabsTrigger>
                <TabsTrigger value="30" className="data-[state=active]:bg-[#ffc800] data-[state=active]:text-black text-white/70 text-xs">
                  <Calendar className="w-3 h-3 mr-1" />
                  30 dias
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Total Calls Chart */}
            <div className="rounded-xl bg-[#05060c] border border-white/10 p-3">
              <div className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground mb-1">Total de Chamadas por Dia</div>
              <div className="text-[10px] text-muted-foreground mb-2">Volume diário e erros no período.</div>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={getFilteredData(dailyTotal).map(d => ({ ...d, date: formatShortDate(d.date), total_calls: Number(d.total_calls || 0), total_errors: Number(d.total_errors || 0) }))}>
                    <defs>
                      <linearGradient id="colorCalls" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ffc800" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#ffc800" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                    <XAxis dataKey="date" tick={{ fill: "#ccc", fontSize: 10 }} axisLine={false} />
                    <YAxis tick={{ fill: "#ccc", fontSize: 10 }} axisLine={false} />
                    <ChartTooltip 
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="bg-[#111] border border-[rgba(255,200,0,0.3)] rounded-lg p-3">
                              <p className="text-white font-medium">{label}</p>
                              <p className="text-[#ffc800]">Chamadas: {payload[0].value}</p>
                              {payload[1] && <p className="text-red-400">Erros: {payload[1].value}</p>}
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Area type="monotone" dataKey="total_calls" stroke="#ffc800" fillOpacity={1} fill="url(#colorCalls)" strokeWidth={2} />
                    <Line type="monotone" dataKey="total_errors" stroke="#ef4444" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Per-API Chart */}
            <div className="rounded-xl bg-[#05060c] border border-white/10 p-3">
              <div className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground mb-1">Chamadas por API</div>
              <div className="text-[10px] text-muted-foreground mb-2">Distribuição por provedor no período.</div>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={getChartData()}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                    <XAxis dataKey="date" tick={{ fill: "#ccc", fontSize: 10 }} axisLine={false} />
                    <YAxis tick={{ fill: "#ccc", fontSize: 10 }} axisLine={false} />
                    <ChartTooltip 
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="bg-[#111] border border-[rgba(255,200,0,0.3)] rounded-lg p-3">
                              <p className="text-white font-medium mb-2">{label}</p>
                              {payload.map((entry: any, index: number) => (
                                <p key={index} style={{ color: entry.color }}>
                                  {entry.name}: {entry.value}
                                </p>
                              ))}
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    {getUniqueApis().map(api => (
                      <Bar key={api} dataKey={api} stackId="a" fill={getApiColor(api)} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {/* Legend */}
              <div className="flex flex-wrap gap-3 mt-3 justify-center">
                {getUniqueApis().map(api => (
                  <div key={api} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getApiColor(api) }} />
                    <span className="text-muted-foreground text-[10px]">{api}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </PageCard>
      )}

      {/* Cost Breakdown Section */}
      {apiStats.length > 0 && (
        <PageCard>
          <div className="text-sm uppercase tracking-[0.18em] font-semibold flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            Estimativa de Custos por API
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Custos estimados baseados nos preços públicos de cada provedor (últimos 30 dias)
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Cost Pie Chart */}
            <div className="rounded-xl bg-[#05060c] border border-white/10 p-3">
              <div className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground mb-1">Distribuição de Custos</div>
              <div className="text-[10px] text-muted-foreground mb-2">Percentual de gastos por API.</div>
              <div className="h-52 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={apiStats.map(api => ({
                        name: api.api_name,
                        value: getApiCost(api.api_name, Number(api.total_calls || 0)),
                        fill: getApiColor(api.api_name)
                      })).filter(d => d.value > 0)}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${formatCurrency(value)}`}
                      labelLine={{ stroke: 'rgba(255,255,255,0.3)' }}
                    >
                      {apiStats.map((api, index) => (
                        <Cell key={`cell-${index}`} fill={getApiColor(api.api_name)} />
                      ))}
                    </Pie>
                    <ChartTooltip 
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-[#111] border border-[rgba(255,200,0,0.3)] rounded-lg p-3">
                              <p className="text-white font-medium">{data.name}</p>
                              <p className="text-emerald-400">{formatCurrency(data.value)}</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Cost Table */}
            <div className="rounded-xl bg-[#05060c] border border-white/10 p-3">
              <div className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground mb-1">Detalhamento de Custos</div>
              <div className="text-[10px] text-muted-foreground mb-2">Custo estimado por API.</div>
              <div className="space-y-2 max-h-52 overflow-y-auto">
                {apiStats
                  .map(api => ({
                    ...api,
                    cost: getApiCost(api.api_name, Number(api.total_calls || 0)),
                    pricing: API_PRICING[api.api_name]
                  }))
                  .sort((a, b) => b.cost - a.cost)
                  .map(api => (
                    <div key={api.api_name} className="flex items-center justify-between p-2.5 bg-white/5 rounded-lg hover:bg-white/10 transition">
                      <div className="flex items-center gap-2.5">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getApiColor(api.api_name) }} />
                        <div>
                          <p className="text-white text-sm font-medium">{api.api_name}</p>
                          <p className="text-muted-foreground text-[9px]">
                            {api.pricing ? `${api.pricing.unit}` : 'Preço não configurado'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-emerald-400 font-semibold text-sm">{formatCurrency(api.cost)}</p>
                        <p className="text-muted-foreground text-[9px]">
                          {Number(api.total_calls || 0).toLocaleString()} chamadas
                        </p>
                      </div>
                    </div>
                  ))}
                
                {/* Total */}
                <div className="flex items-center justify-between p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg mt-2">
                  <div className="flex items-center gap-2.5">
                    <DollarSign className="w-4 h-4 text-emerald-400" />
                    <p className="text-white font-semibold text-sm">Total Estimado</p>
                  </div>
                  <p className="text-emerald-400 font-bold">
                    {formatCurrency(apiStats.reduce((sum, api) => sum + getApiCost(api.api_name, Number(api.total_calls || 0)), 0))}
                  </p>
                </div>
              </div>
            </div>
          </div>
          
          {/* Disclaimer */}
          <div className="mt-4 p-3 rounded-lg bg-[#ffc800]/10 border border-[#ffc800]/30">
            <p className="text-[#ffc800] text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>
                Os valores são estimativas baseadas nos preços públicos médios de cada provedor. 
                Os custos reais podem variar conforme o plano contratado, volume de tokens por chamada e taxas adicionais.
              </span>
            </p>
          </div>
        </PageCard>
      )}

      {dailyTotal.length === 0 && apiStats.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <BarChart3 className="w-12 h-12 text-white/30 mb-4" />
          <p className="text-white/60 text-lg font-medium">Sem dados de analytics</p>
          <p className="text-white/40 text-sm mt-2 max-w-md">
            Os gráficos de tendência aparecerão conforme mais dados forem coletados.
          </p>
        </div>
      )}
    </div>
  );
};

export default function ApiManagement() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [apiStats, setApiStats] = useState<ApiStats[]>([]);
  const [recentLogs, setRecentLogs] = useState<ApiUsageLog[]>([]);
  const [dailyTrend, setDailyTrend] = useState<DailyTrend[]>([]);
  const [dailyTotal, setDailyTotal] = useState<DailyTotal[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isRestricted, setIsRestricted] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<"7" | "30">("7");
  const [activeTab, setActiveTab] = useState<"dashboard" | "analytics">("dashboard");

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      const parsed = JSON.parse(storedUser);
      const adminStatus = parsed.is_admin === 1 || parsed.is_admin === "1" || parsed.is_admin === true;
      const username = parsed.username || parsed.email || "";
      
      if (RESTRICTED_USERS.includes(username.toLowerCase())) {
        setIsRestricted(true);
        toast.error("Acesso não autorizado a esta página");
        navigate("/dashboard");
        return;
      }
      
      setIsAdmin(adminStatus);
      if (!adminStatus) {
        toast.error("Acesso não autorizado");
        navigate("/dashboard");
      }
    } else {
      navigate("/");
    }
  }, [navigate]);

  useEffect(() => {
    if (isAdmin && !isRestricted) {
      fetchApiStats();
    }
  }, [isAdmin, isRestricted]);

  const fetchApiStats = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { action: "get_api_stats" },
      });

      if (error) throw error;

      if (data?.success) {
        setApiStats(data.stats || []);
        setRecentLogs(data.recent_logs || []);
        setDailyTrend(data.daily_trend || []);
        setDailyTotal(data.daily_total || []);
      } else {
        throw new Error(data?.error || "Erro ao buscar dados");
      }
    } catch (error) {
      console.error("Error fetching API stats:", error);
      toast.error("Erro ao carregar estatísticas de APIs");
      setApiStats([]);
      setRecentLogs([]);
      setDailyTrend([]);
      setDailyTotal([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchApiStats();
    setIsRefreshing(false);
    toast.success("Dados atualizados");
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleString("pt-BR");
  };

  const getStatusColor = (successRate: number) => {
    if (successRate >= 99) return "bg-emerald-500/15 border-emerald-500/80 text-emerald-400";
    if (successRate >= 95) return "bg-yellow-500/15 border-yellow-500/80 text-yellow-400";
    return "bg-red-500/15 border-red-500/80 text-red-400";
  };

  if (isRestricted) {
    return null;
  }

  const rightContent = (
    <div className="flex items-center gap-2.5">
      <Button
        onClick={handleRefresh}
        disabled={isRefreshing}
        className="bg-[#ffc800] hover:bg-[#e6b400] text-black rounded-full px-4 h-8 text-xs font-semibold"
      >
        {isRefreshing ? (
          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
        ) : (
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
        )}
        Atualizar
      </Button>
      <button
        onClick={() => navigate("/admin/manual")}
        className="w-8 h-8 rounded-full border border-white/25 flex items-center justify-center bg-black/70 text-gray-400 hover:text-[#ffc800] transition-colors"
        title="Manual do usuário"
      >
        <HelpCircle className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <PageLayout 
      title="DACHSER" 
      subtitle="Gerenciamento de APIs" 
      pageIcon={Server} 
      backTo="/dashboard"
      rightContent={rightContent}
    >
      {/* Summary Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="p-3 rounded-xl bg-[#0a0b10] border border-white/10">
          <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground flex items-center gap-1.5">
            <Activity className="w-3 h-3 text-blue-400" />
            Total Chamadas
          </div>
          <div className="text-xl font-bold mt-1">
            {isLoading ? "..." : apiStats.reduce((sum, api) => sum + Number(api.total_calls || 0), 0).toLocaleString()}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-[#0a0b10] border border-white/10">
          <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground flex items-center gap-1.5">
            <TrendingUp className="w-3 h-3 text-green-400" />
            Taxa Sucesso
          </div>
          <div className="text-xl font-bold mt-1">
            {isLoading ? "..." : (
              (apiStats.reduce((sum, api) => sum + Number(api.success_rate || 0), 0) / (apiStats.length || 1)).toFixed(1) + "%"
            )}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-[#0a0b10] border border-white/10">
          <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground flex items-center gap-1.5">
            <Server className="w-3 h-3 text-[#ffc800]" />
            APIs Ativas
          </div>
          <div className="text-xl font-bold mt-1">
            {isLoading ? "..." : apiStats.length}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-[#0a0b10] border border-white/10">
          <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground flex items-center gap-1.5">
            <AlertCircle className="w-3 h-3 text-red-400" />
            Total Erros
          </div>
          <div className="text-xl font-bold mt-1">
            {isLoading ? "..." : apiStats.reduce((sum, api) => sum + Number(api.error_count || 0), 0).toLocaleString()}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-[#0a0b10] border border-white/10">
          <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground flex items-center gap-1.5">
            <DollarSign className="w-3 h-3 text-emerald-400" />
            Custo Est. (30d)
          </div>
          <div className="text-xl font-bold text-emerald-400 mt-1">
            {isLoading ? "..." : formatCurrency(
              apiStats.reduce((sum, api) => sum + getApiCost(api.api_name, Number(api.total_calls || 0)), 0)
            )}
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <nav className="flex items-center gap-1 px-2 py-1.5 rounded-full bg-[rgba(5,6,18,0.85)] border border-white/10 backdrop-blur-sm w-fit">
        {[
          { id: "dashboard" as const, label: "Dashboard", icon: LayoutDashboard },
          { id: "analytics" as const, label: "Analytics", icon: BarChart3 },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-full text-[0.8rem] font-medium transition-all duration-200",
                isActive
                  ? "bg-[rgba(255,200,0,0.15)] text-[#ffc800] border border-[#ffc800]/40 shadow-[0_0_12px_rgba(255,200,0,0.3)]"
                  : "text-[#aaaaaa] hover:text-white hover:bg-white/5"
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Tab Content */}
      {activeTab === "dashboard" && (
        <DashboardTab 
          apiStats={apiStats}
          isLoading={isLoading}
          formatDate={formatDate}
          getStatusColor={getStatusColor}
        />
      )}

      {activeTab === "analytics" && (
        <AnalyticsTab
          apiStats={apiStats}
          dailyTrend={dailyTrend}
          dailyTotal={dailyTotal}
          isLoading={isLoading}
          selectedPeriod={selectedPeriod}
          setSelectedPeriod={setSelectedPeriod}
        />
      )}
    </PageLayout>
  );
}
