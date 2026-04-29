import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { filterByYearIfNotZ3us } from "@/utils/adminAccess";
import type { 
  ProcessoCCT, 
  CCTExcecao, 
  CCTRegraNotificacao, 
  CCTProfile, 
  CCTAeroporto, 
  CodigoIATA,
  StatusExcecao,
  CCTShipment,
  CCTStatusAtual,
  CCTEvento,
  SLAStatus,
  StatusCCTOficial,
  TipoVoo,
  FonteEvento,
  NivelConfianca,
} from "@/types/cct";
import { toast } from "sonner";
import { computeSLAInfo } from "@/utils/cctSLA";
import { getLatestTimelineStatus } from "@/utils/cctStatusResolver";

// Static data for airports
const AEROPORTOS: CCTAeroporto[] = [
  { codigo: "GRU", nome: "Guarulhos", cidade: "São Paulo", pais: "Brasil" },
  { codigo: "VCP", nome: "Viracopos", cidade: "Campinas", pais: "Brasil" },
  { codigo: "GIG", nome: "Galeão", cidade: "Rio de Janeiro", pais: "Brasil" },
  { codigo: "POA", nome: "Salgado Filho", cidade: "Porto Alegre", pais: "Brasil" },
  { codigo: "CWB", nome: "Afonso Pena", cidade: "Curitiba", pais: "Brasil" },
  { codigo: "FRA", nome: "Frankfurt", cidade: "Frankfurt", pais: "Alemanha" },
  { codigo: "MUC", nome: "Munique", cidade: "Munique", pais: "Alemanha" },
  { codigo: "CDG", nome: "Charles de Gaulle", cidade: "Paris", pais: "França" },
  { codigo: "AMS", nome: "Schiphol", cidade: "Amsterdã", pais: "Holanda" },
  { codigo: "LHR", nome: "Heathrow", cidade: "Londres", pais: "Reino Unido" },
  { codigo: "MIA", nome: "Miami International", cidade: "Miami", pais: "EUA" },
  { codigo: "JFK", nome: "John F. Kennedy", cidade: "Nova York", pais: "EUA" },
  { codigo: "PVG", nome: "Pudong", cidade: "Xangai", pais: "China" },
  { codigo: "HKG", nome: "Hong Kong", cidade: "Hong Kong", pais: "China" },
];

// Static data for IATA codes
const CODIGOS_IATA: CodigoIATA[] = [
  { codigo: "DGR", descricao: "Dangerous Goods", categoria: "Perigo" },
  { codigo: "PIL", descricao: "Perishable Items", categoria: "Perecível" },
  { codigo: "AVI", descricao: "Live Animals", categoria: "Animais" },
  { codigo: "RRE", descricao: "Refrigerated", categoria: "Refrigerado" },
  { codigo: "ELI", descricao: "Electronics", categoria: "Eletrônicos" },
  { codigo: "VAL", descricao: "Valuable Cargo", categoria: "Valor" },
  { codigo: "HUM", descricao: "Human Remains", categoria: "Especial" },
  { codigo: "ICE", descricao: "Dry Ice", categoria: "Refrigerado" },
  { codigo: "COL", descricao: "Cool Chain", categoria: "Refrigerado" },
];

/**
 * Map a free-form portal situation/event description to a canonical CCT status.
 * Returns null when no confident mapping is possible.
 */
function mapSituacaoToCCT(raw: string | null | undefined): StatusCCTOficial | null {
  if (!raw) return null;
  const s = String(raw).toLowerCase().trim();
  if (!s) return null;
  if (s.includes('bloque')) return 'BLOQUEIO';
  if (s.includes('entregue')) return 'ENTREGUE';
  if (s.includes('trans') && s.includes('terre')) return 'EM_TRANSITO_TERRESTRE';
  if (s.includes('troca') && s.includes('recint')) return 'EM_TROCA_RECINTOS';
  if (s.includes('recepc')) return 'RECEPCIONADA';
  if (s.includes('transfer')) return 'EM_AREA_TRANSFERENCIA';
  if (s.includes('manifest')) return 'MANIFESTADA';
  if (s.includes('inform')) return 'INFORMADA';
  return null;
}

