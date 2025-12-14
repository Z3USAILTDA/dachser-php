import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { PageLayout } from "@/components/layout/PageLayout";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Package, AlertTriangle, AlertCircle, Clock, List, BarChart3, RefreshCw, TrendingUp, DollarSign, Calendar, Bot, FileSpreadsheet, Filter, Building2, Users, LayoutDashboard, CheckCircle2, FileWarning } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Voucher, EtapaAtual, ETAPA_LABELS, SLA_POR_ETAPA } from "@/types/voucher";
import { useUserRole } from "@/hooks/useUserRole";
import { cn } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, Legend } from "recharts";
import { VoucherTable, FilterValues } from "@/components/esteira/VoucherTable";
import { CreateVoucherDialog } from "@/components/esteira/CreateVoucherDialog";
import { EditVoucherDialog } from "@/components/esteira/EditVoucherDialog";
import { RoboTab } from "@/components/tabs/RoboTab";
import { ReportsTab } from "@/components/tabs/ReportsTab";

interface DashboardMetrics {
  ativos: number;
  slaAtencao: number;
  pendenciasFinanceiras: number;
  eventos24h: number;
}

type DrillDownFilter = "all" | "ativos" | "sla" | "pendencias" | "atividade";

const MetricCard = ({ 
  title, 
  value, 
  subtitle,
  icon: Icon, 
  variant = "default",
  delay = 0,
  isActive = false,
  onClick
}: { 
  title: string; 
  value: number; 
  subtitle: string;
  icon: React.ElementType; 
  variant?: "default" | "warning" | "critical" | "info";
  delay?: number;
  isActive?: boolean;
  onClick?: () => void;
}) => {
  const colorClasses = {
    default: "text-primary",
    warning: "text-warning",
    critical: "text-destructive",
    info: "text-info",
  };

  const iconBgClasses = {
    default: "bg-primary/20",
    warning: "bg-warning/20",
    critical: "bg-destructive/20",
    info: "bg-info/20",
  };

  return (
    <div 
      className={cn(
        "bg-card/60 backdrop-blur-sm border rounded-lg p-4 sm:p-5 relative overflow-hidden cursor-pointer min-w-0",
        "hover:border-primary/30 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5",
        "animate-fade-in",
        isActive 
          ? "border-primary ring-2 ring-primary/30 shadow-lg shadow-primary/10" 
          : "border-border/30"
      )}
      style={{ animationDelay: `${delay}ms` }}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1 min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider truncate">{title}</p>
          <p className={cn("text-2xl sm:text-4xl font-bold", colorClasses[variant])}>{value}</p>
          <p className="text-xs sm:text-sm text-muted-foreground truncate">{subtitle}</p>
        </div>
        <div className={cn("p-2 sm:p-3 rounded-full shrink-0", iconBgClasses[variant])}>
          <Icon className={cn("h-4 w-4 sm:h-5 sm:w-5", colorClasses[variant])} />
        </div>
      </div>
      {isActive && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary animate-pulse" />
      )}
    </div>
  );
};

const CHART_COLORS = {
  primary: "hsl(38, 92%, 50%)",
  warning: "hsl(38, 92%, 50%)",
  critical: "hsl(0, 62%, 50%)",
  info: "hsl(200, 98%, 50%)",
  success: "hsl(142, 76%, 36%)",
  muted: "hsl(240, 5%, 34%)",
};

const PIE_COLORS = [CHART_COLORS.primary, CHART_COLORS.info, CHART_COLORS.success, CHART_COLORS.warning, CHART_COLORS.critical, CHART_COLORS.muted];

