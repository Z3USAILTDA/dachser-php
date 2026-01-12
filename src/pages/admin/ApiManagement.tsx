import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, Server, TrendingUp, AlertCircle, RefreshCw, Loader2, Calendar, DollarSign, LayoutDashboard, BarChart3, HelpCircle, X, Clock, CheckCircle, XCircle, ExternalLink, History, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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

interface ApiUsageCycle {
  id: string;
  api_name: string;
  cycle_start_date: string;
  cycle_end_date: string;
  total_calls: number;
  total_errors: number;
  monthly_limit: number | null;
  usage_percentage: number | null;
  estimated_cost_usd: number | null;
  plan_name: string | null;
  created_at: string;
}

// Preços reais por chamada (em USD) - Atualizado em Dez/2024
interface ApiPricing {
  costPerCall: number;
  unit: string;
  notes: string;
  tier?: string; // Plano contratado
}

// Limites mensais das APIs (para alertas)
interface ApiLimitConfig {
  monthlyLimit: number;
  alertThreshold: number; // 80% do limite
  plan: string;
  renewalDay: number; // Dia do mês em que o ciclo renova (1-28)
}

const API_LIMITS: Record<string, ApiLimitConfig> = {
  "JSONCargo": {
    monthlyLimit: 5000,
    alertThreshold: 4000, // 80% de 5000
    plan: "Navigator (€299/mês)",
    renewalDay: 29 // Renova dia 29 de cada mês
  }
  // Adicionar outras APIs aqui conforme necessário
};

// Calcula as datas do ciclo atual baseado no dia de renovação
const getBillingCycleDates = (renewalDay: number): { startDate: Date; endDate: Date; daysRemaining: number } => {
  const now = new Date();
  const currentDay = now.getDate();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  
  let cycleStart: Date;
  let cycleEnd: Date;
  
  if (currentDay >= renewalDay) {
    // Estamos após o dia de renovação, ciclo atual começou este mês
    cycleStart = new Date(currentYear, currentMonth, renewalDay);
    cycleEnd = new Date(currentYear, currentMonth + 1, renewalDay - 1);
  } else {
    // Estamos antes do dia de renovação, ciclo atual começou mês passado
    cycleStart = new Date(currentYear, currentMonth - 1, renewalDay);
    cycleEnd = new Date(currentYear, currentMonth, renewalDay - 1);
  }
  
  // Dias restantes até renovação
  const timeDiff = cycleEnd.getTime() - now.getTime();
  const daysRemaining = Math.max(0, Math.ceil(timeDiff / (1000 * 60 * 60 * 24)));
  
  return { startDate: cycleStart, endDate: cycleEnd, daysRemaining };
};

// Formata data do ciclo
const formatCycleDate = (date: Date): string => {
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
};

const API_PRICING: Record<string, ApiPricing> = {
  "Anthropic": { 
    costPerCall: 0.015, // ~500 input + 500 output tokens avg
    unit: "por chamada (~1K tokens)",
    notes: "Claude Sonnet 4: $3/1M input, $15/1M output",
    tier: "API Direta"
  },
  "LovableAI": { 
    costPerCall: 0.002,
    unit: "por chamada",
    notes: "Gemini 2.5 Flash via Lovable Gateway",
    tier: "Lovable Workspace"
  },
  "Resend": { 
    costPerCall: 0.0009, // $0.90/1000 após tier gratuito
    unit: "por email",
    notes: "Pro: $20/mês (50k inclusos) + $0.90/1k extra",
    tier: "Pro"
  },
  "JSONCargo": { 
    costPerCall: 0.0598, // €299/mês ÷ 5000 calls = €0.0598 por chamada
    unit: "por consulta",
    notes: "Plano Navigator: €299/mês (5000 chamadas incluídas)",
    tier: "Navigator"
  },
  "FlightRadar24": { 
    costPerCall: 0.0003, // $90/mês ÷ ~333k credits
    unit: "por credit",
    notes: "Essential: $90/mês (333k credits)",
    tier: "Essential"
  },
  "Leadcomex": { 
    costPerCall: 0.01, // Estimado - API privada brasileira
    unit: "por chamada",
    notes: "API CCT/Siscomex - verificar contrato",
    tier: "Empresarial"
  },
  "Firecrawl": { 
    costPerCall: 0.0053, // $16/mês ÷ 3k créditos
    unit: "por scrape",
    notes: "Hobby: $16/mês (3k créditos)",
    tier: "Hobby"
  },
  "Air Carriers": { 
    costPerCall: 0.0,
    unit: "por consulta",
    notes: "APIs diretas de companhias aéreas (TAP, Atlas, Lufthansa, etc.)",
    tier: "Gratuito"
  },
};