/**
 * Parse the `eventos` JSON column from t_cct_dashboard_cache.
 * The column may arrive as a JSON string or as an already-parsed array,
 * and the array is NOT guaranteed to be in chronological order.
 *
 * Returns events sorted ASCENDING by event date. Items with invalid/missing
 * dates are still included but pushed to the end.
 */
function normalizeEventCode(descricao: string): string {
  const s = (descricao || '').toLowerCase().trim();
  if (!s) return 'EVENTO';
  if (s.includes('entregue')) return 'ENTREGUE';
  if (s.includes('chegada') && s.includes('inform')) return 'CHEGADA_INFORMADA';
  if (s.includes('recepc')) return 'RECEPCIONADO';
  if (s.includes('trans') && s.includes('terre')) return 'EM_TRANSITO';
  if (s.includes('transfer')) return 'EM_AREA_TRANSFERENCIA';
  if (s.includes('manifest')) return 'MANIFESTADO';
  if (s.includes('inform')) return 'MANIFESTADO';
  if (s.includes('bloque')) return 'BLOQUEIO';
  if (s.includes('troca') && s.includes('recint')) return 'EM_TROCA_RECINTOS';
  return descricao.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
}

function parsePipeDateToISO(dateStr: string): string | null {
  // dd/MM/yyyy HH:mm:ss
  const m = dateStr.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?$/);
  if (!m) return null;
  const [, dd, mm, yyyy, hh = '00', mi = '00', ss = '00'] = m;
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
}

function parseAndSortEventos(raw: any, shipmentId: string): CCTEvento[] {
  if (!raw) return [];
  let arr: any[] = [];

  if (Array.isArray(raw)) {
    arr = raw;
  } else if (typeof raw === 'string') {
    const trimmed = raw.trim();
    const looksJson = trimmed.startsWith('[') || trimmed.startsWith('{');
    if (looksJson) {
      try {
        const parsed = JSON.parse(trimmed);
        arr = Array.isArray(parsed) ? parsed : [];
      } catch {
        arr = [];
      }
    } else if (trimmed.includes('|')) {
      // Pipe format: "Descricao | dd/MM/yyyy HH:mm:ss || Descricao | ..."
      arr = trimmed
        .split('||')
        .map((chunk) => chunk.trim())
        .filter((chunk) => chunk.length > 0)
        .map((chunk) => {
          const [descPart, datePart] = chunk.split('|').map((s) => s.trim());
          const descricao = descPart || '';
          const iso = datePart ? parsePipeDateToISO(datePart) : null;
          return {
            descricao,
            data_hora_evento: iso,
            codigo_evento: normalizeEventCode(descricao),
          };
        })
        .filter((e) => e.descricao);
    }
  }

  const pickDate = (e: any): string | null => {
    return (
      e?.data_hora_evento ||
      e?.data_hora ||
      e?.dataHora ||
      e?.data ||
      e?.dataEvento ||
      e?.timestamp ||
      e?.dt ||
      null
    );
  };

  const pickDescricao = (e: any): string => {
    return (
      e?.descricao ||
      e?.descricao_evento ||
      e?.evento ||
      e?.situacao ||
      e?.situacao_portal ||
      e?.codigo_evento ||
      e?.codigo ||
      ''
    );
  };

  const pickCodigo = (e: any): string => {
    return (
      e?.codigo_evento ||
      e?.codigo ||
      pickDescricao(e) ||
      'EVENTO'
    );
  };

  const pickAeroporto = (e: any): string | null => {
    return e?.aeroporto || e?.recinto || e?.local || null;
  };

  const enriched = arr
    .filter((e: any) => e && typeof e === 'object')
    .map((e: any, idx: number) => {
      const dateStr = pickDate(e);
      const ts = dateStr ? new Date(String(dateStr).replace(' ', 'T')).getTime() : NaN;
      return {
        raw: e,
        dateStr,
        ts: isNaN(ts) ? null : ts,
        idx,
      };
    });

  enriched.sort((a, b) => {
    if (a.ts === null && b.ts === null) return a.idx - b.idx;
    if (a.ts === null) return 1;
    if (b.ts === null) return -1;
    return a.ts - b.ts;
  });

  return enriched.map((item, i) => ({
    // Numeric-friendly id so cctStatusResolver's tiebreaker (id desc) picks
    // the chronologically latest event when timestamps are tied.
    id: String(i + 1),
    shipment_id: shipmentId,
    codigo_evento: pickCodigo(item.raw),
    data_hora_evento: item.dateStr || new Date(0).toISOString(),
    descricao: pickDescricao(item.raw) || pickCodigo(item.raw),
    fonte: 'TRACKING' as FonteEvento,
    nivel_confianca: 'PRIMARIA' as NivelConfianca,
    aeroporto: pickAeroporto(item.raw),
    created_at: item.dateStr || new Date(0).toISOString(),
  }));
}

