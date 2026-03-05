import { useState, useEffect, useMemo, useCallback } from "react";
import {
  ExternalLink,
  FileDown,
  Paperclip,
  Calendar, 
  Copy, 
  Check, 
  Building2, 
  CreditCard, 
  RefreshCw,
  Send,
  FileText,
  AlertCircle,
  Loader2,
  Banknote,
  Receipt,
  Filter,
  CheckSquare,
  Square,
  Clock,
  AlertTriangle,
  ChevronDown,
  MoreHorizontal,
  Eye
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { 
  TipoExecucaoPagamento, 
  StatusPagamento, 
  TIPO_EXECUCAO_LABELS, 
  STATUS_PAGAMENTO_LABELS,
  StatusIntegracaoRM,
  STATUS_INTEGRACAO_RM_LABELS,
  isBoleto,
  validarProntoParaRobo
} from "@/types/voucher";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { DadosPagamentoPanel } from "./DadosPagamentoPanel";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { parseDBDate, formatDateOnlyBR } from "@/utils/timezone";

interface PagamentoItem {
  id: string;
  numero_spo: string;
  fornecedor: string;
  cnpj_fornecedor: string;
  valor: number;
  moeda: string;
  vencimento: string;
  forma_pagamento: string;
  tipo_documento: string;
  cobranca_em_nome_de: string;
  filial: string;
  linha_digitavel?: string;
  codigo_barras?: string;
  status_pagamento?: StatusPagamento;
  tipo_execucao_pagamento?: TipoExecucaoPagamento;
  is_pronto_para_robo?: boolean;
  lote_remessa_id?: string;
  status_integracao_rm?: StatusIntegracaoRM;
  etapa_atual: string;
  status_baixa: string;
  created_at: string;
  updated_at: string;
  id_rm?: string; // id_rm from t_dados_financeiro_voucher
}

interface DadosBancarios {
  banco: string;
  agencia: string;
  digito_agencia?: string;
  conta_corrente: string;
  digito_conta?: string;
  razao_social: string;
  cnpj: string;
  chave_pix?: string;
  pix_tipo_chave?: string;
}

interface Stats {
  total: number;
  a_vencer_count: number;
  a_vencer_valor: number;
  vencidos_count: number;
  vencidos_valor: number;
  em_remessa_count: number;
  em_remessa_valor: number;
  manual_count: number;
  manual_valor: number;
  prontos_remessa_count: number;
  prontos_remessa_valor: number;
  prontos_manual_count: number;
  prontos_manual_valor: number;
  valor_total: number;
}

type FilterVencimento = "todos" | "hoje" | "vencidos" | "proximos7" | "a_vencer";

export const PagamentosTab = () => {
  const [pagamentos, setPagamentos] = useState<PagamentoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  
  // Filters
  const [filterVencimento, setFilterVencimento] = useState<FilterVencimento>("todos");
  const [filterStatusPagamento, setFilterStatusPagamento] = useState<string>("all");
  const [filterTipoExecucao, setFilterTipoExecucao] = useState<string>("all");
  const [filterFormaPagamento, setFilterFormaPagamento] = useState<string>("all");
  const [filterStatusIntegracaoRm, setFilterStatusIntegracaoRm] = useState<string>("all");
  const [activeCardFilter, setActiveCardFilter] = useState<string | null>(null);
  
  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  // Actions state
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [dadosBancariosCache, setDadosBancariosCache] = useState<Record<string, DadosBancarios>>({});
  const [loadingDados, setLoadingDados] = useState<Record<string, boolean>>({});
  const [processingAction, setProcessingAction] = useState<Record<string, boolean>>({});
  
  // Dialog state
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedPagamento, setSelectedPagamento] = useState<PagamentoItem | null>(null);
  const [anexosDialog, setAnexosDialog] = useState<any[]>([]);
  const [loadingAnexos, setLoadingAnexos] = useState(false);
  
  const { toast } = useToast();

  const loadPagamentos = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { 
          action: "list_pagamentos",
          page: 1,
          perPage: 100,
          filterVencimento: filterVencimento === "todos" ? undefined : filterVencimento,
          filterStatusPagamento: filterStatusPagamento === "all" ? undefined : filterStatusPagamento,
          filterTipoExecucao: filterTipoExecucao === "all" ? undefined : filterTipoExecucao,
          filterFormaPagamento: filterFormaPagamento === "all" ? undefined : filterFormaPagamento,
          filterStatusIntegracaoRm: filterStatusIntegracaoRm === "all" ? undefined : filterStatusIntegracaoRm
        }
      });

      if (error) throw error;

      // Deduplicate by id (backend JOIN may produce duplicates)
      const rawVouchers = data?.vouchers || [];
      const seen = new Set<string>();
      const uniqueVouchers = rawVouchers.filter((v: PagamentoItem) => {
        if (seen.has(v.id)) return false;
        seen.add(v.id);
        return true;
      });
      setPagamentos(uniqueVouchers);
      setStats(data?.stats || null);
    } catch (error: unknown) {
      console.error("Erro ao carregar pagamentos:", error);
      toast({
        title: "Erro ao carregar pagamentos",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadDadosBancarios = async (cnpj: string) => {
    if (dadosBancariosCache[cnpj] || loadingDados[cnpj]) return;

    setLoadingDados(prev => ({ ...prev, [cnpj]: true }));
    try {
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { 
          action: "get_dados_bancarios_fornecedor",
          cnpj: cnpj.replace(/\D/g, "")
        }
      });

      if (error) throw error;

      if (data?.data) {
        setDadosBancariosCache(prev => ({ ...prev, [cnpj]: data.data }));
      }
    } catch (error) {
      console.error("Erro ao carregar dados bancários:", error);
    } finally {
      setLoadingDados(prev => ({ ...prev, [cnpj]: false }));
    }
  };

  useEffect(() => {
    loadPagamentos();
  }, [filterVencimento, filterStatusPagamento, filterTipoExecucao, filterFormaPagamento, filterStatusIntegracaoRm]);

  useEffect(() => {
    pagamentos.forEach(pag => {
      if (pag.cnpj_fornecedor && !isBoleto(pag.forma_pagamento as any)) {
        loadDadosBancarios(pag.cnpj_fornecedor);
      }
    });
  }, [pagamentos]);

  const handleCopy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      toast({ title: "Copiado!", description: "Texto copiado para a área de transferência" });
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast({ title: "Erro ao copiar", variant: "destructive" });
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.size === pagamentos.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pagamentos.map(p => p.id)));
    }
  };

  const handleSelectOne = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleSetTipoExecucao = async (id: string, tipo: TipoExecucaoPagamento) => {
    setProcessingAction(prev => ({ ...prev, [id]: true }));
    try {
      const { error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { action: "set_tipo_execucao_pagamento", id, tipo_execucao_pagamento: tipo }
      });
      if (error) throw error;
      toast({ title: "Tipo de execução atualizado" });
      loadPagamentos();
    } catch (error: unknown) {
      toast({ 
        title: "Erro ao atualizar", 
        description: error instanceof Error ? error.message : "Erro desconhecido", 
        variant: "destructive" 
      });
    } finally {
      setProcessingAction(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleBatchSetTipoExecucao = async (tipo: TipoExecucaoPagamento) => {
    if (selectedIds.size === 0) {
      toast({ title: "Selecione ao menos um voucher", variant: "destructive" });
      return;
    }

    try {
      const { error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { 
          action: "batch_set_tipo_execucao", 
          voucher_ids: Array.from(selectedIds), 
          tipo_execucao_pagamento: tipo 
        }
      });
      if (error) throw error;
      toast({ title: `Tipo de execução atualizado para ${selectedIds.size} vouchers` });
      setSelectedIds(new Set());
      loadPagamentos();
    } catch (error: unknown) {
      toast({ 
        title: "Erro ao atualizar em lote", 
        description: error instanceof Error ? error.message : "Erro desconhecido", 
        variant: "destructive" 
      });
    }
  };

  const handleSetReady = async (id: string, isReady: boolean, tipoExecucao?: TipoExecucaoPagamento) => {
    // Validar tipo de execução antes de marcar como pronto
    if (isReady && !tipoExecucao) {
      toast({ 
        title: "Tipo de execução obrigatório", 
        description: "Defina o tipo de execução (Manual ou Remessa) antes de marcar como pronto",
        variant: "destructive" 
      });
      return;
    }

    setProcessingAction(prev => ({ ...prev, [id]: true }));
    try {
      // 1. Marcar como pronto
      const { error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { action: "set_ready_for_robo", id, is_pronto: isReady }
      });
      if (error) throw error;

      // 2. Para tipo REMESSA e marcando como pronto, inserir na t_dados_rm
      if (isReady && (tipoExecucao === "REMESSA_10H" || tipoExecucao === "REMESSA_15H")) {
        const pagamento = pagamentos.find(p => p.id === id);
        if (pagamento) {
          const dadosBancarios = dadosBancariosCache[pagamento.cnpj_fornecedor];
          
          // Determinar regra de forma de pagamento baseado no banco
          let regrasFormaPag = "DOC (Compe)";
          if (dadosBancarios) {
            const bancoUpper = (dadosBancarios.banco || "").toUpperCase();
            if (bancoUpper.includes("ITAU") || bancoUpper.includes("ITAÚ") || bancoUpper.includes("341")) {
              regrasFormaPag = "Crédito em Conta Corrente da Mesma Titularidade";
            }
          }

          const { error: rmError } = await supabase.functions.invoke("mariadb-proxy", {
            body: {
              action: "insert_dados_rm",
              id_rm: pagamento.id_rm || pagamento.numero_spo, // Usar id_rm de t_dados_financeiro_voucher se disponível
              voucher_boleto: isBoleto(pagamento.forma_pagamento as any) 
                ? (pagamento.linha_digitavel || pagamento.codigo_barras || null) 
                : null,
              chave_pix: dadosBancarios?.chave_pix || null,
              pix_tipo_chave: dadosBancarios?.pix_tipo_chave || null,
              forma_pag: pagamento.forma_pagamento,
              fornecedor: pagamento.fornecedor,
              cnpj_fornecedor: pagamento.cnpj_fornecedor,
              regras_forma_pag: regrasFormaPag
            }
          });

          if (rmError) {
            console.error("Erro ao inserir em t_dados_rm:", rmError);
            // Não falhar a operação principal, apenas logar o erro
          } else {
            // Atualizar status de integração RM
            await supabase.functions.invoke("mariadb-proxy", {
              body: {
                action: "update_status_integracao_rm",
                voucher_id: id,
                status_integracao_rm: "ENVIADO_T_DADOS_RM"
              }
            });
          }
        }
      }

      toast({ title: isReady ? "Marcado como pronto" : "Desmarcado" });
      loadPagamentos();
    } catch (error: unknown) {
      toast({ 
        title: "Erro ao atualizar", 
        description: error instanceof Error ? error.message : "Erro desconhecido", 
        variant: "destructive" 
      });
    } finally {
      setProcessingAction(prev => ({ ...prev, [id]: false }));
    }
  };

  const formatCurrency = (value: number, moeda = "BRL") => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda }).format(value);
  };

  const formatDate = (dateStr: string) => {
    return formatDateOnlyBR(dateStr);
  };

  const isVencido = (dateStr: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const vencimento = parseDBDate(dateStr);
    if (!vencimento) return false;
    vencimento.setHours(0, 0, 0, 0);
    return vencimento < today;
  };

  const isHoje = (dateStr: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const vencimento = parseDBDate(dateStr);
    if (!vencimento) return false;
    vencimento.setHours(0, 0, 0, 0);
    return vencimento.getTime() === today.getTime();
  };

  const getStatusPagamentoBadge = (status?: StatusPagamento) => {
    if (!status) return null;
    const variants: Record<StatusPagamento, string> = {
      PENDENTE_DADOS: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
      PRONTO: "bg-green-500/20 text-green-400 border-green-500/30",
      EM_REMESSA: "bg-blue-500/20 text-blue-400 border-blue-500/30",
      PAGO: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
      ERRO: "bg-red-500/20 text-red-400 border-red-500/30",
    };
    return (
      <Badge variant="outline" className={cn("text-[10px]", variants[status])}>
        {STATUS_PAGAMENTO_LABELS[status]}
      </Badge>
    );
  };

  const getStatusIntegracaoRmBadge = (status?: StatusIntegracaoRM) => {
    if (!status) return null;
    const variants: Record<StatusIntegracaoRM, string> = {
      PENDENTE: "bg-gray-500/20 text-gray-400 border-gray-500/30",
      ENVIADO_T_DADOS_RM: "bg-blue-500/20 text-blue-400 border-blue-500/30",
      PROCESSADO: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
      ERRO: "bg-red-500/20 text-red-400 border-red-500/30",
    };
    return (
      <Badge variant="outline" className={cn("text-[10px]", variants[status])}>
        {STATUS_INTEGRACAO_RM_LABELS[status]}
      </Badge>
    );
  };

  const today = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', 
    day: '2-digit', 
    month: 'long', 
    year: 'numeric' 
  });

  if (loading && pagamentos.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CreditCard className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-lg font-semibold text-foreground">Pagamentos</h2>
            <p className="text-sm text-muted-foreground capitalize">{today}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Quick filters */}
          <Select value={filterVencimento} onValueChange={(v) => setFilterVencimento(v as FilterVencimento)}>
            <SelectTrigger className="w-[140px] bg-card border-border rounded-full">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Vencimento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="hoje">Vencem Hoje</SelectItem>
              <SelectItem value="vencidos">Vencidos</SelectItem>
              <SelectItem value="proximos7">Próximos 7 dias</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterStatusPagamento} onValueChange={setFilterStatusPagamento}>
            <SelectTrigger className="w-[150px] bg-card border-border rounded-full">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Status</SelectItem>
              <SelectItem value="PENDENTE_DADOS">Aguardando Dados</SelectItem>
              <SelectItem value="PRONTO">Prontos</SelectItem>
              <SelectItem value="EM_REMESSA">Em Remessa</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterFormaPagamento} onValueChange={setFilterFormaPagamento}>
            <SelectTrigger className="w-[140px] bg-card border-border rounded-full">
              <SelectValue placeholder="Forma Pag." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="BOLETO">Boleto</SelectItem>
              <SelectItem value="PIX">PIX</SelectItem>
              <SelectItem value="TRANSFERENCIA_PIX">Transferência</SelectItem>
              <SelectItem value="DARF">DARF</SelectItem>
              <SelectItem value="GPS">GPS</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterTipoExecucao} onValueChange={setFilterTipoExecucao}>
            <SelectTrigger className="w-[150px] bg-card border-border rounded-full">
              <SelectValue placeholder="Tipo Exec." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Tipo Exec.</SelectItem>
              <SelectItem value="MANUAL">Manual</SelectItem>
              <SelectItem value="REMESSA_10H">Remessa 10h</SelectItem>
              <SelectItem value="REMESSA_15H">Remessa 15h</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterStatusIntegracaoRm} onValueChange={setFilterStatusIntegracaoRm}>
            <SelectTrigger className="w-[140px] bg-card border-border rounded-full">
              <SelectValue placeholder="Status RM" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos RM</SelectItem>
              <SelectItem value="PENDENTE">Pendente</SelectItem>
              <SelectItem value="ENVIADO_T_DADOS_RM">Enviado</SelectItem>
              <SelectItem value="PROCESSADO">Processado</SelectItem>
              <SelectItem value="ERRO">Erro</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setRefreshing(true);
              loadPagamentos();
            }}
            disabled={refreshing}
            className="rounded-full"
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", refreshing && "animate-spin")} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Stats Cards - Nova ordem: A Vencer, Vencidos, Em Remessa, Manual, Prontos Em Remessa, Prontos Manual */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div 
          className={cn(
            "p-3 rounded-xl bg-card border transition-colors cursor-pointer",
            activeCardFilter === "a_vencer" 
              ? "border-green-500 ring-2 ring-green-500/30" 
              : "border-border hover:border-green-500/50"
          )}
          onClick={() => {
            if (activeCardFilter === "a_vencer") {
              setActiveCardFilter(null);
              setFilterVencimento("todos");
            } else {
              setActiveCardFilter("a_vencer");
              setFilterVencimento("a_vencer");
              setFilterTipoExecucao("all");
            }
          }}
        >
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">A Vencer</div>
          <div className="text-xl font-bold mt-1 text-green-400">
            {stats?.a_vencer_count || 0} - {formatCurrency(stats?.a_vencer_valor || 0)}
          </div>
        </div>
        <div 
          className={cn(
            "p-3 rounded-xl bg-card border transition-colors cursor-pointer",
            activeCardFilter === "vencidos" 
              ? "border-red-500 ring-2 ring-red-500/30" 
              : "border-border hover:border-red-500/50"
          )}
          onClick={() => {
            if (activeCardFilter === "vencidos") {
              setActiveCardFilter(null);
              setFilterVencimento("todos");
            } else {
              setActiveCardFilter("vencidos");
              setFilterVencimento("vencidos");
              setFilterTipoExecucao("all");
            }
          }}
        >
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Vencidos</div>
          <div className="text-xl font-bold mt-1 text-red-400">
            {stats?.vencidos_count || 0} - {formatCurrency(stats?.vencidos_valor || 0)}
          </div>
        </div>
        <div 
          className={cn(
            "p-3 rounded-xl bg-card border transition-colors cursor-pointer",
            activeCardFilter === "em_remessa" 
              ? "border-blue-500 ring-2 ring-blue-500/30" 
              : "border-border hover:border-blue-500/50"
          )}
          onClick={() => {
            if (activeCardFilter === "em_remessa") {
              setActiveCardFilter(null);
              setFilterTipoExecucao("all");
            } else {
              setActiveCardFilter("em_remessa");
              setFilterTipoExecucao("REMESSA");
              setFilterVencimento("todos");
            }
          }}
        >
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Em Remessa</div>
          <div className="text-xl font-bold mt-1 text-blue-400">
            {stats?.em_remessa_count || 0} - {formatCurrency(stats?.em_remessa_valor || 0)}
          </div>
        </div>
        <div 
          className={cn(
            "p-3 rounded-xl bg-card border transition-colors cursor-pointer",
            activeCardFilter === "manual" 
              ? "border-purple-500 ring-2 ring-purple-500/30" 
              : "border-border hover:border-purple-500/50"
          )}
          onClick={() => {
            if (activeCardFilter === "manual") {
              setActiveCardFilter(null);
              setFilterTipoExecucao("all");
            } else {
              setActiveCardFilter("manual");
              setFilterTipoExecucao("MANUAL");
              setFilterVencimento("todos");
            }
          }}
        >
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Manual</div>
          <div className="text-xl font-bold mt-1 text-purple-400">
            {stats?.manual_count || 0} - {formatCurrency(stats?.manual_valor || 0)}
          </div>
        </div>
        <div 
          className={cn(
            "p-3 rounded-xl bg-card border transition-colors cursor-pointer",
            activeCardFilter === "prontos_remessa" 
              ? "border-emerald-500 ring-2 ring-emerald-500/30" 
              : "border-border hover:border-emerald-500/50"
          )}
          onClick={() => {
            if (activeCardFilter === "prontos_remessa") {
              setActiveCardFilter(null);
              setFilterStatusPagamento("all");
              setFilterTipoExecucao("all");
            } else {
              setActiveCardFilter("prontos_remessa");
              setFilterStatusPagamento("PRONTO");
              setFilterTipoExecucao("REMESSA");
              setFilterVencimento("todos");
            }
          }}
        >
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Prontos Remessa</div>
          <div className="text-xl font-bold mt-1 text-emerald-400">
            {stats?.prontos_remessa_count || 0} - {formatCurrency(stats?.prontos_remessa_valor || 0)}
          </div>
        </div>
        <div 
          className={cn(
            "p-3 rounded-xl bg-card border transition-colors cursor-pointer",
            activeCardFilter === "prontos_manual" 
              ? "border-cyan-500 ring-2 ring-cyan-500/30" 
              : "border-border hover:border-cyan-500/50"
          )}
          onClick={() => {
            if (activeCardFilter === "prontos_manual") {
              setActiveCardFilter(null);
              setFilterStatusPagamento("all");
              setFilterTipoExecucao("all");
            } else {
              setActiveCardFilter("prontos_manual");
              setFilterStatusPagamento("PRONTO");
              setFilterTipoExecucao("MANUAL");
              setFilterVencimento("todos");
            }
          }}
        >
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Prontos Manual</div>
          <div className="text-xl font-bold mt-1 text-cyan-400">
            {stats?.prontos_manual_count || 0} - {formatCurrency(stats?.prontos_manual_valor || 0)}
          </div>
        </div>
      </div>

      {/* Batch Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/10 border border-primary/30">
          <span className="text-sm font-medium">{selectedIds.size} selecionado(s)</span>
          <div className="flex-1" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">
                Definir Tipo Execução
                <ChevronDown className="h-4 w-4 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => handleBatchSetTipoExecucao("MANUAL")}>
                Manual
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleBatchSetTipoExecucao("REMESSA_10H")}>
                Remessa 10h
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleBatchSetTipoExecucao("REMESSA_15H")}>
                Remessa 15h
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button 
            size="sm" 
            variant="default"
            onClick={async () => {
              if (selectedIds.size === 0) return;
              const selected = pagamentos.filter(p => selectedIds.has(p.id));
              const semTipo = selected.filter(p => !p.tipo_execucao_pagamento);
              if (semTipo.length > 0) {
                toast({
                  title: "Tipo de execução obrigatório",
                  description: `${semTipo.length} voucher(s) sem tipo de execução definido. Defina antes de marcar como pronto.`,
                  variant: "destructive"
                });
                return;
              }
              let sucesso = 0;
              let falha = 0;
              for (const pag of selected) {
                if (pag.is_pronto_para_robo) { sucesso++; continue; }
                try {
                  await handleSetReady(pag.id, true, pag.tipo_execucao_pagamento);
                  sucesso++;
                } catch {
                  falha++;
                }
              }
              toast({ title: `Marcar Pronto em lote`, description: `${sucesso} marcado(s) com sucesso${falha > 0 ? `, ${falha} falha(s)` : ""}` });
              setSelectedIds(new Set());
              loadPagamentos();
            }}
          >
            <Check className="h-4 w-4 mr-2" />
            Marcar Pronto ({selectedIds.size})
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
            Limpar Seleção
          </Button>
        </div>
      )}

      {/* Table */}
      {pagamentos.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
          <Receipt className="h-12 w-12 mb-4 opacity-50" />
          <p>Nenhum pagamento encontrado</p>
        </div>
      ) : (
        <div className="rounded-xl bg-card border border-border overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="p-3 text-left">
                  <Checkbox
                    checked={selectedIds.size === pagamentos.length && pagamentos.length > 0}
                    onCheckedChange={handleSelectAll}
                  />
                </th>
                <th className="p-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">SPO</th>
                <th className="p-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Fornecedor</th>
                <th className="p-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Valor</th>
                <th className="p-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Vencimento</th>
                <th className="p-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Forma Pag.</th>
                <th className="p-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Tipo Exec.</th>
                <th className="p-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pagamentos.map((pag) => {
                const vencido = isVencido(pag.vencimento);
                const hoje = isHoje(pag.vencimento);
                
                return (
                  <tr 
                    key={pag.id} 
                    className={cn(
                      "hover:bg-muted/30 transition-colors",
                      selectedIds.has(pag.id) && "bg-primary/5"
                    )}
                  >
                    <td className="p-3">
                      <Checkbox
                        checked={selectedIds.has(pag.id)}
                        onCheckedChange={() => handleSelectOne(pag.id)}
                      />
                    </td>
                    <td className="p-3">
                      <span className="font-mono font-medium text-foreground">{pag.numero_spo}</span>
                      {/* Flag de erro de extração para boleto sem linha digitável */}
                      {isBoleto(pag.forma_pagamento as any) && !pag.linha_digitavel && (
                        <Badge variant="outline" className="ml-2 text-[9px] bg-red-500/20 text-red-400 border-red-500/30">
                          Erro Extração
                        </Badge>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="max-w-[200px] truncate text-sm" title={pag.fornecedor}>
                        {pag.fornecedor}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono">{pag.cnpj_fornecedor}</div>
                    </td>
                    <td className="p-3">
                      <span className="font-semibold">{formatCurrency(pag.valor || 0, pag.moeda)}</span>
                    </td>
                    <td className="p-3">
                      <div className={cn(
                        "flex items-center gap-1.5",
                        vencido && "text-red-400",
                        hoje && "text-yellow-400"
                      )}>
                        {vencido && <AlertTriangle className="h-3.5 w-3.5" />}
                        {hoje && <Clock className="h-3.5 w-3.5" />}
                        <span>{formatDate(pag.vencimento)}</span>
                      </div>
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className="text-[10px]">
                        {pag.forma_pagamento}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Select
                        value={pag.tipo_execucao_pagamento || ""}
                        onValueChange={(v) => handleSetTipoExecucao(pag.id, v as TipoExecucaoPagamento)}
                        disabled={processingAction[pag.id]}
                      >
                        <SelectTrigger className="h-8 w-[120px] text-xs">
                          <SelectValue placeholder="Definir..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MANUAL">Manual</SelectItem>
                          <SelectItem value="REMESSA_10H">Remessa 10h</SelectItem>
                          <SelectItem value="REMESSA_15H">Remessa 15h</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Visualizar detalhes"
                          onClick={async () => {
                            setSelectedPagamento(pag);
                            setDetailsDialogOpen(true);
                            setAnexosDialog([]);
                            setLoadingAnexos(true);
                            try {
                              const { data } = await supabase.functions.invoke("mariadb-proxy", {
                                body: { action: "get_voucher_anexos", voucher_id: pag.id }
                              });
                              setAnexosDialog(data?.data || []);
                            } catch (e) {
                              console.error("Erro ao carregar anexos:", e);
                            } finally {
                              setLoadingAnexos(false);
                            }
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant={pag.is_pronto_para_robo ? "default" : "outline"}
                          size="sm"
                          className="h-8 text-xs"
                          disabled={processingAction[pag.id]}
                          onClick={() => handleSetReady(pag.id, !pag.is_pronto_para_robo, pag.tipo_execucao_pagamento)}
                          title={pag.is_pronto_para_robo ? "Desmarcar pronto" : "Marcar como pronto para baixa"}
                        >
                          <Check className="h-4 w-4 mr-1" />
                          {pag.is_pronto_para_robo ? "Pronto" : "Marcar Pronto"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Details Dialog */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Dados de Pagamento - {selectedPagamento?.numero_spo}</DialogTitle>
          </DialogHeader>
          {selectedPagamento && (
            <div className="space-y-6">
              <DadosPagamentoPanel
                voucherId={selectedPagamento.id}
                formaPagamento={selectedPagamento.forma_pagamento}
                linhaDigitavel={selectedPagamento.linha_digitavel}
                codigoBarras={selectedPagamento.codigo_barras}
                cnpjFornecedor={selectedPagamento.cnpj_fornecedor}
                dadosBancarios={dadosBancariosCache[selectedPagamento.cnpj_fornecedor]}
                tipoExecucao={selectedPagamento.tipo_execucao_pagamento}
                anexos={anexosDialog.map((a: any) => ({
                  id: a.id?.toString() || "",
                  tipo: a.tipo || "",
                  fileUrl: a.file_url || "",
                  fileName: a.file_name || ""
                }))}
                onUpdate={loadPagamentos}
              />

              {/* Documentos Anexados */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Paperclip className="h-4 w-4 text-primary" />
                  <span>Documentos Anexados</span>
                  {!loadingAnexos && (
                    <Badge variant="secondary" className="text-[10px]">{anexosDialog.length}</Badge>
                  )}
                </div>

                <div className="rounded-lg bg-card border border-border p-4">
                  {loadingAnexos ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : anexosDialog.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-3">Nenhum documento anexado</p>
                  ) : (
                    <div className="space-y-2">
                      {anexosDialog.map((anexo: any, idx: number) => {
                        const tipoBadgeClass: Record<string, string> = {
                          FATURA: "bg-blue-500/20 text-blue-400 border-blue-500/30",
                          BOLETO: "bg-green-500/20 text-green-400 border-green-500/30",
                          COMPROVANTE: "bg-purple-500/20 text-purple-400 border-purple-500/30",
                          XML: "bg-orange-500/20 text-orange-400 border-orange-500/30",
                        };
                        return (
                          <div key={anexo.id || idx} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors">
                            <div className="flex items-center gap-3 min-w-0">
                              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                              <span className="text-sm text-foreground truncate">{anexo.file_name || "Sem nome"}</span>
                              <Badge variant="outline" className={cn("text-[9px] shrink-0", tipoBadgeClass[anexo.tipo] || "")}>
                                {anexo.tipo || "OUTRO"}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {anexo.file_url && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => window.open(anexo.file_url, "_blank")}
                                  title="Abrir em nova aba"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