const RESTRICTED_USERS = ["ana.tozzo"];

const API_COLORS: Record<string, string> = {
  "JSONCargo": "#3b82f6",      // Azul
  "Anthropic": "#8b5cf6",      // Roxo
  "LovableAI": "#10b981",      // Verde
  "Resend": "#f59e0b",         // Âmbar
  "FlightRadar24": "#ef4444",  // Vermelho
  "Leadcomex": "#06b6d4",      // Ciano
  "Firecrawl": "#f97316",      // Laranja
  "Air Carriers": "#a855f7",   // Violeta
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

// API Detail Modal Component
const ApiDetailModal = ({
  isOpen,
  onClose,
  api,
  logs,
  formatDate
}: {
  isOpen: boolean;
  onClose: () => void;
  api: ApiStats | null;
  logs: ApiUsageLog[];
  formatDate: (dateStr: string | null) => string;
}) => {
  if (!api) return null;
  
  const pricing = API_PRICING[api.api_name];
  const cost = getApiCost(api.api_name, Number(api.total_calls || 0));
  const apiLogs = logs.filter(log => log.api_name === api.api_name);
  
  // Group logs by endpoint
  const endpointStats = apiLogs.reduce((acc, log) => {
    const key = `${log.method} ${log.endpoint}`;
    if (!acc[key]) {
      acc[key] = { count: 0, errors: 0, totalTime: 0 };
    }
    acc[key].count++;
    if (log.status_code >= 400) acc[key].errors++;
    acc[key].totalTime += log.response_time_ms || 0;
    return acc;
  }, {} as Record<string, { count: number; errors: number; totalTime: number }>);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] bg-[#0d0e14] border-white/10 text-white p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: getApiColor(api.api_name) }} />
            <DialogTitle className="text-xl font-bold text-white">{api.api_name}</DialogTitle>
            <Badge className={api.success_rate >= 99 
              ? "bg-emerald-500/15 border-emerald-500/80 text-emerald-400" 
              : api.success_rate >= 95 
                ? "bg-yellow-500/15 border-yellow-500/80 text-yellow-400"
                : "bg-red-500/15 border-red-500/80 text-red-400"
            }>
              {Number(api.success_rate || 0).toFixed(1)}% sucesso
            </Badge>
          </div>
        </DialogHeader>
        
        <ScrollArea className="max-h-[calc(90vh-100px)]">
          <div className="p-6 space-y-6">
            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-lg bg-[#0a0b10] border border-white/10">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
                  <Activity className="w-3.5 h-3.5" />
                  Total de Chamadas
                </div>
                <div className="text-2xl font-bold text-white">
                  {Number(api.total_calls || 0).toLocaleString()}
                </div>
              </div>
              <div className="p-4 rounded-lg bg-[#0a0b10] border border-white/10">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
                  <DollarSign className="w-3.5 h-3.5" />
                  Custo Estimado
                </div>
                <div className="text-2xl font-bold text-emerald-400">
                  {formatCurrency(cost)}
                </div>
              </div>
              <div className="p-4 rounded-lg bg-[#0a0b10] border border-white/10">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
                  <Clock className="w-3.5 h-3.5" />
                  Tempo Médio
                </div>
                <div className="text-2xl font-bold text-white">
                  {api.avg_response_time_ms ? `${Number(api.avg_response_time_ms).toFixed(0)}ms` : "N/A"}
                </div>
              </div>
              <div className="p-4 rounded-lg bg-[#0a0b10] border border-white/10">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
                  <XCircle className="w-3.5 h-3.5" />
                  Erros
                </div>
                <div className={`text-2xl font-bold ${Number(api.error_count || 0) > 0 ? "text-red-400" : "text-green-400"}`}>
                  {Number(api.error_count || 0)}
                </div>
              </div>
            </div>

            {/* Pricing Info */}
            {pricing && (
              <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
                <h4 className="text-sm font-semibold text-blue-300 mb-2">Informações de Preço</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Custo por chamada:</span>
                    <div className="text-white font-medium">{formatCurrency(pricing.costPerCall)}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Unidade:</span>
                    <div className="text-white font-medium">{pricing.unit}</div>
                  </div>
                  {pricing.tier && (
                    <div>
                      <span className="text-muted-foreground">Plano:</span>
                      <div className="text-white font-medium">{pricing.tier}</div>
                    </div>
                  )}
                  <div className="col-span-2 md:col-span-1">
                    <span className="text-muted-foreground">Notas:</span>
                    <div className="text-white/70 text-xs">{pricing.notes}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Endpoint Breakdown */}
            {Object.keys(endpointStats).length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-white mb-3">Endpoints Utilizados</h4>
                <div className="rounded-lg border border-white/10 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/10 hover:bg-transparent">
                        <TableHead className="text-muted-foreground">Endpoint</TableHead>
                        <TableHead className="text-muted-foreground text-right">Chamadas</TableHead>
                        <TableHead className="text-muted-foreground text-right">Erros</TableHead>
                        <TableHead className="text-muted-foreground text-right">Tempo Médio</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(endpointStats).map(([endpoint, stats]) => (
                        <TableRow key={endpoint} className="border-white/10">
                          <TableCell className="font-mono text-xs text-white/80">{endpoint}</TableCell>
                          <TableCell className="text-right text-white">{stats.count}</TableCell>
                          <TableCell className={`text-right ${stats.errors > 0 ? "text-red-400" : "text-green-400"}`}>
                            {stats.errors}
                          </TableCell>
                          <TableCell className="text-right text-white/70">
                            {stats.count > 0 ? `${Math.round(stats.totalTime / stats.count)}ms` : "N/A"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Recent Logs */}
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">
                Histórico de Chamadas 
                <span className="text-muted-foreground font-normal ml-2">
                  (últimas {Math.min(apiLogs.length, 50)} de {apiLogs.length})
                </span>
              </h4>
              {apiLogs.length === 0 ? (
                <div className="p-8 rounded-lg bg-[#0a0b10] border border-white/10 text-center">
                  <Server className="w-8 h-8 text-white/20 mx-auto mb-2" />
                  <p className="text-muted-foreground text-sm">Nenhum log disponível para esta API</p>
                </div>
              ) : (
                <div className="rounded-lg border border-white/10 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/10 hover:bg-transparent">
                        <TableHead className="text-muted-foreground">Data/Hora</TableHead>
                        <TableHead className="text-muted-foreground">Endpoint</TableHead>
                        <TableHead className="text-muted-foreground text-center">Status</TableHead>
                        <TableHead className="text-muted-foreground text-right">Tempo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {apiLogs.slice(0, 50).map((log) => (
                        <TableRow key={log.id} className="border-white/10">
                          <TableCell className="text-xs text-white/60">
                            {formatDate(log.created_at)}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-white/80 max-w-[200px] truncate">
                            {log.method} {log.endpoint}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge className={log.status_code < 400 
                              ? "bg-green-500/20 text-green-400 border-green-500/50" 
                              : "bg-red-500/20 text-red-400 border-red-500/50"
                            }>
                              {log.status_code}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-white/70 text-xs">
                            {log.response_time_ms ? `${log.response_time_ms}ms` : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

// Dashboard Tab Component - API Cards
const DashboardTab = ({ 
  apiStats, 
  recentLogs,
  isLoading,
  formatDate,
  getStatusColor,
  onApiClick
}: { 
  apiStats: ApiStats[];
  recentLogs: ApiUsageLog[];
  isLoading: boolean;
  formatDate: (dateStr: string | null) => string;
  getStatusColor: (successRate: number) => string;
  onApiClick: (api: ApiStats) => void;
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
            const apiLogCount = recentLogs.filter(log => log.api_name === api.api_name).length;
            const limitConfig = API_LIMITS[api.api_name];
            const currentUsage = Number(api.total_calls || 0);
            const usagePercentage = limitConfig ? (currentUsage / limitConfig.monthlyLimit) * 100 : null;
            const remaining = limitConfig ? limitConfig.monthlyLimit - currentUsage : null;
            
            // Calcular ciclo de faturamento baseado na data de renovação
            const billingCycle = limitConfig ? getBillingCycleDates(limitConfig.renewalDay) : null;
            
            // Cores da barra baseadas no percentual
            const getProgressColor = (pct: number) => {
              if (pct >= 90) return "bg-red-500";
              if (pct >= 80) return "bg-amber-500";
              if (pct >= 60) return "bg-yellow-500";
              return "bg-emerald-500";
            };
            
            return (
              <PageCard 
                key={api.api_name} 
                className="hover:border-[#ffc800]/50 hover:bg-white/[0.02] transition cursor-pointer group"
                onClick={() => onApiClick(api)}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getApiColor(api.api_name) }} />
                    <span className="text-base font-semibold text-white group-hover:text-[#ffc800] transition">{api.api_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={getStatusColor(Number(api.success_rate || 0))}>
                      {Number(api.success_rate || 0).toFixed(1)}%
                    </Badge>
                    <ExternalLink className="w-3.5 h-3.5 text-white/30 group-hover:text-[#ffc800] transition" />
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground mb-3">
                  Última chamada: {formatDate(api.last_call)}
                </p>
                
                {/* Barra de progresso para APIs com limite */}
                {limitConfig && usagePercentage !== null && billingCycle && (
                  <div className="mb-3 p-2.5 rounded-lg bg-[#0a0b10] border border-white/10">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
                          Ciclo Atual
                        </span>
                        <span className="text-[9px] text-white/40">
                          ({formatCycleDate(billingCycle.startDate)} - {formatCycleDate(billingCycle.endDate)})
                        </span>
                      </div>
                      <span className={`text-[10px] font-semibold ${usagePercentage >= 80 ? "text-amber-400" : "text-white/70"}`}>
                        {usagePercentage.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${getProgressColor(usagePercentage)}`}
                        style={{ width: `${Math.min(usagePercentage, 100)}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[10px] text-white/60">
                        {currentUsage.toLocaleString()} / {limitConfig.monthlyLimit.toLocaleString()}
                      </span>
                      <span className={`text-[10px] ${remaining! <= 1000 ? "text-amber-400" : "text-white/40"}`}>
                        {remaining!.toLocaleString()} restantes
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-white/5">
                      <span className="text-[9px] text-white/40 flex items-center gap-1">
                        <RefreshCw className="w-2.5 h-2.5" />
                        Renova dia {limitConfig.renewalDay}
                      </span>
                      <span className={`text-[9px] ${billingCycle.daysRemaining <= 5 ? "text-amber-400" : "text-white/40"}`}>
                        {billingCycle.daysRemaining} dias restantes
                      </span>
                    </div>
                    {usagePercentage >= 80 && (
                      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-amber-400">
                        <AlertCircle className="w-3 h-3" />
                        <span>Atenção: próximo do limite mensal</span>
                      </div>
                    )}
                  </div>
                )}
                
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
                <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">
                    {apiLogCount} logs recentes
                  </span>
                  <span className="text-[10px] text-[#ffc800] opacity-0 group-hover:opacity-100 transition">
                    Clique para detalhes →
                  </span>
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
            Clique em qualquer card de API para ver o histórico detalhado de chamadas, endpoints utilizados e informações de custo.
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

// History Tab Component - Billing Cycle History
const HistoryTab = ({
  usageCycles,
  isLoading,
  onSaveCycle
}: {
  usageCycles: ApiUsageCycle[];
  isLoading: boolean;
  onSaveCycle: () => void;
}) => {
  // Group cycles by API
  const groupedCycles = usageCycles.reduce((acc, cycle) => {
    if (!acc[cycle.api_name]) {
      acc[cycle.api_name] = [];
    }
    acc[cycle.api_name].push(cycle);
    return acc;
  }, {} as Record<string, ApiUsageCycle[]>);

  // Calculate variation between cycles
  const getVariation = (current: number, previous: number | undefined): { value: number; type: 'up' | 'down' | 'same' } => {
    if (previous === undefined || previous === 0) return { value: 0, type: 'same' };
    const diff = ((current - previous) / previous) * 100;
    if (diff > 0) return { value: diff, type: 'up' };
    if (diff < 0) return { value: Math.abs(diff), type: 'down' };
    return { value: 0, type: 'same' };
  };

  const formatCycleRange = (start: string, end: string) => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    return `${startDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} - ${endDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}`;
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
      {/* Save Current Cycle Button */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <History className="w-4 h-4 text-[#ffc800]" />
            Histórico de Ciclos de Faturamento
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Compare o consumo de APIs entre diferentes períodos de faturamento
          </p>
        </div>
        <Button
          onClick={onSaveCycle}
          className="bg-[#ffc800] hover:bg-[#e6b400] text-black rounded-full px-4 h-8 text-xs font-semibold"
        >
          <Calendar className="w-3.5 h-3.5 mr-1.5" />
          Salvar Ciclo Atual
        </Button>
      </div>

      {Object.keys(groupedCycles).length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <History className="w-12 h-12 text-white/30 mb-4" />
          <p className="text-white/60 text-lg font-medium">Sem histórico de ciclos</p>
          <p className="text-white/40 text-sm mt-2 max-w-md">
            Clique em "Salvar Ciclo Atual" para registrar o uso do período atual. 
            O histórico permitirá comparar o consumo entre diferentes meses.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedCycles).map(([apiName, cycles]) => {
            const sortedCycles = [...cycles].sort((a, b) => 
              new Date(b.cycle_start_date).getTime() - new Date(a.cycle_start_date).getTime()
            );

            return (
              <PageCard key={apiName}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold"
                       style={{ backgroundColor: getApiColor(apiName) + '20', color: getApiColor(apiName) }}>
                    {apiName.charAt(0)}
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-white">{apiName}</h4>
                    <p className="text-xs text-muted-foreground">
                      {sortedCycles.length} ciclo{sortedCycles.length !== 1 ? 's' : ''} registrado{sortedCycles.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>

                {/* Cycle Comparison Chart */}
                <div className="h-40 mb-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sortedCycles.slice(0, 6).reverse().map(c => ({
                      period: new Date(c.cycle_start_date).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
                      calls: c.total_calls,
                      errors: c.total_errors,
                      limit: c.monthly_limit
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="period" tick={{ fill: "#ccc", fontSize: 10 }} axisLine={false} />
                      <YAxis tick={{ fill: "#ccc", fontSize: 10 }} axisLine={false} />
                      <ChartTooltip
                        content={({ active, payload, label }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div className="bg-[#111] border border-[rgba(255,200,0,0.3)] rounded-lg p-3">
                                <p className="text-white font-medium">{label}</p>
                                <p className="text-[#ffc800]">Chamadas: {Number(payload[0]?.value || 0).toLocaleString()}</p>
                                {payload[1] && <p className="text-red-400">Erros: {payload[1].value}</p>}
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey="calls" fill={getApiColor(apiName)} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="errors" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Cycle Details Table */}
                <div className="rounded-lg border border-white/10 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/10 hover:bg-transparent">
                        <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">Período</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground text-right">Chamadas</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground text-right">Variação</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground text-right">% Limite</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground text-right">Custo Est.</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedCycles.slice(0, 6).map((cycle, index) => {
                        const previousCycle = sortedCycles[index + 1];
                        const variation = getVariation(cycle.total_calls, previousCycle?.total_calls);
                        
                        return (
                          <TableRow key={cycle.id} className="border-white/5 hover:bg-white/5">
                            <TableCell className="text-xs text-white">
                              {formatCycleRange(cycle.cycle_start_date, cycle.cycle_end_date)}
                            </TableCell>
                            <TableCell className="text-xs text-right font-mono text-white">
                              {cycle.total_calls.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-xs text-right">
                              <span className={cn(
                                "inline-flex items-center gap-1",
                                variation.type === 'up' && "text-red-400",
                                variation.type === 'down' && "text-green-400",
                                variation.type === 'same' && "text-white/50"
                              )}>
                                {variation.type === 'up' && <ArrowUpRight className="w-3 h-3" />}
                                {variation.type === 'down' && <ArrowDownRight className="w-3 h-3" />}
                                {variation.type === 'same' && <Minus className="w-3 h-3" />}
                                {variation.value.toFixed(1)}%
                              </span>
                            </TableCell>
                            <TableCell className="text-xs text-right">
                              {cycle.usage_percentage !== null ? (
                                <span className={cn(
                                  cycle.usage_percentage >= 80 ? "text-amber-400" : "text-white/70"
                                )}>
                                  {cycle.usage_percentage.toFixed(1)}%
                                </span>
                              ) : (
                                <span className="text-white/30">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-right font-mono text-emerald-400">
                              {cycle.estimated_cost_usd !== null 
                                ? formatCurrency(cycle.estimated_cost_usd)
                                : '-'
                              }
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </PageCard>
            );
          })}
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
  const [usageCycles, setUsageCycles] = useState<ApiUsageCycle[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isRestricted, setIsRestricted] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<"7" | "30">("7");
  const [activeTab, setActiveTab] = useState<"dashboard" | "analytics" | "history">("dashboard");
  const [selectedApi, setSelectedApi] = useState<ApiStats | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  const handleApiClick = (api: ApiStats) => {
    setSelectedApi(api);
    setIsDetailModalOpen(true);
  };

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
      fetchUsageCycles();
    }
  }, [isAdmin, isRestricted]);

  // Função para verificar limites e enviar alerta
  const checkApiLimitsAndAlert = async (stats: ApiStats[]) => {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    const formatDateBR = (date: Date) => date.toLocaleDateString("pt-BR");
    
    // Verificar alertas já enviados neste mês (usando localStorage para evitar spam)
    const alertKey = `api_alert_${now.getFullYear()}_${now.getMonth()}`;
    const sentAlerts: Record<string, boolean> = JSON.parse(localStorage.getItem(alertKey) || "{}");
    
    for (const api of stats) {
      const limitConfig = API_LIMITS[api.api_name];
      if (!limitConfig) continue;
      
      const currentUsage = Number(api.total_calls || 0);
      
      // Verificar se atingiu o threshold e ainda não enviou alerta neste mês
      if (currentUsage >= limitConfig.alertThreshold && !sentAlerts[api.api_name]) {
        console.log(`[API Alert] ${api.api_name} atingiu ${currentUsage}/${limitConfig.monthlyLimit} (threshold: ${limitConfig.alertThreshold})`);
        
        try {
          const { data, error } = await supabase.functions.invoke("send-api-usage-alert", {
            body: {
              api_name: api.api_name,
              current_usage: currentUsage,
              period_start: formatDateBR(periodStart),
              period_end: formatDateBR(periodEnd)
            }
          });
          
          if (error) throw error;
          
          if (data?.alert_sent) {
            // Marcar como enviado para evitar duplicatas
            sentAlerts[api.api_name] = true;
            localStorage.setItem(alertKey, JSON.stringify(sentAlerts));
            
            toast.warning(`Alerta enviado: ${api.api_name} em ${((currentUsage / limitConfig.monthlyLimit) * 100).toFixed(0)}% do limite`, {
              duration: 8000,
              description: `Notificação enviada para herbert@z3us.ai, rodrigo@z3us.ai e devs@z3us.ai`
            });
          }
        } catch (err) {
          console.error(`[API Alert] Erro ao enviar alerta para ${api.api_name}:`, err);
        }
      }
    }
  };

  const fetchApiStats = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { action: "get_api_stats" },
      });

      if (error) throw error;

      if (data?.success) {
        const stats = data.stats || [];
        setApiStats(stats);
        setRecentLogs(data.recent_logs || []);
        setDailyTrend(data.daily_trend || []);
        setDailyTotal(data.daily_total || []);
        
        // Verificar limites e enviar alertas se necessário
        checkApiLimitsAndAlert(stats);
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

  const fetchUsageCycles = async () => {
    try {
      const { data, error } = await supabase
        .from('api_usage_cycles')
        .select('*')
        .order('cycle_start_date', { ascending: false });
      
      if (error) throw error;
      setUsageCycles(data || []);
    } catch (error) {
      console.error("Error fetching usage cycles:", error);
    }
  };

  const handleSaveCurrentCycle = async () => {
    if (apiStats.length === 0) {
      toast.error("Sem dados de API para salvar");
      return;
    }

    try {
      const now = new Date();
      const savedCount = { success: 0, skipped: 0 };

      for (const api of apiStats) {
        const limitConfig = API_LIMITS[api.api_name];
        const billingCycle = limitConfig 
          ? getBillingCycleDates(limitConfig.renewalDay) 
          : { startDate: new Date(now.getFullYear(), now.getMonth(), 1), endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0) };

        const cycleStartStr = billingCycle.startDate.toISOString().split('T')[0];
        const cycleEndStr = billingCycle.endDate.toISOString().split('T')[0];
        
        const totalCalls = Number(api.total_calls || 0);
        const totalErrors = Number(api.error_count || 0);
        const monthlyLimit = limitConfig?.monthlyLimit || null;
        const usagePercentage = monthlyLimit ? (totalCalls / monthlyLimit) * 100 : null;
        const estimatedCost = getApiCost(api.api_name, totalCalls);

        const { error } = await supabase
          .from('api_usage_cycles')
          .upsert({
            api_name: api.api_name,
            cycle_start_date: cycleStartStr,
            cycle_end_date: cycleEndStr,
            total_calls: totalCalls,
            total_errors: totalErrors,
            monthly_limit: monthlyLimit,
            usage_percentage: usagePercentage,
            estimated_cost_usd: estimatedCost,
            plan_name: limitConfig?.plan || null,
            updated_at: new Date().toISOString()
          }, { 
            onConflict: 'api_name,cycle_start_date' 
          });

        if (error) {
          console.error(`Error saving cycle for ${api.api_name}:`, error);
        } else {
          savedCount.success++;
        }
      }

      await fetchUsageCycles();
      toast.success(`Ciclo salvo para ${savedCount.success} API${savedCount.success !== 1 ? 's' : ''}`);
    } catch (error) {
      console.error("Error saving current cycle:", error);
      toast.error("Erro ao salvar ciclo atual");
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchApiStats();
    await fetchUsageCycles();
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
      {/* Navigation Tabs */}
      <nav className="flex items-center gap-1 px-2 py-1.5 rounded-full bg-[rgba(5,6,18,0.85)] border border-white/10 backdrop-blur-sm w-fit">
        {[
          { id: "dashboard" as const, label: "Dashboard", icon: LayoutDashboard },
          { id: "analytics" as const, label: "Analytics", icon: BarChart3 },
          { id: "history" as const, label: "Histórico", icon: History },
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

      {/* Tab Content */}
      {activeTab === "dashboard" && (
        <DashboardTab 
          apiStats={apiStats}
          recentLogs={recentLogs}
          isLoading={isLoading}
          formatDate={formatDate}
          getStatusColor={getStatusColor}
          onApiClick={handleApiClick}
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

      {activeTab === "history" && (
        <HistoryTab
          usageCycles={usageCycles}
          isLoading={isLoading}
          onSaveCycle={handleSaveCurrentCycle}
        />
      )}
      {/* API Detail Modal */}
      <ApiDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        api={selectedApi}
        logs={recentLogs}
        formatDate={formatDate}
      />
    </PageLayout>
  );
}
