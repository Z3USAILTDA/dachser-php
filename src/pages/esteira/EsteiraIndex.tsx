import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useUsageLog } from "@/hooks/useUsageLog";
import { ArrowLeft, Plus, Package, AlertTriangle, AlertCircle, Clock, List, BarChart3, RefreshCw, TrendingUp, DollarSign, Calendar, Bot, FileSpreadsheet, Filter, Building2, Users, LayoutDashboard, CheckCircle2, FileWarning, HelpCircle, Receipt, ShieldX, Settings, Search, CreditCard, Layers } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Voucher, EtapaAtual, ETAPA_LABELS, SLA_POR_ETAPA, calcularTempoNaEtapa } from "@/types/voucher";
import { useUserRole } from "@/hooks/useUserRole";
import { useVoucherSync } from "@/hooks/useVoucherSync";
import { cn } from "@/lib/utils";
import { parseMariaDBDate } from "@/utils/parseMariaDBDate";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, Legend } from "recharts";
import { VoucherTable, FilterValues } from "@/components/esteira/VoucherTable";
import { CreateVoucherDialog } from "@/components/esteira/CreateVoucherDialog";
import { EditVoucherDialog } from "@/components/esteira/EditVoucherDialog";
import { CancelarVoucherDialog } from "@/components/esteira/CancelarVoucherDialog";
import { RoboTab } from "@/components/tabs/RoboTab";
import { ReportsTab } from "@/components/tabs/ReportsTab";
// Removed: FaturasDoDiaTab - apenas Pagamentos agora
import { PagamentosTab } from "@/components/esteira/PagamentosTab";
// BacklogTab removed - RM pending vouchers now shown in main grid as A_PROCESSAR
import { MetricCard } from "@/components/cct/MetricCard";
import { FinDbStatsPanel, FinDbStats } from "@/components/esteira/FinDbStatsPanel";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
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
              {entry.name}: <span className="font-semibold text-foreground">{entry.value.toLocaleString("pt-BR")}</span>
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
          <div className="text-xl font-bold mt-1">
            R${" "}
            {totalValor.toLocaleString("pt-BR", {
            minimumFractionDigits: 2
          })}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Soma de todos os vouchers/SPO</div>
        </div>
        <div className="p-3 rounded-xl bg-[#0a0b10] border border-white/10">
          <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Valor Médio</div>
          <div className="text-xl font-bold mt-1">
            R${" "}
            {mediaValor.toLocaleString("pt-BR", {
            minimumFractionDigits: 2
          })}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Média por voucher/SPO</div>
        </div>
        <div className="p-3 rounded-xl bg-[#0a0b10] border border-white/10">
          <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Taxa Conclusão</div>
          <div className="text-xl font-bold mt-1">{taxaConclusao}%</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Finalizados / Total</div>
        </div>
        <div className="p-3 rounded-xl bg-[#0a0b10] border border-white/10">
          <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Total Vouchers/SPO</div>
          <div className="text-xl font-bold mt-1">{vouchers.length}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Cadastrados no sistema</div>
        </div>
      </div>

      {/* Charts Row 1 */}
      <div className="grid gap-5 grid-cols-1 lg:grid-cols-2">
        <div className="rounded-xl bg-[#05060c] border border-white/10 p-4">
          <div className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground mb-1">Vouchers/SPO por Mês</div>
          <div className="text-[10px] text-muted-foreground mb-3">Volume mensal de vouchers/SPO criados e finalizados.</div>
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
          <div className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground mb-1">
            Distribuição por Etapa
          </div>
          <div className="text-[10px] text-muted-foreground mb-3">Vouchers/SPO em cada etapa do workflow.</div>
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
          <div className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground mb-1">
            Classificação Urgência
          </div>
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
          <p className="text-sm text-destructive">
            Acima do SLA: <span className="font-semibold">{data.acimaSLA}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Total: <span className="font-semibold">{data.total}</span>
          </p>
        </div>;
    }
    return null;
  };
  return <div className="space-y-6 animate-fade-in">
      {/* Vouchers/SPO por Etapa */}
      <div className="rounded-2xl p-5 bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] backdrop-blur-[18px] shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
        <div className="text-[0.75rem] uppercase tracking-wider text-[#aaaaaa] mb-4 flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          Vouchers/SPO por Etapa
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard title="Pendentes - Voucher/SPO" value={dashboardMetrics.pendentesOperacao} icon={Clock} subtitle="Etapa OPERACAO" />
          <MetricCard title="Pendentes - Fiscal" value={dashboardMetrics.pendentesFiscal} icon={Clock} subtitle="Etapa FISCAL" />
          <MetricCard title="Pendentes - Supervisor" value={dashboardMetrics.pendentesSupervisor} icon={AlertCircle} variant="warning" subtitle="Etapa SUPERVISOR" />
          <MetricCard title="Pendentes - Financeiro" value={dashboardMetrics.pendentesFinanceiro} icon={Clock} subtitle="Etapa FINANCEIRO" />
        </div>
      </div>

      {/* Gargalos */}
      <div className="rounded-2xl p-5 bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] backdrop-blur-[18px] shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
        <div className="text-[0.75rem] uppercase tracking-wider text-[#aaaaaa] mb-4 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-yellow-400" />
          Gargalos - Vouchers/SPO Acima do SLA
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
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded bg-emerald-500" />
                <span className="text-[#888888]">&lt; 25%</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded bg-yellow-400" />
                <span className="text-[#888888]">25-50%</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded bg-rose-500" />
                <span className="text-[#888888]">&gt; 50%</span>
              </div>
            </div>
          </div> : <div className="rounded-xl bg-[#05060c] border border-white/10 p-6 text-center text-[#888888]">
            <CheckCircle2 className="h-6 w-6 mx-auto mb-2 text-emerald-400" />
            <span className="text-sm">Nenhum voucher/SPO acima do SLA</span>
          </div>}
      </div>

      {/* Urgências e Vencimentos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-2xl p-5 bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] backdrop-blur-[18px] shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
          <div className="text-[0.75rem] uppercase tracking-wider text-[#aaaaaa] mb-4 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-400" />
            Vouchers/SPO Urgentes
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
                  <p className="text-sm font-medium text-rose-400">Vouchers/SPO Vencidos</p>
                  <p className="text-xs text-[#888888]">
                    {dashboardMetrics.vencidos} voucher(s)/SPO(s) já passaram do vencimento
                  </p>
                </div>
                <span className="bg-rose-500 text-white px-2.5 py-1 rounded-full text-xs font-medium">
                  {dashboardMetrics.vencidos}
                </span>
              </div>}
            {dashboardMetrics.vencendo24h > 0 && <div className="flex items-center justify-between p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-yellow-400">Atenção: Vencimento Próximo</p>
                  <p className="text-xs text-[#888888]">
                    {dashboardMetrics.vencendo24h} voucher(s)/SPO(s) vencem nas próximas 24 horas
                  </p>
                </div>
                <span className="bg-yellow-500 text-black px-2.5 py-1 rounded-full text-xs font-medium">
                  {dashboardMetrics.vencendo24h}
                </span>
              </div>}
          </div>
        </div>}
    </div>;
};
const EsteiraIndex = () => {
  useUsageLog({
    endpoint: "/fin/esteira"
  });
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const [activeTab, setActiveTab] = useState<"processos" | "dashboard" | "analytics" | "robo" | "relatorios" | "pagamentos">("processos");
  const [filters, setFilters] = useState<FilterValues>({
    search: "",
    etapa: "all",
    cobrancaEmNomeDe: "all",
    formaPagamento: "all",
    urgente: "all",
    statusBaixa: "all",
    statusComprovante: "all",
    vencimentoInicio: "",
    vencimentoFim: "",
    origemCriacao: "all",
    // Novos filtros inline
    processo: "",
    fornecedor: "",
    faixaValor: "all",
    slaStatus: "all",
    // Novos filtros avançados
    tipoDocumento: "all",
    filial: "all",
    moeda: "all",
    criadoEmInicio: "",
    criadoEmFim: "",
    isMaster: "all"
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
  const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null);
  const [finDbStats, setFinDbStats] = useState<FinDbStats | null>(null);
  const [isLoadingDbStats, setIsLoadingDbStats] = useState(false);

  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState<Voucher | null>(null);
  const [showUsersDialog, setShowUsersDialog] = useState(false);
  const [esteiraUsers, setEsteiraUsers] = useState<Array<{
    id: number;
    username: string;
    email: string;
    esteira_role: string | null;
  }>>([]);
  const [userFilterRole, setUserFilterRole] = useState<string>("all");
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const {
    toast
  } = useToast();
  const navigate = useNavigate();
  const {
    role,
    loading: roleLoading,
    isOperacao,
    isFiscal,
    isSupervisor,
    isFinanceiro,
    isAdmin,
    isGestor,
    hasEsteiraAccess,
    canCreateVoucher,
    canEditVoucher,
    canDeleteVoucher,
    canGoBackStage,
    canManageUsers,
    canCancelVoucher,
    canDisassembleMaster
  } = useUserRole();
  const storedUser = localStorage.getItem("user") || localStorage.getItem("dachser_user");
  const user = storedUser ? JSON.parse(storedUser) : null;
  // Handle is_admin as number, string, or boolean
  const isSystemAdmin = user?.is_admin === 1 || user?.is_admin === "1" || user?.is_admin === true;

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

  // Sync vouchers from RM on page load
  const syncFromRM = async () => {
    try {
      console.log("Syncing vouchers from RM...");
      const { data, error } = await supabase.functions.invoke("voucher-integrate-rm", {
        body: {
          action: "import",
          limit: 10000 // High limit to get all vouchers
        }
      });
      if (error) {
        console.error("Error syncing from RM:", error);
      } else {
        console.log("RM sync complete:", data);
      }
    } catch (err) {
      console.error("Failed to sync from RM:", err);
    }
  };

  const loadVouchers = async () => {
    try {
      setLoading(true);
      setIsRefetching(true);

      // First sync from RM to ensure latest data, then load vouchers
      await syncFromRM();

      // Load from MariaDB t_vouchers AND pending RM vouchers in parallel
      const [esteiraResult, rmPendingResult] = await Promise.all([supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "get_vouchers_esteira",
          limit: 500
        }
      }), supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "get_vouchers_pendentes_rm",
          limit: 200
        }
      })]);
      if (esteiraResult.error) throw esteiraResult.error;

      // Map vouchers from esteira
      const mappedVouchers: Voucher[] = (esteiraResult.data?.data || []).map((v: any) => ({
        id: v.id,
        numeroSPO: v.numero_spo,
        fornecedor: v.fornecedor,
        cnpjFornecedor: v.cnpj_fornecedor,
        valor: v.valor ? parseFloat(v.valor) : null,
        moeda: v.moeda || "BRL",
        vencimento: parseMariaDBDate(v.vencimento) || new Date(),
        dataEmissaoDocumento: parseMariaDBDate(v.data_emissao_documento) || undefined,
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
        criadoPorUserName: v.criado_por_user_name,
        responsavelOperacaoUserId: v.responsavel_operacao_user_id,
        responsavelFiscalUserId: v.responsavel_fiscal_user_id,
        responsavelSupervisorUserId: v.responsavel_supervisor_user_id,
        responsavelFinanceiroUserId: v.responsavel_financeiro_user_id,
        aprovadoPorUserId: v.aprovado_por_user_id,
        clienteEmail: v.cliente_email,
        isMaster: v.is_master === 1 || v.is_master === true,
        origemCriacao: v.is_master ? "MASTER" : v.id_rm ? "RM" : "MANUAL",
        processoId: v.processo_id || null,
        origemProcesso: v.origem_processo || null,
        chavePix: v.chave_pix || null,
        createdAt: parseMariaDBDate(v.created_at) || new Date(),
        updatedAt: parseMariaDBDate(v.updated_at || v.created_at) || new Date(),
        anexos: [],
        logs: []
      }));

      // Map pending RM vouchers to Voucher format with etapaAtual = A_PROCESSAR
      const rmPendingVouchers: Voucher[] = (rmPendingResult.data?.data || []).map((rm: any) => {
        // Map forma_pag to FormaPagamento
        const mapFormaPag = (fp: string | null): string => {
          const mapping: Record<string, string> = {
            'BOL': 'BOLETO',
            'BOLETO': 'BOLETO',
            'PIX': 'PIX',
            'TED': 'TRANSFERENCIA',
            'TRANSF': 'TRANSFERENCIA',
            'DEBITO': 'DEBITO',
            'CAMBIO': 'CAMBIO',
            'DARF': 'DARF',
            'GPS': 'GPS'
          };
          return mapping[(fp || '').toUpperCase()] || 'BOLETO';
        };

        // Map tipo_pag to TipoDocumento
        const mapTipoDoc = (tp: string | null): string => {
          const mapping: Record<string, string> = {
            'NF': 'NOTA_FISCAL',
            'FAT': 'FATURA',
            'FATURA': 'FATURA',
            'DEM': 'DEMONSTRATIVO',
            'NFS': 'NF_SERVICO'
          };
          return mapping[(tp || '').toUpperCase()] || 'FATURA';
        };
        return {
          id: `rm_pending_${rm.nd}`,
          // Temporary ID for RM pending vouchers
          numeroSPO: rm.nd,
          fornecedor: rm.nome_beneficiario || rm.razao_social || '',
          cnpjFornecedor: rm.cnpj,
          valor: rm.valor_nf ? parseFloat(rm.valor_nf) : null,
          moeda: rm.moeda || "BRL",
          vencimento: parseMariaDBDate(rm.data_vencimento) || new Date(),
          dataEmissaoDocumento: parseMariaDBDate(rm.data_emissao) || undefined,
          cobrancaEmNomeDe: rm.nome_cobranca === "CLIENTE" ? "CLIENTE" : "DACHSER",
          formaPagamento: mapFormaPag(rm.forma_pag) as any,
          tipoDocumento: mapTipoDoc(rm.tipo_pag) as any,
          filial: undefined,
          remessa: "NENHUM" as any,
          urgente: false,
          urgenciaTipo: "NORMAL" as any,
          etapaAtual: "A_PROCESSAR" as any,
          statusBaixa: "PENDENTE" as any,
          statusFinanceiro: "PENDENTE" as any,
          origemCriacao: "RM" as any,
          processoId: rm.numero_processo || null,
          createdAt: new Date(),
          updatedAt: new Date(),
          anexos: [],
          logs: [],
          // Internal tracking
          idRm: rm.id_rm,
          fonteDados: "RM_PENDENTE"
        } as Voucher;
      });

      // Merge both arrays: RM pending vouchers first (A_PROCESSAR), then esteira vouchers
      // Filter out master vouchers that shouldn't be in A_PROCESSAR (data inconsistency)
      const allVouchers = [...rmPendingVouchers, ...mappedVouchers].filter(v => {
        if ((v.isMaster || v.origemCriacao === "MASTER") && v.etapaAtual === "A_PROCESSAR") {
          console.warn(`Voucher Master ${v.numeroSPO} ignorado - inconsistência: etapa A_PROCESSAR`);
          return false;
        }
        return true;
      });
      setVouchers(allVouchers);

      // Calculate metrics (consolidated)
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);

      // Ativos = todos não concluídos (including A_PROCESSAR)
      const ativos = allVouchers.filter(v => v.etapaAtual !== "CONCLUIDO" && v.etapaAtual !== "A_PROCESSAR");

      // SLA Atenção = vencendo em 24h + já vencidos
      const slaAtencao = allVouchers.filter(v => {
        if (v.etapaAtual === "CONCLUIDO") return false;
        const vencimento = v.vencimento;
        return vencimento <= tomorrow;
      });

      // Pendências Financeiras = sem accrual + aguardando comprovante + exceções
      const pendenciasFinanceiras = allVouchers.filter(v => {
        if (v.etapaAtual === "CONCLUIDO" || v.etapaAtual === "A_PROCESSAR") return false;
        const aguardandoComprovante = v.etapaAtual === "FINANCEIRO" || v.etapaAtual === "ROBO";
        const emExcecao = v.urgenciaTipo === "URGENTE_REAL";
        return aguardandoComprovante || emExcecao;
      });

      // Eventos 24h
      const recentVouchers = allVouchers.filter(v => v.updatedAt >= yesterday);
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
      setLastUpdateTime(new Date());
    }
  };
  const loadEsteiraUsers = async () => {
    try {
      const {
        data,
        error
      } = await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "get_all_users_esteira"
        }
      });
      if (!error && data?.users) {
        // Filter only users with esteira_role assigned
        const usersWithRole = data.users.filter((u: any) => u.esteira_role);
        setEsteiraUsers(usersWithRole);
      }
    } catch (err) {
      console.error("Error loading esteira users:", err);
    }
  };

  // Calculate DB stats from vouchers
  const fetchFinDbStats = async () => {
    setIsLoadingDbStats(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-fin-voucher-stats");
      
      if (error) {
        console.error("Error fetching fin db stats:", error);
        return;
      }

      if (data?.success && data?.stats) {
        setFinDbStats(data.stats);
      }
    } catch (err) {
      console.error("Error fetching fin db stats:", err);
    } finally {
      setIsLoadingDbStats(false);
    }
  };

  useEffect(() => {
    if (hasEsteiraAccess) {
      loadVouchers();
    }
  }, [hasEsteiraAccess]);

  // Fetch DB stats on mount
  useEffect(() => {
    if (hasEsteiraAccess) {
      fetchFinDbStats();
    }
  }, [hasEsteiraAccess]);

  // Reload vouchers when tab becomes visible after being hidden (tab switch only)
  // Removed window focus listener as it was triggering too frequently (e.g., when closing dialogs)
  useEffect(() => {
    let lastHiddenTime: number | null = null;
    const MIN_HIDDEN_TIME = 5000; // Only reload if tab was hidden for more than 5 seconds

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        lastHiddenTime = Date.now();
      } else if (document.visibilityState === 'visible' && hasEsteiraAccess && !loading) {
        // Only reload if tab was hidden for at least 5 seconds
        if (lastHiddenTime && Date.now() - lastHiddenTime > MIN_HIDDEN_TIME) {
          loadVouchers();
        }
        lastHiddenTime = null;
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [hasEsteiraAccess, loading]);

  // Apply role-based filtering first
  const roleFilteredVouchers = useMemo(() => {
    if (isAdmin || isGestor) {
      return vouchers;
    }

    // Users with FINANCEIRO role (even with other roles) can see ALL vouchers
    // FINANCEIRO stage vouchers come first
    if (isFinanceiro) {
      return [...vouchers].sort((a, b) => {
        const aIsFinanceiro = a.etapaAtual === "FINANCEIRO" || a.etapaAtual === "ROBO";
        const bIsFinanceiro = b.etapaAtual === "FINANCEIRO" || b.etapaAtual === "ROBO";
        // If user also has SUPERVISOR role, prioritize SUPERVISOR stage too
        const aIsSupervisor = isSupervisor && a.etapaAtual === "SUPERVISOR";
        const bIsSupervisor = isSupervisor && b.etapaAtual === "SUPERVISOR";
        const aPriority = aIsFinanceiro || aIsSupervisor;
        const bPriority = bIsFinanceiro || bIsSupervisor;
        if (aPriority && !bPriority) return -1;
        if (!aPriority && bPriority) return 1;
        return 0;
      });
    }

    // Users with only SUPERVISOR role
    if (isSupervisor) {
      return vouchers.filter(v => v.etapaAtual === "SUPERVISOR" || v.responsavelSupervisorUserId === currentUserId);
    }
    if (isOperacao) {
      // OPERACAO users can see vouchers they created, are responsible for, AND pending A_PROCESSAR vouchers
      return vouchers.filter(v => 
        v.criadoPorUserId === currentUserId || 
        v.responsavelOperacaoUserId === currentUserId ||
        v.etapaAtual === "A_PROCESSAR" // Allow seeing backlog to import
      );
    }
    if (isFiscal) {
      return vouchers.filter(v => v.etapaAtual === "FISCAL" || v.etapaAtual === "AJUSTE_FISCAL" || v.responsavelFiscalUserId === currentUserId);
    }
    return vouchers;
  }, [vouchers, role, currentUserId, isAdmin, isGestor, isOperacao, isFiscal, isSupervisor, isFinanceiro]);
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
            if (voucher.etapaAtual === "CONCLUIDO" || voucher.etapaAtual === "A_PROCESSAR") return false;
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

      // Filtro de busca por SPO
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        if (!voucher.numeroSPO.toLowerCase().includes(searchLower)) return false;
      }

      // Filtro de processo
      if (filters.processo) {
        const searchLower = filters.processo.toLowerCase();
        if (!voucher.processoId?.toLowerCase().includes(searchLower)) return false;
      }

      // Filtro de fornecedor
      if (filters.fornecedor) {
        const searchLower = filters.fornecedor.toLowerCase();
        if (!voucher.fornecedor?.toLowerCase().includes(searchLower)) return false;
      }

      // Filtro de etapa
      if (filters.etapa !== "all" && voucher.etapaAtual !== filters.etapa) {
        return false;
      }

      // Filtro de cobrança
      if (filters.cobrancaEmNomeDe !== "all" && voucher.cobrancaEmNomeDe !== filters.cobrancaEmNomeDe) {
        return false;
      }

      // Filtro de forma de pagamento
      if (filters.formaPagamento !== "all" && voucher.formaPagamento !== filters.formaPagamento) {
        return false;
      }

      // Filtro de urgência
      if (filters.urgente !== "all" && voucher.urgenciaTipo !== filters.urgente) {
        return false;
      }

      // Filtro de faixa de valor
      if (filters.faixaValor && filters.faixaValor !== "all") {
        const valor = voucher.valor || 0;
        if (filters.faixaValor === "low" && valor >= 1000) return false;
        if (filters.faixaValor === "medium" && (valor < 1000 || valor >= 10000)) return false;
        if (filters.faixaValor === "high" && valor < 10000) return false;
      }

      // Filtro de SLA
      if (filters.slaStatus && filters.slaStatus !== "all") {
        const tempoHoras = calcularTempoNaEtapa(voucher);
        const sla = SLA_POR_ETAPA[voucher.etapaAtual as keyof typeof SLA_POR_ETAPA] || 24;
        let status: "ok" | "warning" | "critical" = "ok";
        if (sla > 0) {
          if (tempoHoras >= sla) status = "critical";else if (tempoHoras >= sla * 0.75) status = "warning";
        }
        if (filters.slaStatus !== status) return false;
      }

      // Filtro de vencimento - data inicial
      if (filters.vencimentoInicio) {
        const inicio = new Date(filters.vencimentoInicio);
        if (voucher.vencimento < inicio) return false;
      }

      // Filtro de vencimento - data final
      if (filters.vencimentoFim) {
        const fim = new Date(filters.vencimentoFim);
        fim.setHours(23, 59, 59, 999);
        if (voucher.vencimento > fim) return false;
      }

      // Filtro de origem
      if (filters.origemCriacao && filters.origemCriacao !== "all" && voucher.origemCriacao !== filters.origemCriacao) {
        return false;
      }

      // Filtro de status comprovante
      if (filters.statusComprovante && filters.statusComprovante !== "all") {
        const status = voucher.statusComprovante || "PENDENTE";
        if (status !== filters.statusComprovante) return false;
      }

      // Filtro de tipo de documento
      if (filters.tipoDocumento && filters.tipoDocumento !== "all" && voucher.tipoDocumento !== filters.tipoDocumento) {
        return false;
      }

      // Filtro de filial
      if (filters.filial && filters.filial !== "all" && voucher.filial !== filters.filial) {
        return false;
      }

      // Filtro de moeda
      if (filters.moeda && filters.moeda !== "all" && voucher.moeda !== filters.moeda) {
        return false;
      }

      // Filtro de data de criação - início
      if (filters.criadoEmInicio) {
        const inicio = new Date(filters.criadoEmInicio);
        if (voucher.createdAt < inicio) return false;
      }

      // Filtro de data de criação - fim
      if (filters.criadoEmFim) {
        const fim = new Date(filters.criadoEmFim);
        fim.setHours(23, 59, 59, 999);
        if (voucher.createdAt > fim) return false;
      }

      // Filtro de voucher master
      if (filters.isMaster && filters.isMaster !== "all") {
        const isMaster = voucher.isMaster || voucher.origemCriacao === "MASTER";
        if (filters.isMaster === "true" && !isMaster) return false;
        if (filters.isMaster === "false" && isMaster) return false;
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

  // Block access for users without role - MUST be after all hooks
  if (roleLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#050608]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>;
  }
  if (!hasEsteiraAccess) {
    return <div className="min-h-screen flex items-center justify-center bg-[#050608] relative overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0">
          <img src={dachserBg} alt="" className="w-full h-full object-cover opacity-[0.14]" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#050608]/90 via-[#050608]/70 to-[#050608]" />
        </div>

        <div className="relative z-10 text-center max-w-md mx-auto px-6">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-destructive/10 border border-destructive/30 flex items-center justify-center">
            <ShieldX className="h-10 w-10 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-3">Acesso Não Autorizado</h1>
          <p className="text-muted-foreground mb-6">
            Você não possui permissão para acessar a Esteira de Vouchers. Entre em contato com um administrador para
            solicitar acesso.
          </p>
          <Button onClick={() => navigate("/dashboard")} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Voltar a tela inicial
          </Button>
        </div>
      </div>;
  }
  const handleViewDetails = async (voucher: Voucher) => {
    // If voucher is from RM pending (A_PROCESSAR), import it first
    if (voucher.etapaAtual === "A_PROCESSAR" && voucher.fonteDados === "RM_PENDENTE") {
      try {
        const {
          data,
          error
        } = await supabase.functions.invoke("mariadb-proxy", {
          body: {
            action: "import_voucher_from_rm",
            nd: voucher.numeroSPO,
            user_id: user?.id,
            user_name: user?.username || user?.email
          }
        });
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || "Erro ao importar voucher");

        // Navigate to the newly created voucher
        if (data?.voucherId) {
          navigate(`/fin/esteira/voucher/${data.voucherId}`);
        } else {
          loadVouchers();
        }
        return;
      } catch (error: any) {
        toast({
          title: "Erro ao importar voucher",
          description: error.message,
          variant: "destructive"
        });
        return;
      }
    }
    navigate(`/fin/esteira/voucher/${voucher.id}`);
  };
  const handleEdit = async (voucher: Voucher) => {
    // If voucher is from RM pending (A_PROCESSAR), import it first
    if (voucher.etapaAtual === "A_PROCESSAR" && voucher.fonteDados === "RM_PENDENTE") {
      try {
        const {
          data,
          error
        } = await supabase.functions.invoke("mariadb-proxy", {
          body: {
            action: "import_voucher_from_rm",
            nd: voucher.numeroSPO,
            user_id: user?.id,
            user_name: user?.username || user?.email
          }
        });
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || "Erro ao importar voucher");

        // Update local voucher with new ID and open edit dialog
        if (data?.voucherId) {
          const updatedVoucher = {
            ...voucher,
            id: data.voucherId,
            etapaAtual: "OPERACAO" as const,
            fonteDados: undefined
          };
          setSelectedVoucher(updatedVoucher);
          setShowEditDialog(true);
          loadVouchers();
        }
        return;
      } catch (error: any) {
        toast({
          title: "Erro ao importar voucher",
          description: error.message,
          variant: "destructive"
        });
        return;
      }
    }
    setSelectedVoucher(voucher);
    setShowEditDialog(true);
  };
  const handleDelete = async (voucher: Voucher) => {
    try {
      const {
        data,
        error
      } = await supabase.functions.invoke("mariadb-proxy", {
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
  const handleGoBack = async (voucher: Voucher, justificativa: string) => {
    try {
      let previousStage: EtapaAtual;
      let ajusteField: string | null = null;
      switch (voucher.etapaAtual) {
        case "FISCAL":
          previousStage = "OPERACAO";
          ajusteField = "ajuste_operacao";
          break;
        case "SUPERVISOR":
          previousStage = "FISCAL";
          ajusteField = "ajuste_fiscal";
          break;
        case "FINANCEIRO":
          previousStage = voucher.cobrancaEmNomeDe === "CLIENTE" ? "OPERACAO" : "FISCAL";
          ajusteField = voucher.cobrancaEmNomeDe === "CLIENTE" ? "ajuste_operacao" : "ajuste_fiscal";
          break;
        case "ROBO":
          previousStage = "FINANCEIRO";
          ajusteField = null; // Não precisa de ajuste
          break;
        case "AJUSTE_OPERACAO":
          previousStage = "FISCAL";
          ajusteField = null;
          break;
        case "AJUSTE_FISCAL":
          previousStage = "FINANCEIRO";
          ajusteField = null;
          break;
        default:
          throw new Error("Não é possível voltar desta etapa");
      }

      // Build update payload with justification in the appropriate field
      const updatePayload: Record<string, any> = {
        action: "update_voucher_esteira",
        voucher_id: voucher.id,
        etapa_atual: previousStage
      };
      if (ajusteField) {
        updatePayload[ajusteField] = justificativa;
      }

      // Use MariaDB proxy instead of Supabase directly
      const {
        data,
        error
      } = await supabase.functions.invoke("mariadb-proxy", {
        body: updatePayload
      });
      if (error || !data?.success) throw new Error(data?.error || error?.message || "Erro ao atualizar");

      // Log the action with justification
      const storedUser = localStorage.getItem("user") || localStorage.getItem("dachser_user");
      const userData = storedUser ? JSON.parse(storedUser) : {
        id: 0,
        username: "sistema"
      };
      await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "save_voucher_log",
          voucher_id: voucher.id,
          user_id: userData.id?.toString(),
          user_name: userData.username,
          acao: "ETAPA_RETORNADA",
          detalhe: `Voucher/SPO retornou para etapa ${previousStage.replace("_", " ")}. Justificativa: ${justificativa}`
        }
      });
      toast({
        title: "Etapa atualizada",
        description: `Voucher/SPO retornou para etapa ${previousStage.replace("_", " ")}`
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
  const handleCancel = (voucher: Voucher) => {
    setSelectedVoucher(voucher);
    setShowCancelDialog(true);
  };
  const handleDisassemble = async (voucher: Voucher) => {
    try {
      const {
        data,
        error
      } = await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "disassemble_master_voucher",
          master_id: voucher.id
        }
      });
      if (error || !data?.success) throw new Error(data?.error || error?.message || "Erro ao desmembrar");

      // Log the action
      const storedUser = localStorage.getItem("user") || localStorage.getItem("dachser_user");
      const userData = storedUser ? JSON.parse(storedUser) : {
        id: 0,
        username: "sistema"
      };
      await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "save_voucher_log",
          voucher_id: voucher.id,
          user_id: userData.id?.toString(),
          user_name: userData.username,
          acao: "MASTER_DESMEMBRADO",
          detalhe: `Voucher/SPO master ${voucher.numeroSPO} foi desmembrado. ${data.childrenRestored || 0} vouchers/SPO filhos restaurados.`
        }
      });
      toast({
        title: "Voucher/SPO desmembrado",
        description: `${data.childrenRestored || 0} vouchers/SPO filhos foram restaurados como individuais`
      });
      loadVouchers();
    } catch (error: any) {
      toast({
        title: "Erro ao desmembrar",
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
        backgroundSize: "cover",
        backgroundPosition: "center"
      }} />
        <div className="absolute inset-0" style={{
        background: "linear-gradient(120deg, rgba(4, 17, 45, 0.92), rgba(26, 93, 173, 0.55))"
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
            <p className="text-[0.9rem] text-[#aaaaaa] mt-0.5">Intelligent Logistics — Esteira de Vouchers/SPO</p>
            <div className="flex gap-1.5 mt-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#ffc800] shadow-[0_0_10px_rgba(255,200,0,.9)]" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#ffc800] shadow-[0_0_10px_rgba(255,200,0,.9)]" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#ffc800] shadow-[0_0_10px_rgba(255,200,0,.9)]" />
            </div>
          </header>
        </div>

        {/* Right - Actions and user */}
        <div className="flex items-center gap-2.5 text-[0.85rem]">
          <FinDbStatsPanel stats={finDbStats} isLoading={isLoadingDbStats} onRefresh={fetchFinDbStats} />

          <button onClick={() => loadVouchers()} disabled={isRefetching} className="flex items-center gap-2 px-4 py-2 rounded-full border border-[rgba(255,255,255,.25)] bg-[rgba(0,0,0,.7)] text-[#aaaaaa] hover:text-white hover:bg-[rgba(0,0,0,.9)] transition disabled:opacity-50 text-[0.8rem]">
            <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
            Atualizar
          </button>

          {canCreateVoucher && <Button className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20 rounded-full px-4" onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4" />
              Enviar Voucher/SPO
            </Button>}

          {user && <div className="px-[14px] py-1.5 rounded-full bg-[rgba(0,0,0,.70)] border border-[rgba(255,255,255,.18)] text-[#aaaaaa] max-w-[180px] truncate">
              @{user.username || user.email}
            </div>}

          {/* Settings Button - Only for admins */}
          {canManageUsers && <button onClick={() => {
          loadEsteiraUsers();
          setShowUsersDialog(true);
        }} className="w-9 h-9 rounded-full border border-[rgba(255,255,255,.25)] bg-[rgba(0,0,0,.7)] text-[#aaaaaa] hover:text-white hover:bg-[rgba(0,0,0,.9)] transition flex items-center justify-center" title="Configurações">
              <Settings className="h-4 w-4" />
            </button>}

          {/* Help Button */}
          <button onClick={() => navigate("/fin/esteira/manual")} className="w-8 h-8 rounded-full border border-[rgba(255,255,255,.25)] flex items-center justify-center bg-[rgba(0,0,0,.7)] text-[#aaaaaa] hover:text-[#ffc800] hover:bg-[rgba(0,0,0,.9)] transition" title="Ajuda">
            <HelpCircle size={16} />
          </button>

          <div className="w-8 h-8 rounded-full border border-[rgba(255,255,255,.25)] flex items-center justify-center bg-[rgba(0,0,0,.7)] text-[#ffc800]" title="Esteira de Vouchers/SPO">
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
                <MetricCard title="Em Andamento" value={metrics.ativos} icon={Package} subtitle="Vouchers/SPO ativos" onClick={() => setDrillDownFilter(drillDownFilter === "ativos" ? "all" : "ativos")} active={drillDownFilter === "ativos"} />
                <MetricCard title="SLA" value={metrics.slaAtencao} icon={AlertTriangle} variant={metrics.slaAtencao > 0 ? "critical" : "warning"} subtitle="Vencendo/Vencidos" onClick={() => setDrillDownFilter(drillDownFilter === "sla" ? "all" : "sla")} active={drillDownFilter === "sla"} />
                <MetricCard title="Pendências" value={metrics.pendenciasFinanceiras} icon={FileWarning} variant={metrics.pendenciasFinanceiras > 0 ? "warning" : "info"} subtitle="Accrual/Comprovante" onClick={() => setDrillDownFilter(drillDownFilter === "pendencias" ? "all" : "pendencias")} active={drillDownFilter === "pendencias"} />
                <MetricCard title="Atividade 24h" value={metrics.eventos24h} icon={Clock} variant="info" subtitle="Últimas 24 horas" onClick={() => setDrillDownFilter(drillDownFilter === "atividade" ? "all" : "atividade")} active={drillDownFilter === "atividade"} />
              </>}
          </div>

          {/* Active filter indicator */}
          {drillDownFilter !== "all" && <span className="px-3 py-1 rounded-full bg-[rgba(255,200,0,0.15)] text-[#ffc800] border border-[#ffc800]/40 text-[0.75rem] font-mono cursor-pointer hover:bg-[rgba(255,200,0,0.25)] transition inline-flex items-center gap-2" onClick={() => setDrillDownFilter("all")}>
              Filtro:{" "}
              {drillDownFilter === "ativos" ? "Em Andamento" : drillDownFilter === "sla" ? "SLA" : drillDownFilter === "pendencias" ? "Pendências" : "Atividade 24h"}{" "}
              ✕
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
          }, {
            id: "pagamentos" as const,
            label: "Pagamentos",
            icon: CreditCard
          }].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={cn("flex items-center gap-2 px-4 py-2 rounded-full text-[0.8rem] font-medium transition-all duration-200", isActive ? "bg-[rgba(255,200,0,0.15)] text-[#ffc800] border border-[#ffc800]/40 shadow-[0_0_12px_rgba(255,200,0,0.3)]" : "text-[#aaaaaa] hover:text-white hover:bg-white/5")}>
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>;
          })}
          </nav>

          {/* Quick Filters + Advanced Filters */}
          {activeTab === "processos" && <div className="space-y-3">
              {/* Quick Filters Row */}
              <div className="rounded-2xl p-4 bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] backdrop-blur-[18px]">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-[#aaaaaa]" />
                    <span className="text-[0.75rem] font-medium text-[#aaaaaa] uppercase tracking-wider">
                      Filtros Rápidos:
                    </span>
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

                  {/* Forma de Pagamento */}
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-[#888888]" />
                    <Select value={filters.formaPagamento} onValueChange={v => setFilters({
                  ...filters,
                  formaPagamento: v
                })}>
                      <SelectTrigger className="w-[150px] bg-[#0a0b10] border-white/10 rounded-full">
                        <SelectValue placeholder="Pagamento" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas Formas</SelectItem>
                        <SelectItem value="BOLETO">Boleto</SelectItem>
                        <SelectItem value="PIX">Pix</SelectItem>
                        <SelectItem value="TRANSFERENCIA">Transferência</SelectItem>
                        <SelectItem value="DEBITO">Débito</SelectItem>
                        <SelectItem value="CAMBIO">Câmbio</SelectItem>
                        <SelectItem value="DARF">DARF</SelectItem>
                        <SelectItem value="GPS">GPS</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Origem */}
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-[#888888]" />
                    <Select value={filters.origemCriacao} onValueChange={v => setFilters({
                  ...filters,
                  origemCriacao: v
                })}>
                      <SelectTrigger className="w-[120px] bg-[#0a0b10] border-white/10 rounded-full">
                        <SelectValue placeholder="Origem" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        <SelectItem value="MANUAL">Manual</SelectItem>
                        <SelectItem value="RM">Via RM</SelectItem>
                        <SelectItem value="MASTER">Master</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Vencimento Até */}
                  

                  {/* Master Filter */}
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-[#888888]" />
                    <Select value={filters.isMaster} onValueChange={v => setFilters({
                      ...filters,
                      isMaster: v
                    })}>
                      <SelectTrigger className="w-[150px] bg-[#0a0b10] border-white/10 rounded-full">
                        <SelectValue placeholder="Voucher/SPO Master" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="true">Apenas Master</SelectItem>
                        <SelectItem value="false">Sem Master</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Clear All Filters */}
                  {(quickFilterFornecedor !== "all" || quickFilterCobranca !== "all" || filters.formaPagamento !== "all" || filters.origemCriacao !== "all" || filters.vencimentoFim !== "" || filters.isMaster !== "all" || filters.search !== "" || filters.etapa !== "all" || filters.processo !== "" || filters.fornecedor !== "" || filters.faixaValor !== "all" || filters.slaStatus !== "all" || filters.vencimentoInicio !== "" || filters.urgente !== "all" || filters.statusComprovante !== "all") && <button onClick={() => {
                setQuickFilterFornecedor("all");
                setQuickFilterCobranca("all");
                setFilters({
                  search: "",
                  etapa: "all",
                  cobrancaEmNomeDe: "all",
                  formaPagamento: "all",
                  urgente: "all",
                  statusBaixa: "all",
                  statusComprovante: "all",
                  vencimentoInicio: "",
                  vencimentoFim: "",
                  origemCriacao: "all",
                  processo: "",
                  fornecedor: "",
                  faixaValor: "all",
                  slaStatus: "all",
                  tipoDocumento: "all",
                  filial: "all",
                  moeda: "all",
                  criadoEmInicio: "",
                  criadoEmFim: "",
                  isMaster: "all"
                });
              }} className="text-[#ffc800] hover:text-white text-[0.8rem] flex items-center gap-1">
                      ✕ Limpar Todos
                    </button>}
                </div>
              </div>
            </div>}

          {/* Tab Content */}
          {activeTab === "processos" && <div className="mt-3">
              {loading ? <div className="h-96 rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] animate-pulse" /> : <div className="rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] backdrop-blur-[18px] shadow-[0_18px_40px_rgba(0,0,0,0.85)] overflow-hidden">
                    <VoucherTable vouchers={filteredVouchers} onViewDetails={handleViewDetails} onEdit={handleEdit} onDelete={handleDelete} onGoBack={handleGoBack} onCancel={handleCancel} onDisassemble={handleDisassemble} filters={filters} onFilterChange={setFilters} canEdit={canEditVoucher} canDelete={canDeleteVoucher} canGoBackStage={canGoBackStage} canCancelVoucher={canCancelVoucher} canDisassembleMaster={canDisassembleMaster} lastUpdateTime={lastUpdateTime} />
                </div>}
            </div>}

          {activeTab === "dashboard" && <DashboardTab vouchers={vouchers} />}
          {activeTab === "analytics" && <AnalyticsDashboard vouchers={vouchers} />}
          {activeTab === "robo" && <RoboTab />}
          {activeTab === "relatorios" && <ReportsTab />}
          {activeTab === "pagamentos" && <div className="rounded-2xl p-5 bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] backdrop-blur-[18px] shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
              <PagamentosTab />
            </div>}
        </div>
      </main>

      {/* Footer */}
      <div className="relative z-10 text-center text-[10px] text-[#888888] uppercase tracking-[0.16em] pb-6">
        Z3US.AI • For Logistics
      </div>

      <CreateVoucherDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} onSuccess={loadVouchers} />
      <EditVoucherDialog open={showEditDialog} onOpenChange={setShowEditDialog} onSuccess={loadVouchers} voucher={selectedVoucher} />
      {selectedVoucher && <CancelarVoucherDialog open={showCancelDialog} onOpenChange={setShowCancelDialog} voucher={selectedVoucher} onSuccess={loadVouchers} />}

      {/* Read-only Users Dialog */}
      <Dialog open={showUsersDialog} onOpenChange={open => {
      setShowUsersDialog(open);
      if (!open) {
        setUserFilterRole("all");
        setUserSearchQuery("");
      }
    }}>
        <DialogContent className="max-w-2xl bg-[rgba(5,6,18,0.98)] border-white/10 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Usuários da Esteira
            </DialogTitle>
          </DialogHeader>

          {/* Filters */}
          <div className="flex items-center gap-3 pb-2 border-b border-white/10">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por nome ou email..." value={userSearchQuery} onChange={e => setUserSearchQuery(e.target.value)} className="pl-9 bg-[#0a0b10] border-white/10 rounded-full" />
            </div>
            <Select value={userFilterRole} onValueChange={setUserFilterRole}>
              <SelectTrigger className="w-[160px] bg-[#0a0b10] border-white/10 rounded-full">
                <SelectValue placeholder="Função" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Funções</SelectItem>
                <SelectItem value="ADMIN">Administrador</SelectItem>
                <SelectItem value="OPERACAO">Operação</SelectItem>
                <SelectItem value="FISCAL">Fiscal</SelectItem>
                <SelectItem value="SUPERVISOR">Supervisor</SelectItem>
                <SelectItem value="FINANCEIRO">Financeiro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="max-h-[50vh] overflow-auto">
            {(() => {
            const filteredUsers = esteiraUsers.filter(u => {
              const matchesSearch = userSearchQuery === "" || u.username?.toLowerCase().includes(userSearchQuery.toLowerCase()) || u.email?.toLowerCase().includes(userSearchQuery.toLowerCase());
              const matchesRole = userFilterRole === "all" || u.esteira_role === userFilterRole;
              return matchesSearch && matchesRole;
            });
            if (filteredUsers.length === 0) {
              return <div className="text-center py-8 text-muted-foreground">
                    {esteiraUsers.length === 0 ? "Nenhum usuário com função na Esteira" : "Nenhum usuário encontrado com os filtros aplicados"}
                  </div>;
            }
            return <Table>
                  <TableHeader>
                    <TableRow className="border-white/10 hover:bg-transparent">
                      <TableHead className="text-muted-foreground">Usuário</TableHead>
                      <TableHead className="text-muted-foreground">Email</TableHead>
                      <TableHead className="text-muted-foreground">Função</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map(u => <TableRow key={u.id} className="border-white/5">
                        <TableCell className="font-medium text-foreground">@{u.username}</TableCell>
                        <TableCell className="text-muted-foreground">{u.email || "-"}</TableCell>
                        <TableCell>
                          <Badge className={cn("border", u.esteira_role === "ADMIN" && "bg-red-500/20 text-red-400 border-red-500/30", u.esteira_role === "OPERACAO" && "bg-blue-500/20 text-blue-400 border-blue-500/30", u.esteira_role === "FISCAL" && "bg-purple-500/20 text-purple-400 border-purple-500/30", u.esteira_role === "SUPERVISOR" && "bg-amber-500/20 text-amber-400 border-amber-500/30", u.esteira_role === "FINANCEIRO" && "bg-green-500/20 text-green-400 border-green-500/30")}>
                            {u.esteira_role === "ADMIN" ? "Administrador" : u.esteira_role === "OPERACAO" ? "Operação" : u.esteira_role === "FISCAL" ? "Fiscal" : u.esteira_role === "SUPERVISOR" ? "Supervisor" : u.esteira_role === "FINANCEIRO" ? "Financeiro" : u.esteira_role}
                          </Badge>
                        </TableCell>
                      </TableRow>)}
                  </TableBody>
                </Table>;
          })()}
          </div>

          <div className="pt-2 border-t border-white/10 text-xs text-muted-foreground">
            {esteiraUsers.length} usuário(s) com função na Esteira
          </div>
        </DialogContent>
      </Dialog>
    </div>;
};
export default EsteiraIndex;