/**
 * Map a row from `get_cct_shipments_cached` (t_cct_dashboard_cache + t_master_dados)
 * into a ProcessoCCT. The cache is the SOLE source of operational fields:
 *   - eventos / teve_bloqueio / motivos_bloqueio
 *   - data_decolagem
 *   - peso/volume (declarado + constatado)
 *   - situacao_portal_atual (used only when it agrees with the latest chronological event)
 * Complementary fields (cliente, master, rota, analista, tratamentos) come from t_master_dados.
 */
function mapRowToProcessoCCT(row: any): ProcessoCCT {
  const shipmentId = (row.hawb || row.awb || '').toString();

  // Tratamentos especiais
  let tratamentos: string[] | null = null;
  const tratamentoSource = row.tratamento || row.tratamentos_especiais;
  if (tratamentoSource) {
    if (Array.isArray(tratamentoSource)) {
      tratamentos = tratamentoSource;
    } else if (typeof tratamentoSource === 'string') {
      tratamentos = tratamentoSource
        .split(/[,;\/\s]+/)
        .map((t: string) => t.trim().toUpperCase())
        .filter((t: string) => t.length > 0 && t.length <= 5);
    }
  }

  // Eventos (chronologically sorted)
  const eventos = parseAndSortEventos(row.eventos, shipmentId);

  // Status derivation MUST go through the same resolver used by the detail
  // header (ProcessoTimeline) so that dashboard and detail never diverge.
  // Fallback hierarchy: latest event -> situacao_portal_atual -> INFORMADA.
  const statusFromTimeline = eventos.length
    ? getLatestTimelineStatus(eventos, '' as any)
    : '';
  const statusFromPortal = mapSituacaoToCCT(row.situacao_portal_atual);
  const effectiveStatus: StatusCCTOficial =
    (statusFromTimeline as StatusCCTOficial) || statusFromPortal || 'INFORMADA';

  // Bloqueio handling
  const bloqueioRaw = (row.teve_bloqueio || '').toString().trim();
  const bloqueioLower = bloqueioRaw.toLowerCase();
  const hasBloqueio =
    bloqueioRaw !== '' &&
    bloqueioLower !== 'sem retorno cct' &&
    bloqueioLower !== 'não' &&
    bloqueioLower !== 'nao' &&
    bloqueioLower !== 'no' &&
    bloqueioLower !== 'false' &&
    bloqueioLower !== '0';
  // Status final = derivado APENAS da timeline (via cctStatusResolver).
  // teve_bloqueio é histórico e NÃO pode sobrepor o status; alimenta apenas a aba Exceções.
  const finalStatus: StatusCCTOficial = effectiveStatus;

  // Evidência de manifestação na timeline para SLA.
  // Se qualquer evento ≥ MANIFESTADA existir, SLA está cumprido — mesmo que o status
  // corrente tenha regredido (ex.: bloqueio após manifestação/entrega).
  const manifestadoEvent = eventos.find((e) => {
    const s = `${(e as any).descricao || ''} ${e.codigo_evento || ''}`.toLowerCase();
    return (
      s.includes('manifest') ||
      s.includes('recepc') ||
      s.includes('entreg') ||
      s.includes('transfer') ||
      (s.includes('trans') && s.includes('terre')) ||
      (s.includes('troca') && s.includes('recint'))
    );
  });
  const dataManifestacaoFromTimeline = manifestadoEvent?.data_hora_evento || null;

  const shipment: CCTShipment = {
    id: shipmentId,
    house: row.hawb || '',
    master: row.master || row.awb || '',
    cliente: row.cliente || '',
    cnpj_consignatario: null,
    aeroporto_origem: row.aeroporto_origem || 'N/A',
    aeroporto_destino: row.aeroporto_destino || 'GRU',
    eta: null,
    etd: null,
    peso_declarado: row.peso_recebido_declarado != null ? Number(row.peso_recebido_declarado) : null,
    peso_constatado: row.peso_constatado != null ? Number(row.peso_constatado) : null,
    volume_declarado: row.volume_recebido_declarado != null ? Number(row.volume_recebido_declarado) : null,
    volume_constatado: row.volume_constatado != null ? Number(row.volume_constatado) : null,
    tratamentos_especiais: tratamentos,
    status_manifestacao: finalStatus === 'ENTREGUE' ? 'ENTREGUE' : 'AGUARDANDO',
    analista_id: null,
    analista: row.nome_analista
      ? {
          id: 'analyst-legacy',
          nome: row.nome_analista,
          email: row.email_analista || '',
        }
      : null,
    nome_analista_legado: row.nome_analista,
    data_decolagem_ultimo_trecho: row.data_decolagem || null,
    dep_datetime: row.data_decolagem || null,
    data_manifestacao_cct: null,
    created_at: row.created_at || row.refreshed_at || null,
    updated_at: row.data_ultima_atualizacao_atual || row.refreshed_at || null,
    ruc: null,
    recinto_aduaneiro: null,
    numero_voo: null,
    data_emissao: null,
    indicador_madeira: false,
    info_frete: null,
    manuseios_especiais_rfb: [],
    rfb_situacao: null,
  };

  const sla_info = computeSLAInfo({
    depDatetime: row.data_decolagem || null,
    eta: null,
    originAirport: row.aeroporto_origem || null,
    status: finalStatus,
    dataManifestacao: dataManifestacaoFromTimeline,
  });

  const status_atual: CCTStatusAtual = {
    id: `status-${shipmentId}`,
    shipment_id: shipmentId,
    status_cct_oficial: finalStatus,
    sla_status: sla_info.status,
    sla_limite: sla_info.slaLimite || null,
    sla_info,
    proximo_evento_esperado: null,
    tipo_voo: sla_info.tipoVoo || null,
    created_at: row.created_at || row.refreshed_at || null,
    updated_at: row.data_ultima_atualizacao_atual || row.refreshed_at || null,
  };

  // Excecoes derived from bloqueio
  const excecoes: CCTExcecao[] = [];
  if (hasBloqueio) {
    excecoes.push({
      id: `exc-${shipmentId}`,
      shipment_id: shipmentId,
      tipo_excecao: 'CARGA_BLOQUEADA',
      descricao: row.motivos_bloqueio || `Bloqueio: ${bloqueioRaw}`,
      status_excecao: 'ABERTA' as StatusExcecao,
      fonte_detectou: 'CCT_CACHE',
      resolvido_em: null,
      created_at: row.data_ultima_atualizacao_atual || row.refreshed_at || new Date().toISOString(),
      updated_at: row.data_ultima_atualizacao_atual || row.refreshed_at || new Date().toISOString(),
    });
  }

  return {
    shipment,
    status_atual,
    eventos,
    excecoes,
    origem_cct: 'OUTRO',
    data_entregue: finalStatus === 'ENTREGUE' ? row.data_ultima_atualizacao_atual || null : null,
    // Extra cache metadata exposed for UI tooltips
    cache_meta: {
      teve_bloqueio: row.teve_bloqueio || null,
      motivos_bloqueio: row.motivos_bloqueio || null,
      situacao_portal_atual: row.situacao_portal_atual || null,
      data_ultima_atualizacao_atual: row.data_ultima_atualizacao_atual || null,
      consulted_at_ultima_consulta: row.consulted_at_ultima_consulta || null,
      refreshed_at: row.refreshed_at || null,
    },
  } as ProcessoCCT;
}

