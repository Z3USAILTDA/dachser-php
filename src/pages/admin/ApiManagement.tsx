import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Activity, Server, TrendingUp, AlertCircle, RefreshCw, Loader2, Calendar, DollarSign, LayoutDashboard, BarChart3 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent
} from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell } from "recharts";
import dachserBg from "@/assets/dachser-background.jpg";
import { cn } from "@/lib/utils";

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
    <div className="space-y-6 animate-fade-in">
      {/* API Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          <div className="col-span-full flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
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
              <Card key={api.api_name} className="bg-white/10 border-white/20 backdrop-blur hover:bg-white/15 transition">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getApiColor(api.api_name) }} />
                      <CardTitle className="text-lg text-white">{api.api_name}</CardTitle>
                    </div>
                    <Badge className={getStatusColor(Number(api.success_rate || 0))}>
                      {Number(api.success_rate || 0).toFixed(1)}%
                    </Badge>
                  </div>
                  <CardDescription className="text-white/50">
                    Última chamada: {formatDate(api.last_call)}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-white/50 text-xs">Total Chamadas</p>
                      <p className="text-xl font-semibold text-white">
                        {Number(api.total_calls || 0).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-white/50 text-xs">Custo Est.</p>
                      <p className="text-xl font-semibold text-emerald-400">
                        {formatCurrency(cost)}
                      </p>
                    </div>
                    <div>
                      <p className="text-white/50 text-xs">Tempo Médio</p>
                      <p className="text-xl font-semibold text-white">
                        {api.avg_response_time_ms ? `${Number(api.avg_response_time_ms)}ms` : "N/A"}
                      </p>
                    </div>
                    <div>
                      <p className="text-white/50 text-xs">Erros</p>
                      <p className={`text-xl font-semibold ${Number(api.error_count || 0) > 0 ? "text-red-400" : "text-green-400"}`}>
                        {Number(api.error_count || 0)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
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
        <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Trend Charts Section */}
      {dailyTotal.length > 0 && (
        <Card className="bg-white/10 border-white/20 backdrop-blur">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-white flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-amber-400" />
                  Tendência de Uso
                </CardTitle>
                <CardDescription className="text-white/50">
                  Chamadas de API ao longo do tempo
                </CardDescription>
              </div>
              <Tabs value={selectedPeriod} onValueChange={(v) => setSelectedPeriod(v as "7" | "30")}>
                <TabsList className="bg-white/10 border border-white/20">
                  <TabsTrigger value="7" className="data-[state=active]:bg-amber-500 data-[state=active]:text-black text-white/70">
                    <Calendar className="w-4 h-4 mr-1" />
                    7 dias
                  </TabsTrigger>
                  <TabsTrigger value="30" className="data-[state=active]:bg-amber-500 data-[state=active]:text-black text-white/70">
                    <Calendar className="w-4 h-4 mr-1" />
                    30 dias
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Total Calls Chart */}
              <div className="bg-black/30 rounded-lg p-4">
                <h4 className="text-white/80 text-sm font-medium mb-4">Total de Chamadas por Dia</h4>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={getFilteredData(dailyTotal).map(d => ({ ...d, date: formatShortDate(d.date), total_calls: Number(d.total_calls || 0), total_errors: Number(d.total_errors || 0) }))}>
                      <defs>
                        <linearGradient id="colorCalls" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                      <XAxis dataKey="date" stroke="rgba(255,255,255,0.5)" fontSize={12} />
                      <YAxis stroke="rgba(255,255,255,0.5)" fontSize={12} />
                      <ChartTooltip 
                        content={({ active, payload, label }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div className="bg-black/90 border border-white/20 rounded-lg p-3">
                                <p className="text-white font-medium">{label}</p>
                                <p className="text-blue-400">Chamadas: {payload[0].value}</p>
                                {payload[1] && <p className="text-red-400">Erros: {payload[1].value}</p>}
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Area type="monotone" dataKey="total_calls" stroke="#3b82f6" fillOpacity={1} fill="url(#colorCalls)" strokeWidth={2} />
                      <Line type="monotone" dataKey="total_errors" stroke="#ef4444" strokeWidth={2} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Per-API Chart */}
              <div className="bg-black/30 rounded-lg p-4">
                <h4 className="text-white/80 text-sm font-medium mb-4">Chamadas por API</h4>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={getChartData()}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                      <XAxis dataKey="date" stroke="rgba(255,255,255,0.5)" fontSize={12} />
                      <YAxis stroke="rgba(255,255,255,0.5)" fontSize={12} />
                      <ChartTooltip 
                        content={({ active, payload, label }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div className="bg-black/90 border border-white/20 rounded-lg p-3">
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
                <div className="flex flex-wrap gap-3 mt-4 justify-center">
                  {getUniqueApis().map(api => (
                    <div key={api} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getApiColor(api) }} />
                      <span className="text-white/70 text-xs">{api}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cost Breakdown Section */}
      {apiStats.length > 0 && (
        <Card className="bg-white/10 border-white/20 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-400" />
              Estimativa de Custos por API
            </CardTitle>
            <CardDescription className="text-white/50">
              Custos estimados baseados nos preços públicos de cada provedor (últimos 30 dias)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Cost Pie Chart */}
              <div className="bg-black/30 rounded-lg p-4">
                <h4 className="text-white/80 text-sm font-medium mb-4">Distribuição de Custos</h4>
                <div className="h-64 flex items-center justify-center">
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
                        innerRadius={60}
                        outerRadius={90}
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
                              <div className="bg-black/90 border border-white/20 rounded-lg p-3">
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
              <div className="bg-black/30 rounded-lg p-4">
                <h4 className="text-white/80 text-sm font-medium mb-4">Detalhamento de Custos</h4>
                <div className="space-y-3">
                  {apiStats
                    .map(api => ({
                      ...api,
                      cost: getApiCost(api.api_name, Number(api.total_calls || 0)),
                      pricing: API_PRICING[api.api_name]
                    }))
                    .sort((a, b) => b.cost - a.cost)
                    .map(api => (
                      <div key={api.api_name} className="flex items-center justify-between p-3 bg-white/5 rounded-lg hover:bg-white/10 transition">
                        <div className="flex items-center gap-3">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getApiColor(api.api_name) }} />
                          <div>
                            <p className="text-white font-medium">{api.api_name}</p>
                            <p className="text-white/40 text-xs">
                              {api.pricing ? `${api.pricing.unit} • ${api.pricing.notes}` : 'Preço não configurado'}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-emerald-400 font-semibold">{formatCurrency(api.cost)}</p>
                          <p className="text-white/40 text-xs">
                            {Number(api.total_calls || 0).toLocaleString()} chamadas
                          </p>
                        </div>
                      </div>
                    ))}
                  
                  {/* Total */}
                  <div className="flex items-center justify-between p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg mt-4">
                    <div className="flex items-center gap-3">
                      <DollarSign className="w-5 h-5 text-emerald-400" />
                      <p className="text-white font-semibold">Total Estimado</p>
                    </div>
                    <p className="text-emerald-400 font-bold text-lg">
                      {formatCurrency(apiStats.reduce((sum, api) => sum + getApiCost(api.api_name, Number(api.total_calls || 0)), 0))}
                    </p>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Disclaimer */}
            <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
              <p className="text-amber-300 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>
                  Os valores são estimativas baseadas nos preços públicos médios de cada provedor. 
                  Os custos reais podem variar conforme o plano contratado, volume de tokens por chamada e taxas adicionais.
                </span>
              </p>
            </div>
          </CardContent>
        </Card>
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
    if (successRate >= 99) return "bg-green-500/20 text-green-400 border-green-500/30";
    if (successRate >= 95) return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    return "bg-red-500/20 text-red-400 border-red-500/30";
  };

  const storedUser = localStorage.getItem("user");
  const user = storedUser ? JSON.parse(storedUser) : null;

  if (isRestricted) {
    return null;
  }

  return (
    <div
      className="min-h-screen bg-cover bg-center"
      style={{ backgroundImage: `url(${dachserBg})` }}
    >
      <div className="min-h-screen bg-black/70 backdrop-blur-sm p-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate("/dashboard")}
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition"
              >
                <ArrowLeft className="w-5 h-5 text-white" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                  <Server className="w-6 h-6 text-amber-400" />
                  Gerenciamento de APIs
                </h1>
                <p className="text-white/60 text-sm">
                  Monitoramento de chamadas e consumo de APIs externas
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="bg-amber-500 hover:bg-amber-600 text-black"
              >
                {isRefreshing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Atualizar
              </Button>
              {user && (
                <div className="px-3 py-1.5 rounded-full bg-black/50 border border-white/20 text-white/70 text-sm">
                  @{user.username || user.email}
                </div>
              )}
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
            <Card className="bg-white/10 border-white/20 backdrop-blur">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-blue-500/20">
                    <Activity className="w-6 h-6 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-white/60 text-sm">Total de Chamadas</p>
                    <p className="text-2xl font-bold text-white">
                      {isLoading ? "..." : apiStats.reduce((sum, api) => sum + Number(api.total_calls || 0), 0).toLocaleString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white/10 border-white/20 backdrop-blur">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-green-500/20">
                    <TrendingUp className="w-6 h-6 text-green-400" />
                  </div>
                  <div>
                    <p className="text-white/60 text-sm">Taxa de Sucesso</p>
                    <p className="text-2xl font-bold text-white">
                      {isLoading ? "..." : (
                        (apiStats.reduce((sum, api) => sum + Number(api.success_rate || 0), 0) / (apiStats.length || 1)).toFixed(1) + "%"
                      )}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white/10 border-white/20 backdrop-blur">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-amber-500/20">
                    <Server className="w-6 h-6 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-white/60 text-sm">APIs Ativas</p>
                    <p className="text-2xl font-bold text-white">
                      {isLoading ? "..." : apiStats.length}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white/10 border-white/20 backdrop-blur">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-red-500/20">
                    <AlertCircle className="w-6 h-6 text-red-400" />
                  </div>
                  <div>
                    <p className="text-white/60 text-sm">Total de Erros</p>
                    <p className="text-2xl font-bold text-white">
                      {isLoading ? "..." : apiStats.reduce((sum, api) => sum + Number(api.error_count || 0), 0).toLocaleString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-emerald-500/20 to-green-600/20 border-emerald-500/30 backdrop-blur">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-emerald-500/30">
                    <DollarSign className="w-6 h-6 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-white/60 text-sm">Custo Estimado (30d)</p>
                    <p className="text-2xl font-bold text-emerald-400">
                      {isLoading ? "..." : formatCurrency(
                        apiStats.reduce((sum, api) => sum + getApiCost(api.api_name, Number(api.total_calls || 0)), 0)
                      )}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1 px-2 py-1.5 rounded-full bg-[rgba(5,6,18,0.85)] border border-white/10 backdrop-blur-sm w-fit mb-6">
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
        </div>
      </div>
    </div>
  );
}
