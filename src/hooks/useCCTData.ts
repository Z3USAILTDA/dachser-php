import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
 * Derive CCT status from the last event code
 * Status is ALWAYS derived from the last event, never a fixed value
 */
function deriveStatusFromEvent(eventoCode: string | null): StatusCCTOficial {
  if (!eventoCode) return "AGUARDANDO_MANIFESTACAO";
  
  const statusMap: Record<string, StatusCCTOficial> = {
    "AGUARDANDO_EMBARQUE": "AGUARDANDO_MANIFESTACAO",
    "AGUARDANDO_MANIFESTACAO": "AGUARDANDO_MANIFESTACAO",
    "MANIFESTADO": "MANIFESTADO",
    "AREA_TRANSFERENCIA": "AREA_TRANSFERENCIA",
    "CHEGADA_INFORMADA": "CHEGADA_INFORMADA",
    "RECEPCIONADO": "RECEPCIONADO",
    "EM_TRANSITO": "EM_TRANSITO",
    "ENTREGUE": "ENTREGUE",
    "BLOQUEIO": "BLOQUEIO",
    // Map tracking statuses to CCT statuses
    "DEP": "EM_TRANSITO",
    "ARR": "CHEGADA_INFORMADA",
    "RCF": "RECEPCIONADO",
    "DLV": "ENTREGUE",
    "POD": "ENTREGUE",
    "NFD": "AREA_TRANSFERENCIA",
    "DIS": "BLOQUEIO",
    "OFLD": "BLOQUEIO",
  };

  return statusMap[eventoCode] || "EM_TRANSITO";
}

/**
 * Calculate SLA status based on sla_limite
 */
function calculateSLAStatus(slaLimite: string | null, statusOficial: StatusCCTOficial): SLAStatus {
  // Finalized processes don't have SLA
  if (statusOficial === "ENTREGUE") return "OK";
  
  if (!slaLimite) return "OK";
  
  const now = new Date();
  const limite = new Date(slaLimite);
  const hoursRemaining = (limite.getTime() - now.getTime()) / (1000 * 60 * 60);
  
  if (hoursRemaining < 0) return "CRITICO";
  if (hoursRemaining < 24) return "ALERTA";
  return "OK";
}

/**
 * Map Supabase shipment row with JOINs to ProcessoCCT structure
 * Query: shipments + cct_status_atual + cct_evento_normalizado + cct_excecao_operacional
 */