const AnalyticsDashboard = ({ vouchers }: { vouchers: Voucher[] }) => {
  const etapaData = useMemo(() => {
    const counts: Record<string, number> = {};
    vouchers.forEach(v => {
      const etapa = v.etapaAtual;
      counts[etapa] = (counts[etapa] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({
      name: name.replace("_", " "),
      value,
      fill: name === "CONCLUIDO" ? CHART_COLORS.success : 
            name === "FINANCEIRO" ? CHART_COLORS.info :
            name === "FISCAL" ? CHART_COLORS.warning :
            name === "OPERACAO" ? CHART_COLORS.primary : CHART_COLORS.muted
    }));
  }, [vouchers]);

  const formaPagamentoData = useMemo(() => {
    const counts: Record<string, number> = {};
    vouchers.forEach(v => {
      const forma = v.formaPagamento;
      counts[forma] = (counts[forma] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value], index) => ({
      name: name.replace("_", " "),
      value,
      fill: PIE_COLORS[index % PIE_COLORS.length]
    }));
  }, [vouchers]);

  const vouchersPorMes = useMemo(() => {
    const months: Record<string, { criados: number; concluidos: number }> = {};
    const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${monthNames[d.getMonth()]}/${d.getFullYear().toString().slice(-2)}`;
      months[key] = { criados: 0, concluidos: 0 };
    }
    
    vouchers.forEach(v => {
      const d = new Date(v.createdAt);
      const key = `${monthNames[d.getMonth()]}/${d.getFullYear().toString().slice(-2)}`;
      if (months[key]) {
        months[key].criados++;
        if (v.etapaAtual === "CONCLUIDO") {
          months[key].concluidos++;
        }
      }
    });
    
    return Object.entries(months).map(([name, data]) => ({
      name,
      criados: data.criados,
      concluidos: data.concluidos
    }));
  }, [vouchers]);

  const valorPorEtapa = useMemo(() => {
    const totals: Record<string, number> = {};
    vouchers.forEach(v => {
      if (v.valor) {
        const etapa = v.etapaAtual;
        totals[etapa] = (totals[etapa] || 0) + v.valor;
      }
    });
    return Object.entries(totals).map(([name, total]) => ({
      name: name.replace("_", " "),
      valor: total
    }));
  }, [vouchers]);

  const urgenciaData = useMemo(() => {
    const counts = { NORMAL: 0, URGENTE_REAL: 0, URGENTE_AUTOMATICO: 0 };
    vouchers.forEach(v => {
      const tipo = v.urgenciaTipo || "NORMAL";
      if (counts[tipo as keyof typeof counts] !== undefined) {
        counts[tipo as keyof typeof counts]++;
      }
    });
    return [
      { name: "Normal", value: counts.NORMAL, fill: CHART_COLORS.success },
      { name: "Urgente Real", value: counts.URGENTE_REAL, fill: CHART_COLORS.critical },
      { name: "Urgente Auto", value: counts.URGENTE_AUTOMATICO, fill: CHART_COLORS.warning }
    ];
  }, [vouchers]);

  const totalValor = useMemo(() => {
    return vouchers.reduce((acc, v) => acc + (v.valor || 0), 0);
  }, [vouchers]);

  const mediaValor = useMemo(() => {
    const vouchersComValor = vouchers.filter(v => v.valor);
    if (vouchersComValor.length === 0) return 0;
    return totalValor / vouchersComValor.length;
  }, [vouchers, totalValor]);

  const taxaConclusao = useMemo(() => {
    if (vouchers.length === 0) return 0;
    const concluidos = vouchers.filter(v => v.etapaAtual === "CONCLUIDO").length;
    return Math.round((concluidos / vouchers.length) * 100);
  }, [vouchers]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border/50 rounded-lg p-3 shadow-lg">
          <p className="text-sm font-medium text-foreground">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm text-muted-foreground">
              {entry.name}: <span className="font-semibold text-foreground">{entry.value.toLocaleString('pt-BR')}</span>
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* KPIs Row */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-card/60 backdrop-blur-sm border border-border/30 rounded-lg p-5 hover:border-primary/30 transition-all">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-full bg-primary/20">
              <DollarSign className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Valor Total</p>
              <p className="text-2xl font-bold text-foreground">R$ {totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            </div>
          </div>
        </div>
        <div className="bg-card/60 backdrop-blur-sm border border-border/30 rounded-lg p-5 hover:border-info/30 transition-all">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-full bg-info/20">
              <TrendingUp className="h-5 w-5 text-info" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Valor Médio</p>
              <p className="text-2xl font-bold text-foreground">R$ {mediaValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            </div>
          </div>
        </div>
        <div className="bg-card/60 backdrop-blur-sm border border-border/30 rounded-lg p-5 hover:border-success/30 transition-all">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-full bg-green-500/20">
              <TrendingUp className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Taxa Conclusão</p>
              <p className="text-2xl font-bold text-foreground">{taxaConclusao}%</p>
            </div>
          </div>
        </div>
        <div className="bg-card/60 backdrop-blur-sm border border-border/30 rounded-lg p-5 hover:border-warning/30 transition-all">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-full bg-warning/20">
              <Calendar className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Vouchers</p>
              <p className="text-2xl font-bold text-foreground">{vouchers.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row 1 */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        <div className="bg-card/60 backdrop-blur-sm border border-border/30 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4 uppercase tracking-wider">Vouchers por Mês</h3>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={vouchersPorMes}>
              <defs>
                <linearGradient id="colorCriados" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLORS.primary} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorConcluidos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLORS.success} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={CHART_COLORS.success} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(240, 5%, 20%)" />
              <XAxis dataKey="name" stroke="hsl(240, 5%, 50%)" fontSize={12} />
              <YAxis stroke="hsl(240, 5%, 50%)" fontSize={12} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Area type="monotone" dataKey="criados" name="Criados" stroke={CHART_COLORS.primary} fillOpacity={1} fill="url(#colorCriados)" />
              <Area type="monotone" dataKey="concluidos" name="Concluídos" stroke={CHART_COLORS.success} fillOpacity={1} fill="url(#colorConcluidos)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card/60 backdrop-blur-sm border border-border/30 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4 uppercase tracking-wider">Distribuição por Etapa</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={etapaData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={2}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {etapaData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
        <div className="bg-card/60 backdrop-blur-sm border border-border/30 rounded-xl p-6 lg:col-span-2">
          <h3 className="text-sm font-semibold text-foreground mb-4 uppercase tracking-wider">Valor por Etapa (R$)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={valorPorEtapa} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(240, 5%, 20%)" />
              <XAxis type="number" stroke="hsl(240, 5%, 50%)" fontSize={12} tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="name" stroke="hsl(240, 5%, 50%)" fontSize={11} width={80} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="valor" name="Valor" fill={CHART_COLORS.primary} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card/60 backdrop-blur-sm border border-border/30 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4 uppercase tracking-wider">Classificação Urgência</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={urgenciaData}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={70}
                paddingAngle={3}
                dataKey="value"
              >
                {urgenciaData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend iconType="circle" formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Summary */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        <div className="bg-card/60 backdrop-blur-sm border border-border/30 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4 uppercase tracking-wider">Forma de Pagamento</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={formaPagamentoData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(240, 5%, 20%)" />
              <XAxis dataKey="name" stroke="hsl(240, 5%, 50%)" fontSize={10} angle={-15} textAnchor="end" height={50} />
              <YAxis stroke="hsl(240, 5%, 50%)" fontSize={12} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" name="Quantidade" radius={[4, 4, 0, 0]}>
                {formaPagamentoData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card/60 backdrop-blur-sm border border-border/30 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4 uppercase tracking-wider">Resumo por Status</h3>
          <div className="space-y-3">
            {etapaData.map((item, index) => (
              <div key={index} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.fill }} />
                  <span className="text-sm text-muted-foreground">{item.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">{item.value}</span>
                  <span className="text-xs text-muted-foreground">
                    ({vouchers.length > 0 ? ((item.value / vouchers.length) * 100).toFixed(1) : 0}%)
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// Dashboard Tab Component
const DashboardTab = ({ vouchers }: { vouchers: Voucher[] }) => {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const dashboardMetrics = useMemo(() => ({
    pendentesOperacao: vouchers.filter(v => v.etapaAtual === "OPERACAO").length,
    pendentesFiscal: vouchers.filter(v => v.etapaAtual === "FISCAL").length,
    pendentesSupervisor: vouchers.filter(v => v.etapaAtual === "SUPERVISOR").length,
    pendentesFinanceiro: vouchers.filter(v => v.etapaAtual === "FINANCEIRO").length,
    urgentesReal: vouchers.filter(v => v.urgenciaTipo === "URGENTE_REAL").length,
    urgentesAutomatico: vouchers.filter(v => v.urgenciaTipo === "URGENTE_AUTOMATICO").length,
    vencendo24h: vouchers.filter(v => {
      const vencimento = v.vencimento;
      return vencimento >= now && vencimento <= tomorrow && v.etapaAtual !== "ROBO" && v.etapaAtual !== "CONCLUIDO";
    }).length,
    vencidos: vouchers.filter(v => {
      return v.vencimento < now && v.etapaAtual !== "ROBO" && v.etapaAtual !== "CONCLUIDO";
    }).length,
    baixados: vouchers.filter(v => v.etapaAtual === "ROBO" || v.etapaAtual === "CONCLUIDO" || v.statusBaixa !== "PENDENTE").length,
  }), [vouchers, now, tomorrow]);

  const bottleneckData = useMemo(() => {
    const etapasAtivas: EtapaAtual[] = ["OPERACAO", "FISCAL", "SUPERVISOR", "FINANCEIRO"];
    const bottlenecks: { etapa: string; etapaLabel: string; acimaSLA: number; total: number; percentual: number }[] = [];

    for (const etapa of etapasAtivas) {
      const vouchersNaEtapa = vouchers.filter(v => v.etapaAtual === etapa);
      const slaHoras = SLA_POR_ETAPA[etapa] || 24;
      
      let acimaSLA = 0;
      for (const v of vouchersNaEtapa) {
        const horasNaEtapa = (now.getTime() - v.updatedAt.getTime()) / (1000 * 60 * 60);
        if (horasNaEtapa > slaHoras) {
          acimaSLA++;
        }
      }

      if (vouchersNaEtapa.length > 0) {
        bottlenecks.push({
          etapa,
          etapaLabel: ETAPA_LABELS[etapa] || etapa,
          acimaSLA,
          total: vouchersNaEtapa.length,
          percentual: Math.round((acimaSLA / vouchersNaEtapa.length) * 100)
        });
      }
    }
    return bottlenecks.sort((a, b) => b.acimaSLA - a.acimaSLA);
  }, [vouchers, now]);

  const DashboardMetricCard = ({ 
    title, value, icon: Icon, variant = "default", delay = 0
  }: { 
    title: string; value: number; icon: any; variant?: "default" | "warning" | "destructive" | "success"; delay?: number;
  }) => {
    const colorClasses = { default: "text-primary", warning: "text-warning", destructive: "text-destructive", success: "text-success" };
    const bgClasses = { default: "bg-primary/10", warning: "bg-warning/10", destructive: "bg-destructive/10", success: "bg-success/10" };

    return (
      <div className={cn("bg-card/80 backdrop-blur-sm border border-border/50 rounded-lg p-4 hover:border-primary/30 transition-all animate-fade-in")} style={{ animationDelay: `${delay}ms` }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-muted-foreground">{title}</span>
          <div className={cn("p-2 rounded-lg", bgClasses[variant])}>
            <Icon className={cn("h-4 w-4", colorClasses[variant])} />
          </div>
        </div>
        <div className={cn("text-3xl font-bold", colorClasses[variant])}>{value}</div>
      </div>
    );
  };

  const getBarColor = (percentual: number) => {
    if (percentual >= 50) return "hsl(0, 62%, 50%)";
    if (percentual >= 25) return "hsl(38, 92%, 50%)";
    return "hsl(142, 76%, 36%)";
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-card border border-border/50 rounded-lg p-3 shadow-lg">
          <p className="text-sm font-medium text-foreground">{data.etapaLabel}</p>
          <p className="text-sm text-destructive">Acima do SLA: <span className="font-semibold">{data.acimaSLA}</span></p>
          <p className="text-sm text-muted-foreground">Total: <span className="font-semibold">{data.total}</span></p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Vouchers por Etapa */}
      <section>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-foreground/90">
          <Users className="h-5 w-5 text-primary" />
          Vouchers por Etapa
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DashboardMetricCard title="Pendentes - Voucher" value={dashboardMetrics.pendentesOperacao} icon={Clock} variant="default" delay={0} />
          <DashboardMetricCard title="Pendentes - Fiscal" value={dashboardMetrics.pendentesFiscal} icon={Clock} variant="default" delay={50} />
          <DashboardMetricCard title="Pendentes - Supervisor" value={dashboardMetrics.pendentesSupervisor} icon={AlertCircle} variant="warning" delay={100} />
          <DashboardMetricCard title="Pendentes - Financeiro" value={dashboardMetrics.pendentesFinanceiro} icon={Clock} variant="default" delay={150} />
        </div>
      </section>

      {/* Gargalos */}
      <section>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-foreground/90">
          <AlertTriangle className="h-5 w-5 text-warning" />
          Gargalos - Vouchers Acima do SLA
        </h2>
        {bottleneckData.length > 0 ? (
          <div className="bg-card/80 backdrop-blur-sm border border-border/50 rounded-xl p-6 animate-fade-in">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={bottleneckData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(240, 5%, 20%)" />
                <XAxis type="number" stroke="hsl(240, 5%, 50%)" fontSize={12} />
                <YAxis type="category" dataKey="etapaLabel" stroke="hsl(240, 5%, 50%)" fontSize={12} width={100} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="acimaSLA" name="Acima do SLA" radius={[0, 4, 4, 0]}>
                  {bottleneckData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getBarColor(entry.percentual)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-6 mt-4 text-xs">
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-green-500" /><span className="text-muted-foreground">&lt; 25% acima SLA</span></div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-warning" /><span className="text-muted-foreground">25-50% acima SLA</span></div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-destructive" /><span className="text-muted-foreground">&gt; 50% acima SLA</span></div>
            </div>
          </div>
        ) : (
          <div className="bg-card/80 backdrop-blur-sm border border-border/50 rounded-xl p-8 text-center text-muted-foreground animate-fade-in">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
            Nenhum voucher acima do SLA no momento
          </div>
        )}
      </section>

      {/* Urgências */}
      <section>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-foreground/90">
          <AlertCircle className="h-5 w-5 text-destructive" />
          Vouchers Urgentes
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <DashboardMetricCard title="Urgentes Real (Aprovação Manual)" value={dashboardMetrics.urgentesReal} icon={FileWarning} variant="destructive" delay={300} />
          <DashboardMetricCard title="Urgentes Automático (ICMS/Armazenagem)" value={dashboardMetrics.urgentesAutomatico} icon={TrendingUp} variant="warning" delay={350} />
        </div>
      </section>

      {/* Vencimentos */}
      <section>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-foreground/90">
          <Clock className="h-5 w-5 text-info" />
          Vencimentos e Status
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <DashboardMetricCard title="Vencendo em 24h" value={dashboardMetrics.vencendo24h} icon={Clock} variant="warning" delay={400} />
          <DashboardMetricCard title="Vencidos" value={dashboardMetrics.vencidos} icon={AlertCircle} variant="destructive" delay={450} />
          <DashboardMetricCard title="Baixados" value={dashboardMetrics.baixados} icon={CheckCircle2} variant="success" delay={500} />
        </div>
      </section>

      {/* Alertas de SLA */}
      {(dashboardMetrics.vencidos > 0 || dashboardMetrics.vencendo24h > 0) && (
        <div className="border border-warning/30 bg-warning/5 backdrop-blur-sm rounded-xl p-6 animate-fade-in">
          <h3 className="text-warning flex items-center gap-2 font-semibold mb-4">
            <AlertCircle className="h-5 w-5" />
            Alertas de SLA
          </h3>
          <div className="space-y-3">
            {dashboardMetrics.vencidos > 0 && (
              <div className="flex items-center justify-between p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                <div>
                  <p className="font-medium text-destructive">Vouchers Vencidos</p>
                  <p className="text-sm text-muted-foreground">{dashboardMetrics.vencidos} voucher(s) já passaram do vencimento</p>
                </div>
                <span className="bg-destructive text-destructive-foreground px-3 py-1 rounded-full text-sm font-medium">{dashboardMetrics.vencidos}</span>
              </div>
            )}
            {dashboardMetrics.vencendo24h > 0 && (
              <div className="flex items-center justify-between p-4 bg-warning/10 border border-warning/20 rounded-lg">
                <div>
                  <p className="font-medium text-warning">Atenção: Vencimento Próximo</p>
                  <p className="text-sm text-muted-foreground">{dashboardMetrics.vencendo24h} voucher(s) vencem nas próximas 24 horas</p>
                </div>
                <span className="bg-warning text-warning-foreground px-3 py-1 rounded-full text-sm font-medium">{dashboardMetrics.vencendo24h}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const EsteiraIndex = () => {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"processos" | "dashboard" | "analytics" | "robo" | "relatorios">("processos");
  const [filters, setFilters] = useState<FilterValues>({
    search: "",
    etapa: "all",
    cobrancaEmNomeDe: "all",
    formaPagamento: "all",
    urgente: "all"
  });
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    ativos: 0,
    slaAtencao: 0,
    pendenciasFinanceiras: 0,
    eventos24h: 0,
  });
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Quick filters
  const [quickFilterFornecedor, setQuickFilterFornecedor] = useState<string>("all");
  const [quickFilterCobranca, setQuickFilterCobranca] = useState<string>("all");
  const [drillDownFilter, setDrillDownFilter] = useState<DrillDownFilter>("all");

  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState<Voucher | null>(null);
  
  const { toast } = useToast();
  const navigate = useNavigate();
  const { role, isOperacao, isFiscal, isFinanceiro, isAdmin, isGestor } = useUserRole();

  // Get current user ID
  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);
    };
    getCurrentUser();
  }, []);

  const loadVouchers = async () => {
    try {
      setLoading(true);
      const { data, error } = await (supabase as any).from("vouchers").select(`
          *,
          anexos:voucher_anexos(id, tipo, file_name, file_url, file_size),
          logs:voucher_logs(id, data_hora, acao, detalhe, user_id)
        `).order("created_at", { ascending: false });

      if (error) throw error;

      const mappedVouchers: Voucher[] = (data || []).map((v: any) => ({
        id: v.id,
        numeroSPO: v.numero_spo,
        fornecedor: v.fornecedor,
        cnpjFornecedor: v.cnpj_fornecedor,
        valor: v.valor,
        moeda: v.moeda || "BRL",
        vencimento: new Date(v.vencimento),
        dataEmissaoDocumento: v.data_emissao_documento ? new Date(v.data_emissao_documento) : undefined,
        cobrancaEmNomeDe: v.cobranca_em_nome_de,
        formaPagamento: v.forma_pagamento,
        tipoDocumento: v.tipo_documento,
        filial: v.filial,
        remessa: v.remessa,
        urgente: v.urgencia_tipo !== "NORMAL",
        urgenciaTipo: v.urgencia_tipo || "NORMAL",
        comentariosOperacao: v.comentarios_operacao,
        comentariosFiscal: v.comentarios_fiscal,
        comentariosFinanceiro: v.comentarios_financeiro,
        ajusteOperacao: v.ajuste_operacao,
        ajusteFiscal: v.ajuste_fiscal,
        etapaAtual: v.etapa_atual,
        statusBaixa: v.status_baixa || "PENDENTE",
        statusFinanceiro: v.status_financeiro || "PENDENTE",
        statusEnvioCliente: v.status_envio_cliente,
        criadoPorUserId: v.criado_por_user_id,
        responsavelOperacaoUserId: v.responsavel_operacao_user_id,
        responsavelFiscalUserId: v.responsavel_fiscal_user_id,
        responsavelSupervisorUserId: v.responsavel_supervisor_user_id,
        responsavelFinanceiroUserId: v.responsavel_financeiro_user_id,
        aprovadoPorUserId: v.aprovado_por_user_id,
        clienteEmail: v.cliente_email,
        createdAt: new Date(v.created_at),
        updatedAt: new Date(v.updated_at),
        anexos: (v.anexos || []).map((a: any) => ({
          id: a.id,
          voucherId: v.id,
          tipo: a.tipo,
          fileName: a.file_name,
          fileUrl: a.file_url,
          fileSize: a.file_size,
          uploadedByUserId: v.criado_por_user_id,
          createdAt: new Date()
        })),
        logs: (v.logs || []).map((l: any) => ({
          id: l.id,
          voucherId: v.id,
          dataHora: new Date(l.data_hora),
          userId: l.user_id,
          acao: l.acao,
          detalhe: l.detalhe
        }))
      }));
      setVouchers(mappedVouchers);
      
      // Calculate metrics (consolidated)
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);

      // Ativos = todos não concluídos
      const ativos = mappedVouchers.filter(v => v.etapaAtual !== "CONCLUIDO");
      
      // SLA Atenção = vencendo em 24h + já vencidos
      const slaAtencao = mappedVouchers.filter(v => {
        if (v.etapaAtual === "CONCLUIDO") return false;
        const vencimento = v.vencimento;
        return vencimento <= tomorrow;
      });
      
      // Pendências Financeiras = sem accrual + aguardando comprovante + exceções
      const pendenciasFinanceiras = mappedVouchers.filter(v => {
        if (v.etapaAtual === "CONCLUIDO") return false;
        const aguardandoComprovante = v.etapaAtual === "FINANCEIRO" || v.etapaAtual === "ROBO";
        const emExcecao = v.urgenciaTipo === "URGENTE_REAL";
        return aguardandoComprovante || emExcecao;
      });
      
      // Eventos 24h
      const recentVouchers = mappedVouchers.filter(v => v.updatedAt >= yesterday);

      setMetrics({
        ativos: ativos.length,
        slaAtencao: slaAtencao.length,
        pendenciasFinanceiras: pendenciasFinanceiras.length,
        eventos24h: recentVouchers.length,
      });

    } catch (error: any) {
      toast({
        title: "Erro ao carregar vouchers",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVouchers();
  }, []);

  // Apply role-based filtering first
  const roleFilteredVouchers = useMemo(() => {
    if (isAdmin || isGestor) {
      return vouchers;
    }

    if (isOperacao) {
      return vouchers.filter(v => 
        v.criadoPorUserId === currentUserId || 
        v.responsavelOperacaoUserId === currentUserId
      );
    }

    if (isFiscal) {
      return vouchers.filter(v => 
        v.etapaAtual === "FISCAL" || 
        v.etapaAtual === "AJUSTE_FISCAL" ||
        v.responsavelFiscalUserId === currentUserId
      );
    }

    if (isFinanceiro) {
      return vouchers.filter(v => 
        v.etapaAtual === "FINANCEIRO" || 
        v.etapaAtual === "ROBO" ||
        v.responsavelFinanceiroUserId === currentUserId
      );
    }

    return vouchers;
  }, [vouchers, role, currentUserId, isAdmin, isGestor, isOperacao, isFiscal, isFinanceiro]);

  const filterVouchers = (vouchersList: Voucher[]) => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    return vouchersList.filter(voucher => {
      // Drill-down filter from metric cards
      if (drillDownFilter !== "all") {
        switch (drillDownFilter) {
          case "ativos":
            if (voucher.etapaAtual === "CONCLUIDO") return false;
            break;
          case "sla":
            if (voucher.etapaAtual === "CONCLUIDO") return false;
            if (voucher.vencimento > tomorrow) return false;
            break;
          case "pendencias":
            if (voucher.etapaAtual === "CONCLUIDO") return false;
            const aguardandoComprovante = voucher.etapaAtual === "FINANCEIRO" || voucher.etapaAtual === "ROBO";
            const emExcecao = voucher.urgenciaTipo === "URGENTE_REAL";
            if (!aguardandoComprovante && !emExcecao) return false;
            break;
          case "atividade":
            if (voucher.updatedAt < yesterday) return false;
            break;
        }
      }

      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesSPO = voucher.numeroSPO.toLowerCase().includes(searchLower);
        const matchesFornecedor = voucher.fornecedor?.toLowerCase().includes(searchLower);
        if (!matchesSPO && !matchesFornecedor) return false;
      }
      if (filters.etapa !== "all" && voucher.etapaAtual !== filters.etapa) {
        return false;
      }
      if (filters.cobrancaEmNomeDe !== "all" && voucher.cobrancaEmNomeDe !== filters.cobrancaEmNomeDe) {
        return false;
      }
      if (filters.formaPagamento !== "all" && voucher.formaPagamento !== filters.formaPagamento) {
        return false;
      }
      if (filters.urgente !== "all") {
        const isUrgente = voucher.urgenciaTipo !== "NORMAL";
        if (filters.urgente === "true" && !isUrgente) return false;
        if (filters.urgente === "false" && isUrgente) return false;
      }
      // Quick filter: Fornecedor
      if (quickFilterFornecedor !== "all" && voucher.fornecedor !== quickFilterFornecedor) {
        return false;
      }
      // Quick filter: Cobrança
      if (quickFilterCobranca !== "all" && voucher.cobrancaEmNomeDe !== quickFilterCobranca) {
        return false;
      }
      return true;
    });
  };
  
  const filteredVouchers = filterVouchers(roleFilteredVouchers);

  // Lista de fornecedores únicos para o filtro rápido
  const uniqueFornecedores = useMemo(() => {
    const fornecedores = vouchers
      .map(v => v.fornecedor)
      .filter((f): f is string => !!f);
    return [...new Set(fornecedores)].sort();
  }, [vouchers]);

  const handleViewDetails = (voucher: Voucher) => {
    navigate(`/fin/esteira/voucher/${voucher.id}`);
  };

  const handleEdit = (voucher: Voucher) => {
    setSelectedVoucher(voucher);
    setShowEditDialog(true);
  };

  const handleDelete = async (voucher: Voucher) => {
    try {
      await (supabase as any).from("voucher_logs").delete().eq("voucher_id", voucher.id);
      await (supabase as any).from("voucher_anexos").delete().eq("voucher_id", voucher.id);
      const { error } = await (supabase as any).from("vouchers").delete().eq("id", voucher.id);
      
      if (error) throw error;
      
      toast({
        title: "Voucher excluído",
        description: `Voucher ${voucher.numeroSPO} foi excluído com sucesso`,
      });
      
      loadVouchers();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleGoBack = async (voucher: Voucher) => {
    try {
      let previousStage: EtapaAtual;

      switch (voucher.etapaAtual) {
        case "FISCAL":
          previousStage = "OPERACAO";
          break;
        case "SUPERVISOR":
          previousStage = "FISCAL";
          break;
        case "FINANCEIRO":
          previousStage = voucher.cobrancaEmNomeDe === "CLIENTE" ? "OPERACAO" : "FISCAL";
          break;
        case "ROBO":
          previousStage = "FINANCEIRO";
          break;
        case "AJUSTE_OPERACAO":
          previousStage = "FISCAL";
          break;
        case "AJUSTE_FISCAL":
          previousStage = "FINANCEIRO";
          break;
        default:
          throw new Error("Não é possível voltar desta etapa");
      }

      const { error } = await (supabase as any)
        .from("vouchers")
        .update({ etapa_atual: previousStage })
        .eq("id", voucher.id);

      if (error) throw error;

      toast({
        title: "Etapa atualizada",
        description: `Voucher retornou para etapa ${previousStage.replace("_", " ")}`,
      });

      loadVouchers();
    } catch (error: any) {
      toast({
        title: "Erro ao voltar etapa",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <PageLayout>
      <main className="container mx-auto px-4 py-6 space-y-6 overflow-x-hidden">
        {/* Metric Cards Row - Consolidated with drill-down */}
        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 w-full overflow-hidden">
          <MetricCard
            title="EM ANDAMENTO"
            value={metrics.ativos}
            subtitle="Vouchers ativos"
            icon={Package}
            variant="default"
            delay={0}
            isActive={drillDownFilter === "ativos"}
            onClick={() => setDrillDownFilter(drillDownFilter === "ativos" ? "all" : "ativos")}
          />
          <MetricCard
            title="SLA"
            value={metrics.slaAtencao}
            subtitle="Vencendo/Vencidos"
            icon={AlertTriangle}
            variant={metrics.slaAtencao > 0 ? "critical" : "warning"}
            delay={50}
            isActive={drillDownFilter === "sla"}
            onClick={() => setDrillDownFilter(drillDownFilter === "sla" ? "all" : "sla")}
          />
          <MetricCard
            title="PENDÊNCIAS"
            value={metrics.pendenciasFinanceiras}
            subtitle="Accrual/Comprovante/Exceção"
            icon={FileWarning}
            variant={metrics.pendenciasFinanceiras > 0 ? "warning" : "info"}
            delay={100}
            isActive={drillDownFilter === "pendencias"}
            onClick={() => setDrillDownFilter(drillDownFilter === "pendencias" ? "all" : "pendencias")}
          />
          <MetricCard
            title="ATIVIDADE"
            value={metrics.eventos24h}
            subtitle="Últimas 24h"
            icon={Clock}
            variant="info"
            delay={150}
            isActive={drillDownFilter === "atividade"}
            onClick={() => setDrillDownFilter(drillDownFilter === "atividade" ? "all" : "atividade")}
          />
        </div>

        {/* Active drill-down indicator */}
        {drillDownFilter !== "all" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-primary/10 border border-primary/20 rounded-lg px-4 py-2">
            <Filter className="h-4 w-4 text-primary" />
            <span>Filtrando por: <strong className="text-primary">
              {drillDownFilter === "ativos" && "Em Andamento"}
              {drillDownFilter === "sla" && "SLA (Vencendo/Vencidos)"}
              {drillDownFilter === "pendencias" && "Pendências Financeiras"}
              {drillDownFilter === "atividade" && "Atividade 24h"}
            </strong></span>
            <Button 
              variant="ghost" 
              size="sm" 
              className="ml-auto h-6 px-2 text-xs"
              onClick={() => setDrillDownFilter("all")}
            >
              Limpar
            </Button>
          </div>
        )}

        {/* Quick Filters Row */}
        <div className="flex items-center gap-4 flex-wrap bg-card/40 backdrop-blur-sm border border-border/30 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">Filtros Rápidos:</span>
          </div>
          
          {/* Filtro por Fornecedor */}
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <Select value={quickFilterFornecedor} onValueChange={setQuickFilterFornecedor}>
              <SelectTrigger className="w-[180px] bg-background/50 border-border/50">
                <SelectValue placeholder="Fornecedor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Fornecedores</SelectItem>
                {uniqueFornecedores.map((fornecedor) => (
                  <SelectItem key={fornecedor} value={fornecedor}>
                    {fornecedor}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Filtro por Cobrança */}
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <Select value={quickFilterCobranca} onValueChange={setQuickFilterCobranca}>
              <SelectTrigger className="w-[160px] bg-background/50 border-border/50">
                <SelectValue placeholder="Cobrança" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Cobranças</SelectItem>
                <SelectItem value="DACHSER">DACHSER</SelectItem>
                <SelectItem value="CLIENTE">CLIENTE</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Clear filters */}
          {(quickFilterFornecedor !== "all" || quickFilterCobranca !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setQuickFilterFornecedor("all");
                setQuickFilterCobranca("all");
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              Limpar filtros
            </Button>
          )}
        </div>

        {/* Tabs and Actions Row */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* Left: Tabs */}
          <div className="flex items-center gap-1 bg-background/50 backdrop-blur-sm border border-border/30 rounded-lg p-1">
            <button
              onClick={() => setActiveTab("processos")}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
                activeTab === "processos"
                  ? "bg-card text-foreground border border-border/50"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <List className="h-4 w-4" />
              Processos
            </button>
            <button
              onClick={() => setActiveTab("dashboard")}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
                activeTab === "dashboard"
                  ? "bg-card text-foreground border border-border/50"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab("analytics")}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
                activeTab === "analytics"
                  ? "bg-card text-foreground border border-border/50"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <BarChart3 className="h-4 w-4" />
              Analytics
            </button>
            <button
              onClick={() => setActiveTab("robo")}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
                activeTab === "robo"
                  ? "bg-card text-foreground border border-border/50"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Bot className="h-4 w-4" />
              Robô
            </button>
            <button
              onClick={() => setActiveTab("relatorios")}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
                activeTab === "relatorios"
                  ? "bg-card text-foreground border border-border/50"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <FileSpreadsheet className="h-4 w-4" />
              Relatórios
            </button>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadVouchers()}
              className="gap-2 border-border/50 hover:border-primary/50"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </Button>
            <Button 
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20" 
              onClick={() => setShowCreateDialog(true)}
            >
              <Plus className="h-4 w-4" />
              Enviar Voucher
            </Button>
          </div>
        </div>

        {/* Content Area */}
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Carregando...</div>
        ) : activeTab === "processos" ? (
          <div className="bg-card/60 backdrop-blur-sm border border-border/30 rounded-xl overflow-hidden shadow-lg animate-fade-in">
            <VoucherTable 
              vouchers={filteredVouchers} 
              onViewDetails={handleViewDetails}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onGoBack={handleGoBack}
              filters={filters}
              onFilterChange={setFilters}
            />
          </div>
        ) : activeTab === "dashboard" ? (
          <DashboardTab vouchers={vouchers} />
        ) : activeTab === "robo" ? (
          <RoboTab />
        ) : activeTab === "relatorios" ? (
          <ReportsTab />
        ) : (
          <AnalyticsDashboard vouchers={vouchers} />
        )}
      </main>

      <CreateVoucherDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} onSuccess={loadVouchers} />
      <EditVoucherDialog 
        open={showEditDialog} 
        onOpenChange={setShowEditDialog} 
        onSuccess={loadVouchers}
        voucher={selectedVoucher}
      />
    </PageLayout>
  );
};

export default EsteiraIndex;
