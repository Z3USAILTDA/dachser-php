import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { FilePreview } from "./FilePreview";
import {
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
  Eye,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Undo2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
import { ExtraAnexoUpload } from "./ExtraAnexoUpload";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { parseDBDate, formatDateOnlyBR } from "@/utils/timezone";
import { buildAjusteWithRequester } from "@/utils/voucherAjusteRouting";
import { sendVoucherReturnNotification } from "@/utils/voucherReturnNotification";
import { TablePagination } from "@/components/layout/TablePagination";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format as fnsFormat } from "date-fns";

import { CalendarIcon } from "lucide-react";
import { MoedaBadge } from "./MoedaBadge";

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
  id_rm?: string;
  is_master?: boolean;
  nome_master?: string;
  voucher_master_id?: string;
  urgencia_tipo?: string;
  has_boleto_anexo?: number;
  comentarios_operacao?: string | null;
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
  const [filterFornecedor, setFilterFornecedor] = useState<string>("");
  const [filterFornecedorDebounced, setFilterFornecedorDebounced] = useState<string>("");
  const [filterDataInicio, setFilterDataInicio] = useState<Date | undefined>(undefined);
  const [filterDataFim, setFilterDataFim] = useState<Date | undefined>(undefined);
  const [activeCardFilter, setActiveCardFilter] = useState<string | null>(null);
  
  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Sorting
  type PagSortField = "numero_spo" | "fornecedor" | "valor" | "vencimento" | "forma_pagamento" | "tipo_execucao_pagamento";
  const [sortField, setSortField] = useState<PagSortField | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const handleSort = (field: PagSortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const getSortIcon = (field: PagSortField) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-50" />;
    return sortDirection === "asc" 
      ? <ArrowUp className="h-3 w-3 ml-1" /> 
      : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  const dateFilteredPagamentos = useMemo(() => {
    if (!filterDataInicio && !filterDataFim) return pagamentos;
    const ini = filterDataInicio ? new Date(filterDataInicio) : null;
    const fim = filterDataFim ? new Date(filterDataFim) : null;
    if (ini) ini.setHours(0, 0, 0, 0);
    if (fim) fim.setHours(23, 59, 59, 999);
    return pagamentos.filter(p => {
      const d = parseDBDate(p.vencimento);
      if (!d) return false;
      if (ini && d < ini) return false;
      if (fim && d > fim) return false;
      return true;
    });
  }, [pagamentos, filterDataInicio, filterDataFim]);

  const sortedPagamentos = useMemo(() => {
    if (!sortField) return dateFilteredPagamentos;
    return [...dateFilteredPagamentos].sort((a, b) => {
      let valA: any, valB: any;
      switch (sortField) {
        case "numero_spo": valA = a.numero_spo || ""; valB = b.numero_spo || ""; break;
        case "fornecedor": valA = a.fornecedor || ""; valB = b.fornecedor || ""; break;
        case "valor": valA = a.valor || 0; valB = b.valor || 0; break;
        case "vencimento": valA = a.vencimento || ""; valB = b.vencimento || ""; break;
        case "forma_pagamento": valA = a.forma_pagamento || ""; valB = b.forma_pagamento || ""; break;
        case "tipo_execucao_pagamento": valA = a.tipo_execucao_pagamento || ""; valB = b.tipo_execucao_pagamento || ""; break;
        default: return 0;
      }
      const cmp = typeof valA === "number" ? valA - valB : String(valA).localeCompare(String(valB), "pt-BR");
      return sortDirection === "asc" ? cmp : -cmp;
    });
  }, [dateFilteredPagamentos, sortField, sortDirection]);

  // Pagination
  const ITEMS_PER_PAGE = 20;
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(sortedPagamentos.length / ITEMS_PER_PAGE));
  const pageStartIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedPagamentos = useMemo(
    () => sortedPagamentos.slice(pageStartIndex, pageStartIndex + ITEMS_PER_PAGE),
    [sortedPagamentos, pageStartIndex]
  );
  useEffect(() => {
    setCurrentPage(1);
  }, [
    filterVencimento,
    filterStatusPagamento,
    filterTipoExecucao,
    filterFormaPagamento,
    filterStatusIntegracaoRm,
    filterFornecedorDebounced,
    filterDataInicio,
    filterDataFim,
    activeCardFilter,
    sortField,
    sortDirection,
  ]);
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [totalPages, currentPage]);

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
  // Token para descartar respostas de anexos fora de ordem (race entre cliques no olho)
  const anexosReqIdRef = useRef(0);
  
  // Voltar dialog state
  const [voltarOperacionalDialogOpen, setVoltarOperacionalDialogOpen] = useState(false);
  const [voltarOperacionalVoucher, setVoltarOperacionalVoucher] = useState<PagamentoItem | null>(null);
  const [voltarOperacionalJustificativa, setVoltarOperacionalJustificativa] = useState("");
  const [voltarOperacionalLoading, setVoltarOperacionalLoading] = useState(false);
  const [voltarDestinoEtapa, setVoltarDestinoEtapa] = useState<"OPERACAO" | "FISCAL">("OPERACAO");
  const [voltarBatchVouchers, setVoltarBatchVouchers] = useState<PagamentoItem[]>([]);

  // Master children state
  const masterChildrenCache = useRef<Map<string, string[]>>(new Map());
  const [masterChildrenMap, setMasterChildrenMap] = useState<Map<string, string[]>>(new Map());

  // Load children SPOs for master vouchers
  useEffect(() => {
    const loadMasterChildren = async () => {
      const masters = pagamentos.filter(p => p.is_master && !masterChildrenCache.current.has(p.id));
      if (masters.length === 0) return;
      
      // Batch fetch all master children in a single call
      const masterIds = masters.map(m => m.id);
      try {
        const { data } = await supabase.functions.invoke("mariadb-proxy", {
          body: { action: "get_voucher_filhos_batch", master_ids: masterIds },
        });
        if (data?.data) {
          for (const [masterId, children] of Object.entries(data.data)) {
            const spos = (children as any[]).map((f: any) => f.numero_spo);
            masterChildrenCache.current.set(masterId, spos);
          }
          // Also set empty arrays for masters with no children
          for (const m of masters) {
            if (!masterChildrenCache.current.has(m.id)) {
              masterChildrenCache.current.set(m.id, []);
            }
          }
          setMasterChildrenMap(new Map(masterChildrenCache.current));
        }
      } catch (err) {
        console.error("Erro ao carregar filhos dos masters (batch):", err);
      }
    };
    loadMasterChildren();
  }, [pagamentos]);

  const { toast } = useToast();

  const loadReqIdRef = useRef(0);
  const loadPagamentos = async (opts?: { silent?: boolean }) => {
    const reqId = ++loadReqIdRef.current;
    const silent = opts?.silent === true;
    try {
      if (!silent) setLoading(true);
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { 
          action: "list_pagamentos",
          page: 1,
          perPage: 100,
          filterVencimento: filterVencimento === "todos" ? undefined : filterVencimento,
          filterStatusPagamento: filterStatusPagamento === "all" ? undefined : filterStatusPagamento,
          filterTipoExecucao: filterTipoExecucao === "all" ? undefined : filterTipoExecucao,
          filterFormaPagamento: filterFormaPagamento === "all" ? undefined : filterFormaPagamento,
          filterStatusIntegracaoRm: filterStatusIntegracaoRm === "all" ? undefined : filterStatusIntegracaoRm,
          filterBusca: filterFornecedorDebounced.trim() || undefined,
          filterFornecedor: filterFornecedorDebounced.trim() || undefined
        }
      });

      if (reqId !== loadReqIdRef.current) return;

      if (error) throw error;

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
      if (reqId !== loadReqIdRef.current) return;
      console.error("Erro ao carregar pagamentos:", error);
      toast({
        title: "Erro ao carregar pagamentos",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive"
      });
    } finally {
      // Sempre liberar o botão Atualizar, mesmo se a request foi descartada
      setRefreshing(false);
      if (reqId === loadReqIdRef.current) {
        setLoading(false);
      }
    }
  };

  const loadDadosBancarios = async (cnpj: string, retries = 2): Promise<void> => {
    if (dadosBancariosCache[cnpj]) return;

    setLoadingDados(prev => ({ ...prev, [cnpj]: true }));
    try {
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { 
          action: "get_dados_bancarios_fornecedor",
          cnpj: cnpj.replace(/\D/g, "")
        }
      });

      if (error) {
        if (retries > 0) {
          await new Promise(r => setTimeout(r, 1500));
          setLoadingDados(prev => ({ ...prev, [cnpj]: false }));
          return loadDadosBancarios(cnpj, retries - 1);
        }
        throw error;
      }

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
    const t = setTimeout(() => loadPagamentos(), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterVencimento, filterStatusPagamento, filterTipoExecucao, filterFormaPagamento, filterStatusIntegracaoRm, filterFornecedorDebounced]);

  // Debounce do filtro de fornecedor (texto livre)
  useEffect(() => {
    const t = setTimeout(() => setFilterFornecedorDebounced(filterFornecedor), 400);
    return () => clearTimeout(t);
  }, [filterFornecedor]);

  useEffect(() => {
    // Serialize bank data requests to avoid exhausting MariaDB connections
    const loadAllBankData = async () => {
      const uniqueCnpjs = [...new Set(
        pagamentos
          .filter(pag => pag.cnpj_fornecedor && !isBoleto(pag.forma_pagamento as any))
          .map(pag => pag.cnpj_fornecedor!)
      )];
      
      for (const cnpj of uniqueCnpjs) {
        if (!dadosBancariosCache[cnpj]) {
          await loadDadosBancarios(cnpj);
        }
      }
    };
    
    if (pagamentos.length > 0) {
      loadAllBankData();
    }
  }, [pagamentos]);

  const handleCopy = async (text: string, id: string) => {
    try {
      const { copyToClipboard } = await import("@/utils/clipboard");
      const ok = await copyToClipboard(text);
      if (ok) {
        setCopiedId(id);
        toast({ title: "Copiado!", description: "Texto copiado para a área de transferência" });
        setTimeout(() => setCopiedId(null), 2000);
      } else {
        toast({ title: "Erro ao copiar", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro ao copiar", variant: "destructive" });
    }
  };

  const handleSelectAll = () => {
    const pageIds = paginatedPagamentos.map(p => p.id);
    const allSelected = pageIds.length > 0 && pageIds.every(id => selectedIds.has(id));
    const next = new Set(selectedIds);
    if (allSelected) {
      pageIds.forEach(id => next.delete(id));
    } else {
      pageIds.forEach(id => next.add(id));
    }
    setSelectedIds(next);
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
      // Local state update instead of full reload for performance
      setPagamentos(prev => prev.map(p => p.id === id ? { ...p, tipo_execucao_pagamento: tipo } : p));
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

    // Bloquear se tipo for A_DEFINIR
    if (isReady && tipoExecucao === "A_DEFINIR") {
      toast({ 
        title: "Defina o tipo de execução", 
        description: "'Pendente' não é permitido para marcar como pronto. Selecione Manual ou Remessa.",
        variant: "destructive" 
      });
      return;
    }

    setProcessingAction(prev => ({ ...prev, [id]: true }));
    // Update otimista imediato para feedback instantâneo
    setPagamentos(prev => prev.map(p => p.id === id ? { ...p, is_pronto_para_robo: isReady } : p));
    try {
      const pagamento = isReady ? pagamentos.find(p => p.id === id) : null;

      // Rodar marcação + atualização do tipo_exec em PARALELO (era sequencial)
      const [readyRes, rmRes] = await Promise.all([
        supabase.functions.invoke("mariadb-proxy", {
          body: { action: "set_ready_for_robo", id, is_pronto: isReady }
        }),
        isReady && pagamento
          ? supabase.functions.invoke("mariadb-proxy", {
              body: {
                action: "update_tipo_exec_dados_rm",
                id_rm: pagamento.id_rm || null,
                numero_spo: pagamento.numero_spo,
                tipo_exec: tipoExecucao
              }
            })
          : Promise.resolve({ error: null } as any),
      ]);

      if (readyRes.error) throw readyRes.error;
      if (rmRes && (rmRes as any).error) {
        console.error("Erro ao atualizar tipo_exec em t_dados_rm:", (rmRes as any).error);
      }

      const isDebito = String((pagamento as any)?.forma_pagamento || "").toUpperCase() === "DEBITO";
      const autoConcluded = isReady && (isDebito || (readyRes as any)?.data?.auto_concluded);
      toast({ 
        title: autoConcluded
          ? "Voucher concluído (Débito automático)"
          : (isReady ? "Marcado como pronto" : "Desmarcado")
      });
    } catch (error: unknown) {
      // Rollback do update otimista em caso de erro
      setPagamentos(prev => prev.map(p => p.id === id ? { ...p, is_pronto_para_robo: !isReady } : p));
      toast({ 
        title: "Erro ao atualizar", 
        description: error instanceof Error ? error.message : "Erro desconhecido", 
        variant: "destructive" 
      });
    } finally {
      setProcessingAction(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleVoltarOperacional = async () => {
    if (voltarOperacionalJustificativa.trim().length < 10) {
      toast({ title: "Justificativa muito curta", description: "Mínimo de 10 caracteres", variant: "destructive" });
      return;
    }
    const isBatch = voltarBatchVouchers.length > 0;
    const targets: PagamentoItem[] = isBatch
      ? voltarBatchVouchers
      : (voltarOperacionalVoucher ? [voltarOperacionalVoucher] : []);
    if (targets.length === 0) {
      toast({ title: "Nenhum voucher selecionado", variant: "destructive" });
      return;
    }

    // Filtra ids sintéticos (RM pendentes ainda não persistidos)
    const validTargets = targets.filter(t => t.id && !String(t.id).startsWith("rm_pending_"));
    const skipped = targets.length - validTargets.length;
    if (validTargets.length === 0) {
      toast({
        title: "Vouchers ainda não persistidos",
        description: "Os itens selecionados ainda não foram criados no sistema. Aguarde a sincronização e tente novamente.",
        variant: "destructive",
      });
      return;
    }

    setVoltarOperacionalLoading(true);
    const isFiscal = voltarDestinoEtapa === "FISCAL";
    const novaEtapa = isFiscal ? "AJUSTE_FISCAL" : "AJUSTE_OPERACAO";
    const justificativaComMarcador = buildAjusteWithRequester(
      "FINANCEIRO",
      voltarOperacionalJustificativa.trim()
    );
    const logAcao = isFiscal ? "RETORNO_AJUSTE_FISCAL" : "RETORNO_AJUSTE_OPERACIONAL";
    const logLabel = isFiscal ? "Ajuste Fiscal" : "Ajuste Operacional";
    let sucesso = 0;
    let falha = 0;
    const errosDetalhe: string[] = [];

    console.log('[VoltarOperacional] Processando', validTargets.length, 'vouchers para', novaEtapa);
    for (const v of validTargets) {
      try {
        const updatePayload: Record<string, unknown> = {
          action: "update_voucher_esteira",
          voucher_id: v.id,
          etapa_atual: novaEtapa,
        };
        if (isFiscal) {
          updatePayload.ajuste_fiscal = justificativaComMarcador;
        } else {
          updatePayload.ajuste_operacao = justificativaComMarcador;
        }
        const { data: updData, error } = await supabase.functions.invoke("mariadb-proxy", {
          body: updatePayload,
        });
        if (error) throw error;
        if (updData && (updData as any).error) throw new Error(String((updData as any).error));

        await supabase.functions.invoke("mariadb-proxy", {
          body: {
            action: "save_voucher_log",
            voucher_id: v.id,
            acao: logAcao,
            detalhe: `Voucher retornado para ${logLabel} (solicitado por FINANCEIRO via tela de Pagamentos). Justificativa: ${voltarOperacionalJustificativa.trim()}`
          }
        });

        try {
          await sendVoucherReturnNotification({
            voucher: {
              id: v.id,
              numeroSPO: v.numero_spo,
              fornecedor: v.fornecedor,
              valor: v.valor,
              moeda: v.moeda,
              vencimento: v.vencimento,
            } as any,
            fromStage: "FINANCEIRO",
            toStage: novaEtapa as "AJUSTE_OPERACAO" | "AJUSTE_FISCAL",
            reason: voltarOperacionalJustificativa.trim(),
          });
        } catch (notifErr) {
          console.warn('[VoltarOperacional] Notificação falhou (não crítico)', v.id, notifErr);
        }
        sucesso++;
      } catch (e) {
        console.error("[VoltarOperacional] Erro ao retornar voucher", v.id, v.numero_spo, e);
        falha++;
        errosDetalhe.push(`${v.numero_spo}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    if (isBatch) {
      toast({
        title: `Retorno em lote para ${logLabel}`,
        description: `${sucesso} retornado(s)${falha > 0 ? `, ${falha} falha(s)` : ""}${skipped > 0 ? ` — ${skipped} ignorado(s) (não persistidos)` : ""}${errosDetalhe.length > 0 ? "\n" + errosDetalhe.slice(0, 3).join(" | ") : ""}`,
        variant: falha > 0 && sucesso === 0 ? "destructive" : "default",
      });
      setSelectedIds(new Set());
    } else {
      if (falha > 0) {
        toast({
          title: "Erro ao retornar voucher",
          description: errosDetalhe[0] || "Não foi possível retornar o voucher",
          variant: "destructive"
        });
      } else {
        toast({ title: `Voucher retornado para ${logLabel} com sucesso` });
      }
    }

    setVoltarOperacionalDialogOpen(false);
    setVoltarOperacionalJustificativa("");
    setVoltarOperacionalVoucher(null);
    setVoltarBatchVouchers([]);
    setVoltarDestinoEtapa("OPERACAO");
    setVoltarOperacionalLoading(false);
    loadPagamentos();
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
        
        <div className="flex items-center gap-3 flex-wrap">
          {/* Busca por Voucher/SPO ou Fornecedor */}
          <div className="relative">
            <Input
              value={filterFornecedor}
              onChange={(e) => setFilterFornecedor(e.target.value)}
              placeholder="Buscar por Voucher/SPO ou Fornecedor..."
              className="w-[280px] bg-card border-border rounded-full pl-3"
            />
          </div>

          {/* Filtro unificado por data de vencimento (De / Até opcionais) */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "rounded-full gap-2",
                  (filterDataInicio || filterDataFim) && "border-primary text-primary"
                )}
              >
                <CalendarIcon className="h-4 w-4" />
                {filterDataInicio && filterDataFim
                  ? `${fnsFormat(filterDataInicio, "dd/MM")} ─ ${fnsFormat(filterDataFim, "dd/MM")}`
                  : filterDataInicio
                  ? `≥ ${fnsFormat(filterDataInicio, "dd/MM/yyyy")}`
                  : filterDataFim
                  ? `≤ ${fnsFormat(filterDataFim, "dd/MM/yyyy")}`
                  : "Vencimento"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-3 bg-card border-border" align="start">
              <div className="flex flex-col md:flex-row gap-4">
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1 px-1">De</div>
                  <CalendarPicker
                    mode="single"
                    selected={filterDataInicio}
                    onSelect={setFilterDataInicio}
                    className={cn("p-0 pointer-events-auto")}
                  />
                </div>
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1 px-1">Até</div>
                  <CalendarPicker
                    mode="single"
                    selected={filterDataFim}
                    onSelect={setFilterDataFim}
                    className={cn("p-0 pointer-events-auto")}
                  />
                </div>
              </div>
              {(filterDataInicio || filterDataFim) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full mt-3"
                  onClick={() => {
                    setFilterDataInicio(undefined);
                    setFilterDataFim(undefined);
                  }}
                >
                  Limpar datas
                </Button>
              )}
            </PopoverContent>
          </Popover>

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
              <SelectItem value="A_DEFINIR">Pendente</SelectItem>
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
              setDadosBancariosCache({});
              loadPagamentos({ silent: true });
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
          {/* Sum of selected vouchers */}
          <span className="text-sm font-bold text-primary">
            {(() => {
              const selectedPags = pagamentos.filter(p => selectedIds.has(p.id));
              const sum = selectedPags.reduce((acc, p) => acc + (parseFloat(String(p.valor)) || 0), 0);
              return `Total: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(sum)}`;
            })()}
          </span>
          <div className="flex-1" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">
                Definir Tipo Execução
                <ChevronDown className="h-4 w-4 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => handleBatchSetTipoExecucao("A_DEFINIR")}>
                Pendente
              </DropdownMenuItem>
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
              const semTipo = selected.filter(p => !p.tipo_execucao_pagamento || p.tipo_execucao_pagamento === "A_DEFINIR");
              if (semTipo.length > 0) {
                toast({
                  title: "Tipo de execução obrigatório",
                  description: `${semTipo.length} voucher(s) sem tipo de execução definido ou com 'Pendente'. Defina antes de marcar como pronto.`,
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
          <Button
            size="sm"
            variant="outline"
            className="border-orange-500/50 text-orange-600 hover:bg-orange-500/10 dark:text-orange-400"
            onClick={() => {
              if (selectedIds.size === 0) return;
              const selected = pagamentos.filter(p => selectedIds.has(p.id));
              setVoltarBatchVouchers(selected);
              setVoltarOperacionalVoucher(null);
              setVoltarDestinoEtapa("OPERACAO");
              setVoltarOperacionalJustificativa("");
              setVoltarOperacionalDialogOpen(true);
            }}
          >
            <Undo2 className="h-4 w-4 mr-2" />
            Retornar Voucher ({selectedIds.size})
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
                    checked={paginatedPagamentos.length > 0 && paginatedPagamentos.every(p => selectedIds.has(p.id))}
                    onCheckedChange={handleSelectAll}
                  />
                </th>
                <th className="p-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleSort("numero_spo")}>
                  <span className="flex items-center">SPO{getSortIcon("numero_spo")}</span>
                </th>
                <th className="p-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleSort("fornecedor")}>
                  <span className="flex items-center">Fornecedor{getSortIcon("fornecedor")}</span>
                </th>
                <th className="p-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleSort("valor")}>
                  <span className="flex items-center">Valor{getSortIcon("valor")}</span>
                </th>
                <th className="p-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleSort("vencimento")}>
                  <span className="flex items-center">Vencimento{getSortIcon("vencimento")}</span>
                </th>
                <th className="p-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleSort("forma_pagamento")}>
                  <span className="flex items-center">Forma Pag.{getSortIcon("forma_pagamento")}</span>
                </th>
                <th className="p-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleSort("tipo_execucao_pagamento")}>
                  <span className="flex items-center">Tipo Exec.{getSortIcon("tipo_execucao_pagamento")}</span>
                </th>
                <th className="p-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paginatedPagamentos.map((pag) => {
                const vencido = isVencido(pag.vencimento);
                const hoje = isHoje(pag.vencimento);
                
                return (
                  <tr 
                    key={pag.id} 
                    className={cn(
                      "hover:bg-muted/30 transition-colors",
                      selectedIds.has(pag.id) && "bg-primary/5",
                      pag.is_master && "border-l-2 border-l-purple-500"
                    )}
                  >
                    <td className="p-3">
                      <Checkbox
                        checked={selectedIds.has(pag.id)}
                        onCheckedChange={() => handleSelectOne(pag.id)}
                      />
                    </td>
                    <td className="p-3">
                      {pag.is_master ? (
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-foreground">{pag.numero_spo}</span>
                            <MoedaBadge moeda={pag.moeda} />
                            <Badge className="bg-purple-600 text-[9px] px-1.5">Master</Badge>
                          </div>
                          {(() => {
                            const children = masterChildrenMap.get(pag.id);
                            if (!children || children.length === 0) return null;
                            const display = children.slice(0, 5).join(", ") + (children.length > 5 ? ` +${children.length - 5}` : "");
                            return <span className="text-[10px] text-muted-foreground">↳ {display}</span>;
                          })()}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="font-mono font-medium text-foreground">{pag.numero_spo}</span>
                          <MoedaBadge moeda={pag.moeda} />
                        </span>
                      )}
                      {pag.urgencia_tipo === "URGENTE_REAL" && (
                        <Badge className="ml-2 text-[9px] px-1.5 bg-red-500/15 text-red-400 border border-red-500/30">
                          ⚡ Urgente
                        </Badge>
                      )}
                      {pag.urgencia_tipo === "URGENTE_AUTOMATICO" && (
                        <Badge className="ml-2 text-[9px] px-1.5 bg-orange-500/15 text-orange-400 border border-orange-500/30">
                          ⚡ Auto
                        </Badge>
                      )}
                      {isBoleto(pag.forma_pagamento as any) && !pag.linha_digitavel && !pag.has_boleto_anexo && (
                        <Badge variant="warning" className="ml-2 text-[9px]">
                          Boleto não anexado
                        </Badge>
                      )}
                      {isBoleto(pag.forma_pagamento as any) && !pag.linha_digitavel && !!pag.has_boleto_anexo && (
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
                        value={pag.tipo_execucao_pagamento || "A_DEFINIR"}
                        onValueChange={(v) => handleSetTipoExecucao(pag.id, v as TipoExecucaoPagamento)}
                        disabled={processingAction[pag.id]}
                      >
                        <SelectTrigger className="h-8 w-[120px] text-xs">
                          <SelectValue placeholder="Pendente" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="A_DEFINIR">Pendente</SelectItem>
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
                            const myReq = ++anexosReqIdRef.current;
                            try {
                              const { data } = await supabase.functions.invoke("mariadb-proxy", {
                                body: { action: "get_voucher_anexos", voucher_id: pag.id }
                              });
                              if (myReq !== anexosReqIdRef.current) return; // descarta resposta antiga
                              if (data?.success === false) {
                                toast({
                                  title: "Falha ao carregar anexos",
                                  description: data?.error || "Tente novamente em instantes.",
                                  variant: "destructive",
                                });
                                // NÃO sobrescreve com lista vazia em caso de falha
                              } else {
                                setAnexosDialog(data?.data || []);
                              }
                            } catch (e) {
                              if (myReq !== anexosReqIdRef.current) return;
                              console.error("Erro ao carregar anexos:", e);
                              toast({
                                title: "Erro ao carregar anexos",
                                description: e instanceof Error ? e.message : "Erro desconhecido",
                                variant: "destructive",
                              });
                            } finally {
                              if (myReq === anexosReqIdRef.current) setLoadingAnexos(false);
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
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-orange-500 hover:text-orange-600 hover:bg-orange-500/10"
                          title="Retornar voucher"
                          disabled={processingAction[pag.id]}
                          onClick={() => {
                            setVoltarOperacionalVoucher(pag);
                            setVoltarOperacionalDialogOpen(true);
                          }}
                        >
                          <Undo2 className="h-4 w-4" />
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

      {sortedPagamentos.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <p className="text-xs text-muted-foreground">
            Mostrando {pageStartIndex + 1}–{Math.min(pageStartIndex + ITEMS_PER_PAGE, sortedPagamentos.length)} de {sortedPagamentos.length} processos
          </p>
          <TablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </div>
      )}

      {/* Details Dialog */}
      <Dialog open={detailsDialogOpen} onOpenChange={(open) => {
        if (!open) {
          // Invalida requests pendentes ao fechar para evitar respostas tardias sobrescreverem
          anexosReqIdRef.current++;
          setAnexosDialog([]);
          setLoadingAnexos(false);
        }
        setDetailsDialogOpen(open);
      }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Dados de Pagamento - {selectedPagamento?.numero_spo}
            </DialogTitle>
          </DialogHeader>
          {selectedPagamento && (
            <div className="space-y-6">
              {/* Master: show children */}
              {selectedPagamento.is_master && (
                <div className="p-4 rounded-xl border border-purple-500/30 bg-purple-500/10">
                  <div className="flex items-center gap-2 mb-3">
                    <Badge className="bg-purple-600 text-white">Master</Badge>
                    <span className="font-medium text-purple-400">
                      {selectedPagamento.numero_spo}
                    </span>
                  </div>
                  {(() => {
                    const children = masterChildrenMap.get(selectedPagamento.id);
                    if (!children || children.length === 0) {
                      return <p className="text-sm text-muted-foreground">Nenhum voucher filho vinculado</p>;
                    }
                    return (
                      <div className="space-y-1.5">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                          Vouchers Filhos ({children.length})
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {children.map((spo, idx) => (
                            <Badge key={idx} variant="outline" className="font-mono text-xs border-purple-500/30 text-purple-300">
                              {spo}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

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

              {/* Observações da Operação */}
              {(() => {
                const obs = selectedPagamento.comentarios_operacao;
                const hasObs = obs && String(obs).trim().length > 0;
                return (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <FileText className="h-4 w-4 text-primary" />
                      <span>Observações</span>
                      <Badge variant={hasObs ? "default" : "outline"} className="text-[10px]">
                        {hasObs ? "Com comentários" : "Sem comentários"}
                      </Badge>
                    </div>
                    <div className="rounded-lg bg-card border border-border p-4 space-y-1.5">
                      {hasObs ? (
                        <>
                          <Badge variant="outline" className="text-[10px]">Operação</Badge>
                          <p className="text-sm text-foreground whitespace-pre-wrap break-words">
                            {obs}
                          </p>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">
                          Nenhum comentário adicionado pela operação.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })()}



              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2 text-sm font-medium">
                  <div className="flex items-center gap-2">
                    <Paperclip className="h-4 w-4 text-primary" />
                    <span>Documentos Anexados</span>
                    {!loadingAnexos && (
                      <Badge variant="secondary" className="text-[10px]">{anexosDialog.length}</Badge>
                    )}
                  </div>
                  <ExtraAnexoUpload
                    voucherId={selectedPagamento.id}
                    etapaAtual={selectedPagamento.etapa_atual || "FINANCEIRO"}
                    compact
                    onUploaded={async () => {
                      const myReq = ++anexosReqIdRef.current;
                      try {
                        const { data } = await supabase.functions.invoke("mariadb-proxy", {
                          body: { action: "get_voucher_anexos", voucher_id: selectedPagamento.id },
                        });
                        if (myReq !== anexosReqIdRef.current) return;
                        if (data?.success === false) {
                          toast({
                            title: "Falha ao recarregar anexos",
                            description: data?.error || "Tente reabrir o detalhe.",
                            variant: "destructive",
                          });
                        } else {
                          setAnexosDialog(data?.data || []);
                        }
                      } catch (e) {
                        if (myReq !== anexosReqIdRef.current) return;
                        console.error("Erro ao recarregar anexos:", e);
                      }
                    }}
                  />
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
                                <FilePreview
                                  fileName={anexo.file_name || "arquivo"}
                                  fileUrl={anexo.file_url}
                                  fileType={anexo.tipo || "OUTROS"}
                                  onDownload={() => {
                                    const link = document.createElement("a");
                                    link.href = anexo.file_url;
                                    link.download = anexo.file_name || "arquivo";
                                    link.target = "_blank";
                                    document.body.appendChild(link);
                                    link.click();
                                    document.body.removeChild(link);
                                  }}
                                  allFiles={anexosDialog.filter((a: any) => a.file_url).map((a: any) => ({ fileName: a.file_name || "arquivo", fileUrl: a.file_url, fileType: a.tipo || "OUTROS" }))}
                                  initialIndex={anexosDialog.filter((a: any) => a.file_url).findIndex((a: any) => a.id === anexo.id)}
                                />
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

      {/* Retornar Voucher Dialog */}
      <Dialog 
        open={voltarOperacionalDialogOpen} 
        onOpenChange={(open) => {
          if (!voltarOperacionalLoading) {
            setVoltarOperacionalDialogOpen(open);
            if (!open) {
              setVoltarOperacionalJustificativa("");
              setVoltarOperacionalVoucher(null);
              setVoltarBatchVouchers([]);
              setVoltarDestinoEtapa("OPERACAO");
            }
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Undo2 className="h-5 w-5 text-orange-500" />
              {voltarBatchVouchers.length > 0
                ? `Retornar ${voltarBatchVouchers.length} Vouchers`
                : "Retornar Voucher"}
            </DialogTitle>
            <DialogDescription>
              {voltarBatchVouchers.length > 0 ? (
                <>
                  <span className="block mb-1">SPOs selecionados:</span>
                  <span className="block text-xs font-mono break-all">
                    {voltarBatchVouchers.slice(0, 5).map(v => v.numero_spo).join(", ")}
                    {voltarBatchVouchers.length > 5 ? ` +${voltarBatchVouchers.length - 5} mais` : ""}
                  </span>
                </>
              ) : (
                <>Voucher/SPO: <strong>{voltarOperacionalVoucher?.numero_spo}</strong></>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Retornar para <span className="text-red-500">*</span>
              </Label>
              <Select value={voltarDestinoEtapa} onValueChange={(v) => setVoltarDestinoEtapa(v as "OPERACAO" | "FISCAL")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OPERACAO">Operacional</SelectItem>
                  <SelectItem value="FISCAL">Fiscal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/30">
              <p className="text-sm text-orange-700 dark:text-orange-300">
                Ao retornar, o voucher entrará em <strong>{voltarDestinoEtapa === "FISCAL" ? "Ajuste Fiscal" : "Ajuste Operacional"}</strong> com a justificativa registrada. Após a correção, ele retornará automaticamente para o Financeiro.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="voltarJustificativa" className="text-sm font-medium">
                Justificativa <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="voltarJustificativa"
                placeholder={`Descreva o motivo para retornar o voucher (mínimo 10 caracteres)...`}
                value={voltarOperacionalJustificativa}
                onChange={(e) => setVoltarOperacionalJustificativa(e.target.value)}
                rows={4}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Mínimo de 10 caracteres
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setVoltarOperacionalDialogOpen(false);
                setVoltarOperacionalJustificativa("");
                setVoltarOperacionalVoucher(null);
                setVoltarBatchVouchers([]);
                setVoltarDestinoEtapa("OPERACAO");
              }}
              disabled={voltarOperacionalLoading}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleVoltarOperacional}
              disabled={voltarOperacionalLoading || voltarOperacionalJustificativa.trim().length < 10}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              {voltarOperacionalLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processando...
                </>
              ) : (
                "Confirmar Retorno"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