function mapShipmentToProcessoCCT(row: any): ProcessoCCT {
  // Parse tratamentos_especiais (stored as comma-separated string or JSON array)
  let tratamentos: string[] | null = null;
  if (row.tratamentos_especiais) {
    if (typeof row.tratamentos_especiais === 'string') {
      try {
        tratamentos = JSON.parse(row.tratamentos_especiais);
      } catch {
        tratamentos = row.tratamentos_especiais.split(',').map((t: string) => t.trim()).filter(Boolean);
      }
    } else if (Array.isArray(row.tratamentos_especiais)) {
      tratamentos = row.tratamentos_especiais;
    }
  }

  // Get events from the joined cct_evento_normalizado table
  const eventosRaw = row.cct_evento_normalizado || [];
  
  // Sort events by date (most recent first) - CRITICAL for status derivation
  const sortedEvents = [...eventosRaw].sort((a: any, b: any) => 
    new Date(b.data_hora_evento).getTime() - new Date(a.data_hora_evento).getTime()
  );
  
  // Get the last event code to derive status
  const latestEvent = sortedEvents[0];
  const lastEventCode = latestEvent?.codigo_evento || row.ultimo_evento_codigo || null;
  
  // CRITICAL: Status is ALWAYS derived from the last event, never a fixed value
  const derivedStatus = deriveStatusFromEvent(lastEventCode);
  
  // Get SLA from cct_status_atual if exists, otherwise calculate
  const statusAtualRaw = row.cct_status_atual?.[0] || row.cct_status_atual;
  const slaLimite = statusAtualRaw?.sla_limite || row.sla_limite;
  const slaStatus = statusAtualRaw?.sla_status as SLAStatus || calculateSLAStatus(slaLimite, derivedStatus);

  // Build shipment object
  const shipment: CCTShipment = {
    id: row.id,
    house: row.house || '',
    master: row.master || '',
    cliente: row.cliente || '',
    cnpj_consignatario: row.cnpj_consignatario,
    aeroporto_origem: row.aeroporto_origem || 'N/A',
    aeroporto_destino: row.aeroporto_destino || 'N/A',
    eta: row.eta,
    etd: row.etd,
    peso_declarado: row.peso_declarado ? Number(row.peso_declarado) : null,
    peso_constatado: row.peso_constatado ? Number(row.peso_constatado) : null,
    volume_declarado: row.volume_declarado,
    volume_constatado: row.volume_constatado,
    tratamentos_especiais: tratamentos,
    analista_id: null, // Will be populated from profiles join when available
    analista: row.nome_analista ? {
      id: 'analyst-legacy',
      nome: row.nome_analista,
      email: row.email_analista || '',
    } : null,
    nome_analista_legado: row.nome_analista,
    data_decolagem_ultimo_trecho: row.data_decolagem_ultimo_trecho,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };

  // Build status_atual object
  const status_atual: CCTStatusAtual = {
    id: statusAtualRaw?.id || `status-${row.id}`,
    shipment_id: row.id,
    status_cct_oficial: derivedStatus, // DERIVED from last event
    sla_status: slaStatus,
    sla_limite: slaLimite,
    proximo_evento_esperado: null,
    tipo_voo: statusAtualRaw?.tipo_voo as TipoVoo || row.tipo_voo || null,
    created_at: statusAtualRaw?.created_at || row.created_at,
    updated_at: statusAtualRaw?.updated_at || row.updated_at,
  };

  // Build eventos array from joined cct_evento_normalizado
  const eventos: CCTEvento[] = sortedEvents.map((e: any) => ({
    id: e.id,
    shipment_id: e.shipment_id || row.id,
    codigo_evento: e.codigo_evento,
    data_hora_evento: e.data_hora_evento,
    descricao: e.descricao_evento || e.codigo_evento,
    fonte: e.fonte as FonteEvento || 'LEADCOMEX',
    nivel_confianca: e.nivel_confianca as NivelConfianca || 'PRIMARIA',
    created_at: e.created_at || e.data_hora_evento,
  }));

  // If no events from join, create one from ultimo_evento_* fields
  if (eventos.length === 0 && row.ultimo_evento_codigo && row.ultimo_evento_data) {
    eventos.push({
      id: `event-${row.id}-fallback`,
      shipment_id: row.id,
      codigo_evento: row.ultimo_evento_codigo,
      data_hora_evento: row.ultimo_evento_data,
      descricao: row.ultimo_evento_descricao || row.ultimo_evento_codigo,
      fonte: 'LEADCOMEX',
      nivel_confianca: 'PRIMARIA',
      created_at: row.ultimo_evento_data,
    });
  }

  // Build excecoes array from joined cct_excecao_operacional
  const excecoesRaw = row.cct_excecao_operacional || [];
  const excecoes: CCTExcecao[] = excecoesRaw
    .filter((e: any) => e.status_excecao !== 'RESOLVIDA')
    .map((e: any) => ({
      id: e.id,
      shipment_id: e.shipment_id || row.id,
      tipo_excecao: e.tipo_excecao,
      descricao: e.descricao,
      status_excecao: e.status_excecao as StatusExcecao,
      fonte_detectou: e.fonte_detectou || 'SISTEMA',
      resolvido_em: e.resolvido_em,
      created_at: e.created_at,
      updated_at: e.updated_at,
    }));

  // If excecoes_abertas > 0 but no exceptions from join, create one from status
  const alertStatuses = ['DIS', 'OFLD', 'BLOQUEIO'];
  const isAlertStatus = alertStatuses.includes(lastEventCode || '');
  
  if (excecoes.length === 0 && (row.excecoes_abertas > 0 || isAlertStatus)) {
    excecoes.push({
      id: `exc-${row.id}-derived`,
      shipment_id: row.id,
      tipo_excecao: isAlertStatus ? 'ATRASO_EVENTO' : 'DIVERGENCIA_DADOS',
      descricao: `Status de alerta: ${lastEventCode || 'Exceção aberta'}`,
      status_excecao: 'ABERTA',
      fonte_detectou: 'SISTEMA',
      resolvido_em: null,
      created_at: row.updated_at,
      updated_at: row.updated_at,
    });
  }

  return {
    shipment,
    status_atual,
    eventos,
    excecoes,
  };
}

// ==================== HOOKS ====================

/**
 * Main hook to fetch CCT processes from Supabase
 * Query: shipments JOIN cct_status_atual JOIN cct_evento_normalizado JOIN cct_excecao_operacional
 * Flow: MariaDB → mariadb-dep-sync → Supabase shipments → Frontend
 */
export function useProcessosCCT() {
  return useQuery({
    queryKey: ["cct-processos"],
    queryFn: async (): Promise<ProcessoCCT[]> => {
      console.log("CCT: Fetching shipments with JOINs from Supabase...");
      
      // Query with JOINs as per technical report
      const { data, error } = await (supabase as any)
        .from("shipments")
        .select(`
          *,
          cct_status_atual (*),
          cct_evento_normalizado (*),
          cct_excecao_operacional (*)
        `)
        .is("data_finalizacao", null) // Only active shipments
        .order("updated_at", { ascending: false })
        .limit(500);

      if (error) {
        console.error("CCT: Error fetching shipments:", error);
        throw new Error(error.message || 'Erro ao buscar processos CCT');
      }

      const processos = (data || []).map(mapShipmentToProcessoCCT);
      console.log(`CCT: Loaded ${processos.length} processos from Supabase`);
      return processos;
    },
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // Refetch every minute
  });
}

