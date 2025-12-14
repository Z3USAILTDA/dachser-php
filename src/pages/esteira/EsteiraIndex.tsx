import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { PageLayout } from "@/components/layout/PageLayout";
import { Button } from "@/components/ui/button";
import { Plus, Package, AlertTriangle, AlertCircle, Clock, List, BarChart3, RefreshCw, TrendingUp, DollarSign, Calendar, Bot, HelpCircle, Settings, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Voucher, EtapaAtual } from "@/types/voucher";
import { cn } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, Legend } from "recharts";
import { VoucherTable, FilterValues } from "@/components/esteira/VoucherTable";
import { CreateVoucherDialog } from "@/components/esteira/CreateVoucherDialog";
import { EditVoucherDialog } from "@/components/esteira/EditVoucherDialog";
import { RoboTab } from "@/components/tabs/RoboTab";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface DashboardMetrics {
  totalMonitorados: number;
  emAlerta: number;
  criticos: number;
  eventos24h: number;
}

const MetricCard = ({ 
  title, 
  value, 
  subtitle,
  icon: Icon, 
  variant = "default",
  delay = 0
}: { 
  title: string; 
  value: number; 
  subtitle: string;
  icon: React.ElementType; 
  variant?: "default" | "warning" | "critical" | "info";
  delay?: number;
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
        "bg-card/60 backdrop-blur-sm border border-border/30 rounded-lg p-5 relative overflow-hidden",
        "hover:border-primary/30 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5",
        "animate-fade-in"
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
          <p className={cn("text-4xl font-bold", colorClasses[variant])}>{value}</p>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className={cn("p-3 rounded-full", iconBgClasses[variant])}>
          <Icon className={cn("h-5 w-5", colorClasses[variant])} />
        </div>
      </div>
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
            <div className="p-3 rounded-full bg-success/20">
              <TrendingUp className="h-5 w-5 text-success" />
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

const EsteiraIndex = () => {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"processos" | "analytics" | "robo">("processos");
  const [filters, setFilters] = useState<FilterValues>({
    search: "",
    etapa: "all",
    cobrancaEmNomeDe: "all",
    formaPagamento: "all",
    urgente: "all"
  });
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalMonitorados: 0,
    emAlerta: 0,
    criticos: 0,
    eventos24h: 0,
  });
  
  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showGoBackDialog, setShowGoBackDialog] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState<Voucher | null>(null);
  
  const { toast } = useToast();
  const navigate = useNavigate();

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
        criadoPorUserName: v.criado_por?.name,
        responsavelOperacaoUserId: v.responsavel_operacao_user_id,
        responsavelOperacaoUserName: v.responsavel_operacao?.name,
        responsavelFiscalUserId: v.responsavel_fiscal_user_id,
        responsavelFiscalUserName: v.responsavel_fiscal?.name,
        responsavelSupervisorUserId: v.responsavel_supervisor_user_id,
        responsavelSupervisorUserName: v.responsavel_supervisor?.name,
        responsavelFinanceiroUserId: v.responsavel_financeiro_user_id,
        responsavelFinanceiroUserName: v.responsavel_financeiro?.name,
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
          userName: l.user?.name,
          acao: l.acao,
          detalhe: l.detalhe
        }))
      }));
      setVouchers(mappedVouchers);
      
      // Calculate metrics
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);

      const activeVouchers = mappedVouchers.filter(v => v.etapaAtual !== "CONCLUIDO");
      const alertVouchers = mappedVouchers.filter(v => {
        const vencimento = v.vencimento;
        return vencimento >= now && vencimento <= tomorrow && v.etapaAtual !== "CONCLUIDO";
      });
      const criticalVouchers = mappedVouchers.filter(v => {
        return v.vencimento < now && v.etapaAtual !== "CONCLUIDO";
      });
      const recentVouchers = mappedVouchers.filter(v => {
        return v.updatedAt >= yesterday;
      });

      setMetrics({
        totalMonitorados: activeVouchers.length,
        emAlerta: alertVouchers.length,
        criticos: criticalVouchers.length,
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

  const filterVouchers = (vouchersList: Voucher[]) => {
    return vouchersList.filter(voucher => {
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
      return true;
    });
  };
  
  const filteredVouchers = filterVouchers(vouchers);

  const handleViewDetails = (voucher: Voucher) => {
    navigate(`/fin/esteira/voucher/${voucher.id}`);
  };

  const handleEdit = (voucher: Voucher) => {
    setSelectedVoucher(voucher);
    setShowEditDialog(true);
  };

  const handleDelete = (voucher: Voucher) => {
    setSelectedVoucher(voucher);
    setShowDeleteDialog(true);
  };

  const handleGoBack = (voucher: Voucher) => {
    setSelectedVoucher(voucher);
    setShowGoBackDialog(true);
  };

  const confirmDelete = async () => {
    if (!selectedVoucher) return;
    
    try {
      // Delete logs first
      await (supabase as any).from("voucher_logs").delete().eq("voucher_id", selectedVoucher.id);
      // Delete anexos
      await (supabase as any).from("voucher_anexos").delete().eq("voucher_id", selectedVoucher.id);
      // Delete voucher
      const { error } = await (supabase as any).from("vouchers").delete().eq("id", selectedVoucher.id);
      
      if (error) throw error;
      
      toast({
        title: "Voucher excluído",
        description: `Voucher ${selectedVoucher.numeroSPO} foi excluído com sucesso`,
      });
      
      loadVouchers();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setShowDeleteDialog(false);
      setSelectedVoucher(null);
    }
  };

  const confirmGoBack = async () => {
    if (!selectedVoucher) return;
    
    const etapaAnterior: Record<string, EtapaAtual> = {
      "FISCAL": "OPERACAO",
      "SUPERVISOR": "OPERACAO",
      "FINANCEIRO": "FISCAL",
      "ROBO": "FINANCEIRO",
      "AJUSTE_OPERACAO": "OPERACAO",
      "AJUSTE_FISCAL": "FISCAL",
    };
    
    const novaEtapa = etapaAnterior[selectedVoucher.etapaAtual];
    if (!novaEtapa) {
      toast({
        title: "Não é possível voltar",
        description: "Este voucher não pode voltar para etapa anterior",
        variant: "destructive",
      });
      return;
    }
    
    try {
      const { error } = await (supabase as any)
        .from("vouchers")
        .update({ etapa_atual: novaEtapa })
        .eq("id", selectedVoucher.id);
      
      if (error) throw error;
      
      // Log da ação
      const { data: userData } = await supabase.auth.getUser();
      await (supabase as any).from("voucher_logs").insert({
        voucher_id: selectedVoucher.id,
        acao: "ETAPA_REVERTIDA",
        detalhe: `Voucher voltou de ${selectedVoucher.etapaAtual} para ${novaEtapa}`,
        user_id: userData.user?.id,
      });
      
      toast({
        title: "Etapa revertida",
        description: `Voucher voltou para ${novaEtapa}`,
      });
      
      loadVouchers();
    } catch (error: any) {
      toast({
        title: "Erro ao reverter",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setShowGoBackDialog(false);
      setSelectedVoucher(null);
    }
  };

  return (
    <PageLayout>
      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Header with Navigation */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="text-2xl font-bold tracking-wide text-foreground">Esteira de Vouchers</div>
            <div className="flex gap-1.5 ml-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />
              <span className="w-1.5 h-1.5 rounded-full bg-primary/70" />
              <span className="w-1.5 h-1.5 rounded-full bg-primary/40" />
            </div>
          </div>
          
          {/* Navigation Buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/fin/esteira/rules")}
              className="gap-2 text-muted-foreground hover:text-foreground"
            >
              <Settings className="h-4 w-4" />
              Regras SLA
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/fin/esteira/user-management")}
              className="gap-2 text-muted-foreground hover:text-foreground"
            >
              <Users className="h-4 w-4" />
              Usuários
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/fin/esteira/manual")}
              className="gap-2 text-muted-foreground hover:text-foreground"
            >
              <HelpCircle className="h-4 w-4" />
              Ajuda
            </Button>
          </div>
        </div>

        {/* Metric Cards Row */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="TOTAL MONITORADOS"
            value={metrics.totalMonitorados}
            subtitle="Processos ativos"
            icon={Package}
            variant="default"
            delay={0}
          />
          <MetricCard
            title="EM ALERTA"
            value={metrics.emAlerta}
            subtitle="Atenção necessária"
            icon={AlertTriangle}
            variant="warning"
            delay={50}
          />
          <MetricCard
            title="CRÍTICOS"
            value={metrics.criticos}
            subtitle="Ação imediata"
            icon={AlertCircle}
            variant="critical"
            delay={100}
          />
          <MetricCard
            title="EVENTOS 24H"
            value={metrics.eventos24h}
            subtitle="Últimas 24 horas"
            icon={Clock}
            variant="info"
            delay={150}
          />
        </div>

        {/* Tabs and Actions Row */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
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
          </div>

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
              size="sm"
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
          <VoucherTable
            vouchers={filteredVouchers}
            onViewDetails={handleViewDetails}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onGoBack={handleGoBack}
            filters={filters}
            onFilterChange={setFilters}
          />
        ) : activeTab === "analytics" ? (
          <AnalyticsDashboard vouchers={vouchers} />
        ) : (
          <RoboTab />
        )}
      </main>

      {/* Create Dialog */}
      <CreateVoucherDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSuccess={loadVouchers}
      />

      {/* Edit Dialog */}
      {selectedVoucher && (
        <EditVoucherDialog
          voucher={selectedVoucher}
          open={showEditDialog}
          onOpenChange={setShowEditDialog}
          onSuccess={() => {
            loadVouchers();
            setSelectedVoucher(null);
          }}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Voucher</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o voucher {selectedVoucher?.numeroSPO}?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Go Back Confirmation */}
      <AlertDialog open={showGoBackDialog} onOpenChange={setShowGoBackDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reverter Etapa</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja voltar o voucher {selectedVoucher?.numeroSPO} para a etapa anterior?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmGoBack}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageLayout>
  );
};

export default EsteiraIndex;