// ==================== HOOKS ====================

/**
 * Main hook to fetch CCT processes from MariaDB via mariadb-proxy
 * Source: t_master_dados (AIR IMPORT) LEFT JOIN t_status_aereo
 */
// Todos os usuários autenticados podem ver dados do CCT

export function useProcessosCCT() {
  return useQuery({
    queryKey: ["cct-processos"],
    queryFn: async (): Promise<ProcessoCCT[]> => {
      // Todos os usuários autenticados podem ver dados

      console.log("CCT: Fetching shipments from MariaDB via mariadb-proxy...");

      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: { action: 'get_cct_shipments_cached' }
      });

      if (error) {
        console.error("CCT: Error fetching shipments:", error);
        throw new Error(error.message || 'Erro ao buscar processos CCT');
      }

      if (!data?.success) {
        console.error("CCT: Error in response:", data?.error);
        throw new Error(data?.error || 'Erro ao buscar processos CCT');
      }

      // O edge `get_cct_shipments_cached` já aplica a regra de retenção
      // (oculta entregues após 5 dias do evento via dados_dachser.t_cct_hidden_hawbs).
      const allProcessos: ProcessoCCT[] = (data.data || []).map(mapRowToProcessoCCT);
      const processos = filterByYearIfNotZ3us<ProcessoCCT>(allProcessos, (p) => p.shipment.created_at);
      console.log(`CCT: Loaded ${processos.length} processos (total: ${allProcessos.length})`);
      return processos;
    },
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchInterval: () => (typeof document !== "undefined" && document.visibilityState === "visible" ? 120_000 : false),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    retry: (failureCount, error: any) => {
      const msg = String(error?.message || '').toLowerCase();
      const transient =
        msg.includes('temporariamente indisponível') ||
        msg.includes('max_user_connections') ||
        msg.includes('timed out');
      if (transient) return false;
      return failureCount < 1;
    },
    retryDelay: 5000,
  });
}