/**
 * Fetch single CCT process by ID with all related data
 */
export function useProcessoCCT(id: string) {
  return useQuery({
    queryKey: ["cct-processo", id],
    queryFn: async (): Promise<ProcessoCCT | null> => {
      const { data, error } = await (supabase as any)
        .from("shipments")
        .select(`
          *,
          cct_status_atual (*),
          cct_evento_normalizado (*),
          cct_excecao_operacional (*)
        `)
        .eq("id", id)
        .maybeSingle();

      if (error) {
        console.error("CCT: Error fetching shipment:", error);
        return null;
      }

      if (!data) return null;
      return mapShipmentToProcessoCCT(data);
    },
    enabled: !!id,
  });
}

/**
 * Exceções - from cct_excecao_operacional with open status
 */
export function useExcecoes() {
  return useQuery({
    queryKey: ["cct-excecoes"],
    queryFn: async (): Promise<CCTExcecao[]> => {
      const { data, error } = await (supabase as any)
        .from("cct_excecao_operacional")
        .select(`
          *,
          shipments (*)
        `)
        .neq("status_excecao", "RESOLVIDA")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("CCT: Error fetching excecoes:", error);
        return [];
      }

      return (data || []).map((e: any) => ({
        id: e.id,
        shipment_id: e.shipment_id,
        tipo_excecao: e.tipo_excecao,
        descricao: e.descricao,
        status_excecao: e.status_excecao,
        fonte_detectou: e.fonte_detectou,
        resolvido_em: e.resolvido_em,
        created_at: e.created_at,
        updated_at: e.updated_at,
        shipments: e.shipments,
      }));
    },
  });
}

/**
 * Analytics data for CCT dashboard
 */
export function useExcecoesAnalytics() {
  const { data: processos } = useProcessosCCT();
  
  return useQuery({
    queryKey: ["cct-excecoes-analytics"],
    queryFn: async () => {
      if (!processos) {
        return { statusDistribution: [], alertCount: 0, staleCount: 0, dailyEvents: [] };
      }

      // Status distribution
      const statusCounts: Record<string, number> = {};
      processos.forEach(p => {
        const status = p.status_atual.status_cct_oficial;
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      });
      const statusDistribution = Object.entries(statusCounts).map(([status, count]) => ({
        status,
        count,
      }));

      // Alert count (processes with open exceptions)
      const alertCount = processos.filter(p => p.excecoes.length > 0).length;

      // Stale count (no update in 24h)
      const now = Date.now();
      const staleCount = processos.filter(p => {
        if (!p.eventos[0]?.data_hora_evento) return true;
        const lastUpdate = new Date(p.eventos[0].data_hora_evento).getTime();
        return (now - lastUpdate) > 24 * 60 * 60 * 1000;
      }).length;

      // Daily events (last 7 days)
      const dailyEvents: Record<string, number> = {};
      processos.forEach(p => {
        p.eventos.forEach(e => {
          const date = new Date(e.data_hora_evento).toISOString().split('T')[0];
          dailyEvents[date] = (dailyEvents[date] || 0) + 1;
        });
      });

      return {
        statusDistribution,
        alertCount,
        staleCount,
        dailyEvents: Object.entries(dailyEvents).map(([date, count]) => ({ date, count })),
      };
    },
    enabled: !!processos,
  });
}

/**
 * Update exception status
 */
export function useUpdateExcecao() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: { id: string; status_excecao?: StatusExcecao }) => {
      const updateData: any = {};
      
      if (data.status_excecao) {
        updateData.status_excecao = data.status_excecao;
        if (data.status_excecao === 'RESOLVIDA') {
          updateData.resolvido_em = new Date().toISOString();
        }
      }

      const { error } = await (supabase as any)
        .from("cct_excecao_operacional")
        .update(updateData)
        .eq("id", data.id);

      if (error) throw error;
      
      toast.success("Exceção atualizada");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cct-excecoes"] });
      queryClient.invalidateQueries({ queryKey: ["cct-processos"] });
    },
  });
}

// Regras de Notificação - placeholder for future implementation
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cct-regras"] });
    },
  });
}

export function useUpdateRegra() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: { id: string; [key: string]: any }) => {
      toast.info("Regras de notificação em desenvolvimento");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cct-regras"] });
    },
  });
}

