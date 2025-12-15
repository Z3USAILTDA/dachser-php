import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useUsageLog } from "@/hooks/useUsageLog";
import { ArrowLeft, Plus, Package, AlertTriangle, AlertCircle, Clock, List, BarChart3, RefreshCw, TrendingUp, DollarSign, Calendar, Bot, FileSpreadsheet, Filter, Building2, Users, LayoutDashboard, CheckCircle2, FileWarning, HelpCircle, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Voucher, EtapaAtual, ETAPA_LABELS, SLA_POR_ETAPA } from "@/types/voucher";
import { useUserRole } from "@/hooks/useUserRole";
import { useVoucherSync } from "@/hooks/useVoucherSync";
import { cn } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, Legend } from "recharts";
import { VoucherTable, FilterValues } from "@/components/esteira/VoucherTable";
import { CreateVoucherDialog } from "@/components/esteira/CreateVoucherDialog";
import { EditVoucherDialog } from "@/components/esteira/EditVoucherDialog";
import { RoboTab } from "@/components/tabs/RoboTab";
import { ReportsTab } from "@/components/tabs/ReportsTab";
import { MetricCard } from "@/components/cct/MetricCard";
import dachserBg from "@/assets/dachser-background.jpg";
interface DashboardMetrics {
  ativos: number;
  slaAtencao: number;
  pendenciasFinanceiras: number;
  eventos24h: number;
}
type DrillDownFilter = "all" | "ativos" | "sla" | "pendencias" | "atividade";
const CHART_COLORS = {
  primary: "hsl(38, 92%, 50%)",
  warning: "hsl(38, 92%, 50%)",
  critical: "hsl(0, 62%, 50%)",
  info: "hsl(200, 98%, 50%)",
  success: "hsl(142, 76%, 36%)",
  muted: "hsl(240, 5%, 34%)"
};
const PIE_COLORS = [CHART_COLORS.primary, CHART_COLORS.info, CHART_COLORS.success, CHART_COLORS.warning, CHART_COLORS.critical, CHART_COLORS.muted];
const AnalyticsDashboard = ({
  vouchers
}: {
  vouchers: Voucher[];
}) => {
  const etapaData = useMemo(() => {
    const counts: Record<string, number> = {};
    vouchers.forEach(v => {
      const etapa = v.etapaAtual;
      counts[etapa] = (counts[etapa] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({
      name: name.replace("_", " "),
      value,
      fill: name === "CONCLUIDO" ? CHART_COLORS.success : name === "FINANCEIRO" ? CHART_COLORS.info : name === "FISCAL" ? CHART_COLORS.warning : name === "OPERACAO" ? CHART_COLORS.primary : CHART_COLORS.muted
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
    const months: Record<string, {
      criados: number;
      concluidos: number;
    }> = {};
    const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${monthNames[d.getMonth()]}/${d.getFullYear().toString().slice(-2)}`;
      months[key] = {
        criados: 0,
        concluidos: 0
      };
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
    const counts = {
      NORMAL: 0,
      URGENTE_REAL: 0,
      URGENTE_AUTOMATICO: 0
    };
    vouchers.forEach(v => {
      const tipo = v.urgenciaTipo || "NORMAL";
      if (counts[tipo as keyof typeof counts] !== undefined) {
        counts[tipo as keyof typeof counts]++;
      }
    });
    return [{
      name: "Normal",
      value: counts.NORMAL,
      fill: CHART_COLORS.success
    }, {
      name: "Urgente Real",
      value: counts.URGENTE_REAL,
      fill: CHART_COLORS.critical
    }, {
      name: "Urgente Auto",
      value: counts.URGENTE_AUTOMATICO,
      fill: CHART_COLORS.warning
    }];
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
    return Math.round(concluidos / vouchers.length * 100);
  }, [vouchers]);
  const CustomTooltip = ({
    active,
    payload,
    label
  }: any) => {
    if (active && payload && payload.length) {
      return <div className="bg-card border border-border/50 rounded-lg p-3 shadow-lg">
          <p className="text-sm font-medium text-foreground">{label}</p>
          {payload.map((entry: any, index: number) => <p key={index} className="text-sm text-muted-foreground">
              {entry.name}: <span className="font-semibold text-foreground">{entry.value.toLocaleString('pt-BR')}</span>
            </p>)}
        </div>;
    }
    return null;
  };
  return <div className="space-y-5 animate-fade-in">
      {/* KPIs Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl bg-[#0a0b10] border border-white/10">
          <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Valor Total</div>
          <div className="text-xl font-bold mt-1">R$ {totalValor.toLocaleString('pt-BR', {
            minimumFractionDigits: 2
          })}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Soma de todos os vouchers</div>
        </div>
        <div className="p-3 rounded-xl bg-[#0a0b10] border border-white/10">
          <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Valor Médio</div>
          <div className="text-xl font-bold mt-1">R$ {mediaValor.toLocaleString('pt-BR', {
            minimumFractionDigits: 2
          })}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Média por voucher</div>
        </div>
        <div className="p-3 rounded-xl bg-[#0a0b10] border border-white/10">
          <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Taxa Conclusão</div>
          <div className="text-xl font-bold mt-1">{taxaConclusao}%</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Finalizados / Total</div>
        </div>
        <div className="p-3 rounded-xl bg-[#0a0b10] border border-white/10">
          <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Total Vouchers</div>
          <div className="text-xl font-bold mt-1">{vouchers.length}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Cadastrados no sistema</div>
        </div>
      </div>

      {/* Charts Row 1 */}
      <div className="grid gap-5 grid-cols-1 lg:grid-cols-2">
        <div className="rounded-xl bg-[#05060c] border border-white/10 p-4">
          <div className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground mb-1">Vouchers por Mês</div>
          <div className="text-[10px] text-muted-foreground mb-3">Volume mensal de vouchers criados e finalizados.</div>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={vouchersPorMes}>
              <defs>
                <linearGradient id="colorCriados" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLORS.primary} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorConcluidos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLORS.success} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={CHART_COLORS.success} stopOpacity={0} />
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

        <div className="rounded-xl bg-[#05060c] border border-white/10 p-4">
          <div className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground mb-1">Distribuição por Etapa</div>
          <div className="text-[10px] text-muted-foreground mb-3">Vouchers em cada etapa do workflow.</div>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={etapaData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={2} dataKey="value" label={({
              name,
              percent
            }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                {etapaData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid gap-5 grid-cols-1 lg:grid-cols-3">
        <div className="rounded-xl bg-[#05060c] border border-white/10 p-4 lg:col-span-2">
          <div className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground mb-1">Valor por Etapa (R$)</div>
          <div className="text-[10px] text-muted-foreground mb-3">Valor total acumulado em cada etapa.</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={valorPorEtapa} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(240, 5%, 20%)" />
              <XAxis type="number" stroke="hsl(240, 5%, 50%)" fontSize={12} tickFormatter={value => `${(value / 1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="name" stroke="hsl(240, 5%, 50%)" fontSize={11} width={80} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="valor" name="Valor" fill={CHART_COLORS.primary} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl bg-[#05060c] border border-white/10 p-4">
          <div className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground mb-1">Classificação Urgência</div>
          <div className="text-[10px] text-muted-foreground mb-3">Por tipo de urgência.</div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={urgenciaData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={3} dataKey="value">
                {urgenciaData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend iconType="circle" formatter={value => <span className="text-xs text-muted-foreground">{value}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Summary */}
      <div className="grid gap-5 grid-cols-1 lg:grid-cols-2">
        <div className="rounded-xl bg-[#05060c] border border-white/10 p-4">
          <div className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground mb-1">Forma de Pagamento</div>
          <div className="text-[10px] text-muted-foreground mb-3">Distribuição por forma de pagamento.</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={formaPagamentoData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(240, 5%, 20%)" />
              <XAxis dataKey="name" stroke="hsl(240, 5%, 50%)" fontSize={10} angle={-15} textAnchor="end" height={50} />
              <YAxis stroke="hsl(240, 5%, 50%)" fontSize={12} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" name="Quantidade" radius={[4, 4, 0, 0]}>
                {formaPagamentoData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl bg-[#05060c] border border-white/10 p-4">
          <div className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground mb-3">Resumo por Status</div>
          <div className="space-y-2.5">
            {etapaData.map((item, index) => <div key={index} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{
                backgroundColor: item.fill
              }} />
                  <span className="text-sm text-muted-foreground">{item.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">{item.value}</span>
                  <span className="text-xs text-muted-foreground">
                    ({vouchers.length > 0 ? (item.value / vouchers.length * 100).toFixed(1) : 0}%)
                  </span>
                </div>
              </div>)}
          </div>
        </div>
      </div>
    </div>;
};

// Dashboard Tab Component
const DashboardTab = ({
  vouchers
}: {
  vouchers: Voucher[];
}) => {
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
    baixados: vouchers.filter(v => v.etapaAtual === "ROBO" || v.etapaAtual === "CONCLUIDO" || v.statusBaixa !== "PENDENTE").length
  }), [vouchers, now, tomorrow]);
  const bottleneckData = useMemo(() => {
    const etapasAtivas: EtapaAtual[] = ["OPERACAO", "FISCAL", "SUPERVISOR", "FINANCEIRO"];
    const bottlenecks: {
      etapa: string;
      etapaLabel: string;
      acimaSLA: number;
      total: number;
      percentual: number;
    }[] = [];
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
          percentual: Math.round(acimaSLA / vouchersNaEtapa.length * 100)
        });
      }
    }
    return bottlenecks.sort((a, b) => b.acimaSLA - a.acimaSLA);
  }, [vouchers, now]);
  const DashboardMetricCard = ({
    title,
    value,
    icon: Icon,
    variant = "default",
    delay = 0
  }: {
    title: string;
    value: number;
    icon: any;
    variant?: "default" | "warning" | "destructive" | "success";
    delay?: number;
  }) => {
    const colorClasses = {
      default: "text-primary",
      warning: "text-warning",
      destructive: "text-destructive",
      success: "text-green-500"
    };
    return <div className="p-3 rounded-xl bg-[#0a0b10] border border-white/10 hover:border-primary/30 transition-all" style={{
      animationDelay: `${delay}ms`
    }}>
        <div className="flex items-center gap-3">
          <div className={cn("p-2 rounded-full", variant === "default" ? "bg-primary/20" : variant === "warning" ? "bg-warning/20" : variant === "destructive" ? "bg-destructive/20" : "bg-green-500/20")}>
            <Icon className={cn("h-4 w-4", colorClasses[variant])} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{title}</div>
            <div className={cn("text-xl font-bold mt-0.5", colorClasses[variant])}>{value}</div>
          </div>
        </div>
      </div>;
  };
  const getBarColor = (percentual: number) => {
    if (percentual >= 50) return "hsl(0, 62%, 50%)";
    if (percentual >= 25) return "hsl(38, 92%, 50%)";
    return "hsl(142, 76%, 36%)";
  };
  const CustomTooltip = ({
    active,
    payload
  }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return <div className="bg-card border border-border/50 rounded-lg p-3 shadow-lg">
          <p className="text-sm font-medium text-foreground">{data.etapaLabel}</p>
          <p className="text-sm text-destructive">Acima do SLA: <span className="font-semibold">{data.acimaSLA}</span></p>
          <p className="text-sm text-muted-foreground">Total: <span className="font-semibold">{data.total}</span></p>
        </div>;
    }
    return null;
  };
  return <div className="space-y-6 animate-fade-in">
      {/* Vouchers por Etapa */}
      <div className="rounded-2xl p-5 bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] backdrop-blur-[18px] shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
        <div className="text-[0.75rem] uppercase tracking-wider text-[#aaaaaa] mb-4 flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          Vouchers por Etapa
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard title="Pendentes - Voucher" value={dashboardMetrics.pendentesOperacao} icon={Clock} subtitle="Etapa OPERACAO" />
          <MetricCard title="Pendentes - Fiscal" value={dashboardMetrics.pendentesFiscal} icon={Clock} subtitle="Etapa FISCAL" />
          <MetricCard title="Pendentes - Supervisor" value={dashboardMetrics.pendentesSupervisor} icon={AlertCircle} variant="warning" subtitle="Etapa SUPERVISOR" />
          <MetricCard title="Pendentes - Financeiro" value={dashboardMetrics.pendentesFinanceiro} icon={Clock} subtitle="Etapa FINANCEIRO" />
        </div>
      </div>

      {/* Gargalos */}
      <div className="rounded-2xl p-5 bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] backdrop-blur-[18px] shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
        <div className="text-[0.75rem] uppercase tracking-wider text-[#aaaaaa] mb-4 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-yellow-400" />
          Gargalos - Vouchers Acima do SLA
        </div>
        {bottleneckData.length > 0 ? <div className="rounded-xl bg-[#05060c] border border-white/10 p-4">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={bottleneckData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(240, 5%, 20%)" />
                <XAxis type="number" stroke="hsl(240, 5%, 50%)" fontSize={12} />
                <YAxis type="category" dataKey="etapaLabel" stroke="hsl(240, 5%, 50%)" fontSize={12} width={100} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="acimaSLA" name="Acima do SLA" radius={[0, 4, 4, 0]}>
                  {bottleneckData.map((entry, index) => <Cell key={`cell-${index}`} fill={getBarColor(entry.percentual)} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-4 mt-3 text-[10px]">
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded bg-emerald-500" /><span className="text-[#888888]">&lt; 25%</span></div>
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded bg-yellow-400" /><span className="text-[#888888]">25-50%</span></div>
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded bg-rose-500" /><span className="text-[#888888]">&gt; 50%</span></div>
            </div>
          </div> : <div className="rounded-xl bg-[#05060c] border border-white/10 p-6 text-center text-[#888888]">
            <CheckCircle2 className="h-6 w-6 mx-auto mb-2 text-emerald-400" />
            <span className="text-sm">Nenhum voucher acima do SLA</span>
          </div>}
      </div>

      {/* Urgências e Vencimentos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-2xl p-5 bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] backdrop-blur-[18px] shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
          <div className="text-[0.75rem] uppercase tracking-wider text-[#aaaaaa] mb-4 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-400" />
            Vouchers Urgentes
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <MetricCard title="Urgentes Real" value={dashboardMetrics.urgentesReal} icon={FileWarning} variant="critical" subtitle="Aprovação manual" />
            <MetricCard title="Urgentes Automático" value={dashboardMetrics.urgentesAutomatico} icon={TrendingUp} variant="warning" subtitle="ICMS/Armazenagem" />
          </div>
        </div>

        <div className="rounded-2xl p-5 bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] backdrop-blur-[18px] shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
          <div className="text-[0.75rem] uppercase tracking-wider text-[#aaaaaa] mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4 text-blue-400" />
            Vencimentos e Status
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <MetricCard title="Vencendo 24h" value={dashboardMetrics.vencendo24h} icon={Clock} variant="warning" subtitle="Atenção" />
            <MetricCard title="Vencidos" value={dashboardMetrics.vencidos} icon={AlertCircle} variant="critical" subtitle="Atrasados" />
            <MetricCard title="Baixados" value={dashboardMetrics.baixados} icon={CheckCircle2} variant="success" subtitle="Finalizados" />
          </div>
        </div>
      </div>

      {/* Alertas de SLA */}
      {(dashboardMetrics.vencidos > 0 || dashboardMetrics.vencendo24h > 0) && <div className="rounded-2xl p-5 bg-[rgba(5,6,18,0.9)] border border-yellow-500/30 backdrop-blur-[18px] shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
          <div className="text-[0.75rem] uppercase tracking-wider text-yellow-400 mb-4 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Alertas de SLA
          </div>
          <div className="space-y-2">
            {dashboardMetrics.vencidos > 0 && <div className="flex items-center justify-between p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-rose-400">Vouchers Vencidos</p>
                  <p className="text-xs text-[#888888]">{dashboardMetrics.vencidos} voucher(s) já passaram do vencimento</p>
                </div>
                <span className="bg-rose-500 text-white px-2.5 py-1 rounded-full text-xs font-medium">{dashboardMetrics.vencidos}</span>
              </div>}
            {dashboardMetrics.vencendo24h > 0 && <div className="flex items-center justify-between p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-yellow-400">Atenção: Vencimento Próximo</p>
                  <p className="text-xs text-[#888888]">{dashboardMetrics.vencendo24h} voucher(s) vencem nas próximas 24 horas</p>
                </div>
                <span className="bg-yellow-500 text-black px-2.5 py-1 rounded-full text-xs font-medium">{dashboardMetrics.vencendo24h}</span>
              </div>}
          </div>
        </div>}
    </div>;
};
const EsteiraIndex = () => {
  useUsageLog({ endpoint: "/fin/esteira" });
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const [activeTab, setActiveTab] = useState<"processos" | "dashboard" | "analytics" | "robo" | "relatorios">("processos");
  const [filters, setFilters] = useState<FilterValues>({
    search: "",
    etapa: "all",
    cobrancaEmNomeDe: "all",
    formaPagamento: "all",
    urgente: "all",
    statusBaixa: "all",
    statusComprovante: "all"
  });
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    ativos: 0,
    slaAtencao: 0,
    pendenciasFinanceiras: 0,
    eventos24h: 0
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
  const {
    toast
  } = useToast();
  const navigate = useNavigate();
  const {
    role,
    isOperacao,
    isFiscal,
    isFinanceiro,
    isAdmin,
    isGestor
  } = useUserRole();
  const storedUser = localStorage.getItem("user");
  const user = storedUser ? JSON.parse(storedUser) : null;

  // Enable automatic sync of voucher updates to MariaDB
  useVoucherSync();

  // Get current user ID
  useEffect(() => {
    const getCurrentUser = async () => {
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);
    };
    getCurrentUser();
  }, []);
  const loadVouchers = async () => {
    try {
      setLoading(true);
      setIsRefetching(true);

      // Load from MariaDB t_vouchers exclusively
      const {
        data,
        error
      } = await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "get_vouchers_esteira",
          limit: 500
        }
      });
      if (error) throw error;
      const mappedVouchers: Voucher[] = (data?.data || []).map((v: any) => ({
        id: v.id,
        numeroSPO: v.numero_spo,
        fornecedor: v.fornecedor,
        cnpjFornecedor: v.cnpj_fornecedor,
        valor: v.valor ? parseFloat(v.valor) : null,
        moeda: v.moeda || "BRL",
        vencimento: new Date(v.vencimento),
        dataEmissaoDocumento: v.data_emissao_documento ? new Date(v.data_emissao_documento) : undefined,
        cobrancaEmNomeDe: v.cobranca_em_nome_de || "DACHSER",
        formaPagamento: v.forma_pagamento || "BOLETO",
        tipoDocumento: v.tipo_documento,
        filial: v.filial,
        remessa: v.remessa,
        urgente: v.urgente === 1 || v.urgencia_tipo !== "NORMAL",
        urgenciaTipo: v.urgencia_tipo || "NORMAL",
        comentariosOperacao: v.comentarios_operacao,
        comentariosFiscal: v.comentarios_fiscal,
        comentariosFinanceiro: v.comentarios_financeiro,
        ajusteOperacao: v.ajuste_operacao,
        ajusteFiscal: v.ajuste_fiscal,
        etapaAtual: v.etapa_atual || "OPERACAO",
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
        updatedAt: new Date(v.updated_at || v.created_at),
        anexos: [],
        logs: []
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
        eventos24h: recentVouchers.length
      });
    } catch (error: any) {
      toast({
        title: "Erro ao carregar vouchers",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
      setIsRefetching(false);
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
      return vouchers.filter(v => v.criadoPorUserId === currentUserId || v.responsavelOperacaoUserId === currentUserId);
    }
    if (isFiscal) {
      return vouchers.filter(v => v.etapaAtual === "FISCAL" || v.etapaAtual === "AJUSTE_FISCAL" || v.responsavelFiscalUserId === currentUserId);
    }
    if (isFinanceiro) {
      return vouchers.filter(v => v.etapaAtual === "FINANCEIRO" || v.etapaAtual === "ROBO" || v.responsavelFinanceiroUserId === currentUserId);
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
    const fornecedores = vouchers.map(v => v.fornecedor).filter((f): f is string => !!f);
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
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "delete_voucher_esteira",
          voucher_id: voucher.id
        }
      });
      if (error || !data?.success) throw new Error(data?.error || error?.message || "Erro ao excluir");
      toast({
        title: "Voucher excluído",
        description: `Voucher ${voucher.numeroSPO} foi excluído com sucesso`
      });
      loadVouchers();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir",
        description: error.message,
        variant: "destructive"
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
      const {
        error
      } = await (supabase as any).from("vouchers").update({
        etapa_atual: previousStage
      }).eq("id", voucher.id);
      if (error) throw error;
      toast({
        title: "Etapa atualizada",
        description: `Voucher retornou para etapa ${previousStage.replace("_", " ")}`
      });
      loadVouchers();
    } catch (error: any) {
      toast({
        title: "Erro ao voltar etapa",
        description: error.message,
        variant: "destructive"
      });
    }
  };
  return <div className="min-h-screen relative overflow-x-hidden">
      {/* Background with image and gradient overlay */}
      <div className="fixed inset-0 z-0">
        <div className="absolute inset-0" style={{
        backgroundImage: `url(${dachserBg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }} />
        <div className="absolute inset-0" style={{
        background: 'linear-gradient(120deg, rgba(4, 17, 45, 0.92), rgba(26, 93, 173, 0.55))'
      }} />
        
        {/* Radial gradient overlay */}
        <div className="absolute inset-0" style={{
        background: `
              radial-gradient(ellipse at 20% 20%, rgba(245, 184, 67, 0.12) 0%, transparent 50%),
              radial-gradient(ellipse at 80% 80%, rgba(245, 184, 67, 0.08) 0%, transparent 50%)
            `
      }} />
        
        {/* Animated Lines */}
        <div className="absolute inset-0 opacity-20">
          {[...Array(6)].map((_, i) => <div key={`line-${i}`} className="absolute h-full w-px bg-gradient-to-b from-primary/70 to-primary/10" style={{
          left: `${15 + i * 14}%`,
          transform: `skewX(${-20 + i * 8}deg)`
        }} />)}
        </div>

        {/* Floating Particles */}
        {[...Array(20)].map((_, i) => <div key={`particle-${i}`} className="absolute w-1 h-1 rounded-full bg-primary/40 animate-float" style={{
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
        animationDelay: `${Math.random() * 5}s`,
        animationDuration: `${4 + Math.random() * 4}s`
      }} />)}
      </div>

      {/* Top Header Bar */}
      <div className="relative z-10 max-w-[95%] mx-auto px-2 pt-5 pb-4 flex items-center justify-between">
        {/* Left - Back + Header */}
        <div className="flex items-center gap-[18px]">
          <button onClick={() => navigate("/dashboard")} className="w-8 h-8 rounded-full border border-white/12 bg-[rgba(5,6,18,0.9)] text-white/80 flex items-center justify-center backdrop-blur-sm hover:bg-[rgba(5,6,18,1)] hover:text-white transition-all">
            <ArrowLeft size={16} />
          </button>

          <header>
            <h1 className="text-[1.6rem] tracking-[0.24em] uppercase text-[#f5f5f5]">DACHSER</h1>
            <p className="text-[0.9rem] text-[#aaaaaa] mt-0.5">Intelligent Logistics — Esteira de Vouchers</p>
            <div className="flex gap-1.5 mt-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#ffc800] shadow-[0_0_10px_rgba(255,200,0,.9)]" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#ffc800] shadow-[0_0_10px_rgba(255,200,0,.9)]" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#ffc800] shadow-[0_0_10px_rgba(255,200,0,.9)]" />
            </div>
          </header>
        </div>

        {/* Right - Actions and user */}
        <div className="flex items-center gap-2.5 text-[0.85rem]">
          {/* Data Source Label */}
          
          
          <button onClick={() => loadVouchers()} disabled={isRefetching} className="flex items-center gap-2 px-4 py-2 rounded-full border border-[rgba(255,255,255,.25)] bg-[rgba(0,0,0,.7)] text-[#aaaaaa] hover:text-white hover:bg-[rgba(0,0,0,.9)] transition disabled:opacity-50 text-[0.8rem]">
            <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
            Atualizar
          </button>
          
          <Button className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20 rounded-full px-4" onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4" />
            Enviar Voucher
          </Button>

          {user && <div className="px-[14px] py-1.5 rounded-full bg-[rgba(0,0,0,.70)] border border-[rgba(255,255,255,.18)] text-[#aaaaaa] max-w-[180px] truncate">
              @{user.username || user.email}
            </div>}

          <div className="w-8 h-8 rounded-full border border-[rgba(255,255,255,.25)] flex items-center justify-center bg-[rgba(0,0,0,.7)] text-[#ffc800]" title="Esteira de Vouchers">
            <Receipt size={16} />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="relative z-10 max-w-[95%] mx-auto px-2 pb-8">
        <div className="space-y-6">
          {/* Metric Cards */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {loading ? <>
                <div className="h-28 rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] animate-pulse" />
                <div className="h-28 rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] animate-pulse" />
                <div className="h-28 rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] animate-pulse" />
                <div className="h-28 rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] animate-pulse" />
              </> : <>
                <MetricCard title="Em Andamento" value={metrics.ativos} icon={Package} subtitle="Vouchers ativos" onClick={() => setDrillDownFilter(drillDownFilter === "ativos" ? "all" : "ativos")} active={drillDownFilter === "ativos"} />
                <MetricCard title="SLA" value={metrics.slaAtencao} icon={AlertTriangle} variant={metrics.slaAtencao > 0 ? "critical" : "warning"} subtitle="Vencendo/Vencidos" onClick={() => setDrillDownFilter(drillDownFilter === "sla" ? "all" : "sla")} active={drillDownFilter === "sla"} />
                <MetricCard title="Pendências" value={metrics.pendenciasFinanceiras} icon={FileWarning} variant={metrics.pendenciasFinanceiras > 0 ? "warning" : "info"} subtitle="Accrual/Comprovante" onClick={() => setDrillDownFilter(drillDownFilter === "pendencias" ? "all" : "pendencias")} active={drillDownFilter === "pendencias"} />
                <MetricCard title="Atividade 24h" value={metrics.eventos24h} icon={Clock} variant="info" subtitle="Últimas 24 horas" onClick={() => setDrillDownFilter(drillDownFilter === "atividade" ? "all" : "atividade")} active={drillDownFilter === "atividade"} />
              </>}
          </div>

          {/* Active filter indicator */}
          {drillDownFilter !== "all" && <span className="px-3 py-1 rounded-full bg-[rgba(255,200,0,0.15)] text-[#ffc800] border border-[#ffc800]/40 text-[0.75rem] font-mono cursor-pointer hover:bg-[rgba(255,200,0,0.25)] transition inline-flex items-center gap-2" onClick={() => setDrillDownFilter("all")}>
              Filtro: {drillDownFilter === "ativos" ? "Em Andamento" : drillDownFilter === "sla" ? "SLA" : drillDownFilter === "pendencias" ? "Pendências" : "Atividade 24h"} ✕
            </span>}

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1 px-2 py-1.5 rounded-full bg-[rgba(5,6,18,0.85)] border border-white/10 backdrop-blur-sm w-fit">
            {[{
            id: "processos" as const,
            label: "Processos",
            icon: List
          }, {
            id: "dashboard" as const,
            label: "Dashboard",
            icon: LayoutDashboard
          }, {
            id: "analytics" as const,
            label: "Analytics",
            icon: BarChart3
          }, {
            id: "robo" as const,
            label: "Robô",
            icon: Bot
          }, {
            id: "relatorios" as const,
            label: "Relatórios",
            icon: FileSpreadsheet
          }].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={cn("flex items-center gap-2 px-4 py-2 rounded-full text-[0.8rem] font-medium transition-all duration-200", isActive ? 'bg-[rgba(255,200,0,0.15)] text-[#ffc800] border border-[#ffc800]/40 shadow-[0_0_12px_rgba(255,200,0,0.3)]' : 'text-[#aaaaaa] hover:text-white hover:bg-white/5')}>
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>;
          })}
          </nav>

          {/* Quick Filters */}
          {activeTab === "processos" && <div className="rounded-2xl p-4 bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] backdrop-blur-[18px]">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-[#aaaaaa]" />
                  <span className="text-[0.75rem] font-medium text-[#aaaaaa] uppercase tracking-wider">Filtros Rápidos:</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-[#888888]" />
                  <Select value={quickFilterFornecedor} onValueChange={setQuickFilterFornecedor}>
                    <SelectTrigger className="w-[180px] bg-[#0a0b10] border-white/10 rounded-full">
                      <SelectValue placeholder="Fornecedor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos Fornecedores</SelectItem>
                      {uniqueFornecedores.map(fornecedor => <SelectItem key={fornecedor} value={fornecedor}>
                          {fornecedor}
                        </SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-[#888888]" />
                  <Select value={quickFilterCobranca} onValueChange={setQuickFilterCobranca}>
                    <SelectTrigger className="w-[160px] bg-[#0a0b10] border-white/10 rounded-full">
                      <SelectValue placeholder="Cobrança" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas Cobranças</SelectItem>
                      <SelectItem value="DACHSER">DACHSER</SelectItem>
                      <SelectItem value="CLIENTE">CLIENTE</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {(quickFilterFornecedor !== "all" || quickFilterCobranca !== "all") && <button onClick={() => {
              setQuickFilterFornecedor("all");
              setQuickFilterCobranca("all");
            }} className="text-[#aaaaaa] hover:text-white text-[0.8rem]">
                    Limpar filtros
                  </button>}
              </div>
            </div>}

          {/* Tab Content */}
          {activeTab === "processos" && <div className="mt-3">
              {loading ? <div className="h-96 rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] animate-pulse" /> : <div className="rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] backdrop-blur-[18px] shadow-[0_18px_40px_rgba(0,0,0,0.85)] overflow-hidden">
                  <VoucherTable vouchers={filteredVouchers} onViewDetails={handleViewDetails} onEdit={handleEdit} onDelete={handleDelete} onGoBack={handleGoBack} filters={filters} onFilterChange={setFilters} />
                </div>}
            </div>}

          {activeTab === "dashboard" && <DashboardTab vouchers={vouchers} />}
          {activeTab === "analytics" && <AnalyticsDashboard vouchers={vouchers} />}
          {activeTab === "robo" && <RoboTab />}
          {activeTab === "relatorios" && <ReportsTab />}
        </div>
      </main>

      {/* Footer */}
      <div className="relative z-10 text-center text-[10px] text-[#888888] uppercase tracking-[0.16em] pb-6">
        Z3US.AI • For Logistics
      </div>

      <CreateVoucherDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} onSuccess={loadVouchers} />
      <EditVoucherDialog open={showEditDialog} onOpenChange={setShowEditDialog} onSuccess={loadVouchers} voucher={selectedVoucher} />
    </div>;
};
export default EsteiraIndex;