/**
 * Fetch single CCT process by ID or AWB
 */
export function useProcessoCCT(id: string) {
  return useQuery({
    queryKey: ["cct-processo", id],
    queryFn: async (): Promise<ProcessoCCT | null> => {
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: { 
          action: 'get_cct_shipment',
          shipmentId: id
        }
      });

      if (error) {
        console.error("CCT: Error fetching shipment:", error);
        return null;
      }

      if (!data?.success || !data?.data) return null;
      return mapRowToProcessoCCT(data.data);
    },
    enabled: !!id,
  });
}

/**
 * Fetch CCT events history for a specific AWB from MariaDB
 */
export function useCCTEvents(awb: string, master?: string) {
  return useQuery({
    queryKey: ["cct-events", awb, master],
    queryFn: async (): Promise<CCTEvento[]> => {
      if (!awb) return [];

      console.log("CCT: Fetching events for AWB:", awb, "Master:", master);
      
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: { 
          action: 'get_cct_events',
          awb: awb,
          master: master || '',
        }
      });

      if (error) {
        console.error("CCT: Error fetching events:", error);
        return [];
      }

      if (!data?.success) {
        console.error("CCT: Error in response:", data?.error);
        return [];
      }

      // Map MariaDB rows to CCTEvento format
      const eventos: CCTEvento[] = (data.data || []).map((row: any, index: number) => ({
        id: row.id?.toString() || `event-${awb}-${index}`,
        shipment_id: awb,
        codigo_evento: row.codigo_evento || 'UNKNOWN',
        data_hora_evento: row.data_hora_evento,
        descricao: row.descricao_evento || row.codigo_evento,
        fonte: (row.fonte || 'TRACKING') as FonteEvento,
        nivel_confianca: (row.nivel_confianca || 'PRIMARIA') as NivelConfianca,
        aeroporto: row.aeroporto || null,
        created_at: row.created_at || row.data_hora_evento,
      }));

      console.log(`CCT: Loaded ${eventos.length} events for AWB ${awb}`);
      return eventos;
    },
    enabled: !!awb,
    staleTime: 30000,
  });
}

/**
 * Exceções - derived from processos with alert status
 */
export function useExcecoes() {
  const { data: processos } = useProcessosCCT();
  
  return useQuery({
    queryKey: ["cct-excecoes"],
    queryFn: async (): Promise<CCTExcecao[]> => {
      if (!processos) return [];
      
      return processos
        .filter(p => p.excecoes.length > 0)
        .flatMap(p => p.excecoes.map(exc => ({
          ...exc,
          shipments: p.shipment,
        })));
    },
    enabled: !!processos,
  });
}

/**
 * Analytics data from MariaDB
 */
export function useExcecoesAnalytics() {
  return useQuery({
    queryKey: ["cct-excecoes-analytics"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: { action: 'get_cct_analytics' }
      });

      if (error || !data?.success) {
        console.error("CCT: Error fetching analytics:", error || data?.error);
        return { statusDistribution: [], alertCount: 0, staleCount: 0, dailyEvents: [] };
      }

      return data.data;
    },
  });
}

/**
 * Update exception status
 */