export function useDeleteRegra() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      toast.info("Regras de notificação em desenvolvimento");
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cct-regras"] });
    },
  });
}

/**
 * Profiles - fetch unique analysts from shipments
 */
export function useProfiles() {
  return useQuery({
    queryKey: ["cct-profiles"],
    queryFn: async (): Promise<CCTProfile[]> => {
      const { data, error } = await supabase
        .from("shipments")
        .select("nome_analista, email_analista")
        .not("nome_analista", "is", null)
        .not("nome_analista", "eq", "");

      if (error) {
        console.error("CCT: Error fetching profiles:", error);
        return [];
      }

      // Get unique analysts
      const uniqueAnalysts = new Map<string, CCTProfile>();
      (data || []).forEach((row, index) => {
        if (row.nome_analista && !uniqueAnalysts.has(row.nome_analista)) {
          uniqueAnalysts.set(row.nome_analista, {
            id: `analyst-${index + 1}`,
            nome: row.nome_analista,
            email: row.email_analista || '',
            ativo: true,
          });
        }
      });

      return Array.from(uniqueAnalysts.values());
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

// Registrar Peso
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
      const { error } = await supabase
        .from("shipments")
        .update({
          peso_declarado: data.peso_declarado,
          peso_constatado: data.peso_constatado,
          volume_declarado: data.volume_declarado,
          volume_constatado: data.volume_constatado,
        })
        .eq("id", data.shipmentId);

      if (error) throw error;
      
      toast.success("Peso registrado com sucesso");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cct-processos"] });
    },
  });
}

// Update tratamentos especiais
export function useUpdateTratamentos() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: { shipmentId: string; tratamentos: string[] }) => {
      const { error } = await supabase
        .from("shipments")
        .update({
          tratamentos_especiais: data.tratamentos.join(','),
        })
        .eq("id", data.shipmentId);

      if (error) throw error;
      
      toast.success("Tratamentos atualizados");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cct-processos"] });
    },
  });
}

// Update decolagem
export function useUpdateDecolagem() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: { shipmentId: string; data_decolagem: string }) => {
      const { error } = await supabase
        .from("shipments")
        .update({
          data_decolagem_ultimo_trecho: data.data_decolagem,
        })
        .eq("id", data.shipmentId);

      if (error) throw error;
      
      toast.success("Data de decolagem atualizada");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cct-processos"] });
    },
  });
}

// Assign analista
export function useAssignAnalista() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: { shipmentId: string; nome_analista: string; email_analista?: string }) => {
      const { error } = await supabase
        .from("shipments")
        .update({
          nome_analista: data.nome_analista,
          email_analista: data.email_analista,
        })
        .eq("id", data.shipmentId);

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

/**
 * Create new event in timeline
 */
export function useCreateEvento() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: {
      shipment_id: string;
      codigo_evento: string;
      descricao_evento?: string;
      fonte?: FonteEvento;
    }) => {
      const { error } = await (supabase as any)
        .from("cct_evento_normalizado")
        .insert({
          shipment_id: data.shipment_id,
          codigo_evento: data.codigo_evento,
          descricao_evento: data.descricao_evento,
          fonte: data.fonte || 'MANUAL',
          data_hora_evento: new Date().toISOString(),
        });

      if (error) throw error;
      
      // Also update the shipment's ultimo_evento_* fields
      await supabase
        .from("shipments")
        .update({
          ultimo_evento_codigo: data.codigo_evento,
          ultimo_evento_data: new Date().toISOString(),
          ultimo_evento_descricao: data.descricao_evento,
        })
        .eq("id", data.shipment_id);
      
      toast.success("Evento registrado");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cct-processos"] });
    },
  });
}

/**
 * Create new exception
 */
export function useCreateExcecao() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: {
      shipment_id: string;
      tipo_excecao: string;
      descricao: string;
      fonte_detectou?: string;
    }) => {
      const { error } = await (supabase as any)
        .from("cct_excecao_operacional")
        .insert({
          shipment_id: data.shipment_id,
          tipo_excecao: data.tipo_excecao,
          descricao: data.descricao,
          fonte_detectou: data.fonte_detectou || 'MANUAL',
          status_excecao: 'ABERTA',
        });

      if (error) throw error;
      
      // Increment excecoes_abertas on shipment
      const { data: shipment } = await supabase
        .from("shipments")
        .select("excecoes_abertas")
        .eq("id", data.shipment_id)
        .single();
      
      await supabase
        .from("shipments")
        .update({
          excecoes_abertas: (shipment?.excecoes_abertas || 0) + 1,
        })
        .eq("id", data.shipment_id);
      
      toast.success("Exceção criada");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cct-processos"] });
      queryClient.invalidateQueries({ queryKey: ["cct-excecoes"] });
    },
  });
}