export function useUpdateExcecao() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: { id: string; status_excecao?: StatusExcecao }) => {
      // For MariaDB source, we don't have a separate exceptions table
      // Just mark as resolved by invalidating the cache
      toast.success("Exceção atualizada");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cct-excecoes"] });
      queryClient.invalidateQueries({ queryKey: ["cct-processos"] });
    },
  });
}

// Regras de Notificação - placeholder
export function useRegrasNotificacao() {
  return useQuery({
    queryKey: ["cct-regras"],
    queryFn: async (): Promise<CCTRegraNotificacao[]> => [],
  });
}

export function useCreateRegra() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Omit<CCTRegraNotificacao, "id" | "created_at" | "updated_at">) => {
      toast.info("Regras de notificação em desenvolvimento");
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cct-regras"] }),
  });
}

export function useUpdateRegra() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { id: string; [key: string]: any }) => {
      toast.info("Regras de notificação em desenvolvimento");
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cct-regras"] }),
  });
}

export function useDeleteRegra() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      toast.info("Regras de notificação em desenvolvimento");
      return id;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cct-regras"] }),
  });
}

/**
 * Profiles - fetch from MariaDB via mariadb-proxy
 */
export function useProfiles() {
  return useQuery({
    queryKey: ["cct-profiles"],
    queryFn: async (): Promise<CCTProfile[]> => {
      // Todos os usuários autenticados podem ver dados

      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: { action: 'get_cct_profiles' }
      });

      if (error || !data?.success) {
        console.error("CCT: Error fetching profiles:", error || data?.error);
        return [];
      }

      return data.data || [];
    },
  });
}

// Aeroportos - static data
export function useAeroportos() {
  return useQuery({
    queryKey: ["cct-aeroportos"],
    queryFn: async () => AEROPORTOS,
    staleTime: Infinity,
  });
}

// Códigos IATA - static data
export function useCodigosIATA() {
  return useQuery({
    queryKey: ["cct-codigos-iata"],
    queryFn: async () => CODIGOS_IATA,
    staleTime: Infinity,
  });
}

// Registrar Peso - update via mariadb-proxy
export function useRegistrarPeso() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: {
      shipmentId: string;
      peso_declarado: number;
      peso_constatado: number;
      volume_declarado?: number;
      volume_constatado?: number;
    }) => {
      const { error } = await supabase.functions.invoke('mariadb-proxy', {
        body: { 
          action: 'update_cct_shipment',
          shipmentId: data.shipmentId,
          updates: {
            peso_bruto: data.peso_declarado,
            peso_real: data.peso_constatado,
            volume: data.volume_declarado,
          }
        }
      });

      if (error) throw error;
      toast.success("Peso registrado com sucesso");
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cct-processos"] }),
  });
}

// Update tratamentos especiais
export function useUpdateTratamentos() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: { shipmentId: string; tratamentos: string[] }) => {
      const { error } = await supabase.functions.invoke('mariadb-proxy', {
        body: { 
          action: 'update_cct_shipment',
          shipmentId: data.shipmentId,
          updates: {
            tratamento_especial: data.tratamentos.join(','),
          }
        }
      });

      if (error) throw error;
      toast.success("Tratamentos atualizados");
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cct-processos"] }),
  });
}

// Update decolagem
export function useUpdateDecolagem() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: { shipmentId: string; data_decolagem: string }) => {
      const { error } = await supabase.functions.invoke('mariadb-proxy', {
        body: { 
          action: 'update_cct_shipment',
          shipmentId: data.shipmentId,
          updates: {
            data_decolagem: data.data_decolagem,
          }
        }
      });

      if (error) throw error;
      toast.success("Data de decolagem atualizada");
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cct-processos"] }),
  });
}

// Assign analista
export function useAssignAnalista() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: { shipmentId: string; nome_analista: string; email_analista?: string }) => {
      const { error } = await supabase.functions.invoke('mariadb-proxy', {
        body: { 
          action: 'update_cct_shipment',
          shipmentId: data.shipmentId,
          updates: {
            nome_analista: data.nome_analista,
            email_analista: data.email_analista,
          }
        }
      });

      if (error) throw error;
      toast.success("Analista atribuído");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cct-processos"] });
      queryClient.invalidateQueries({ queryKey: ["cct-profiles"] });
    },
  });
}
