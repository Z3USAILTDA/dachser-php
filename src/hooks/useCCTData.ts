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
 * Map Supabase shipment row to ProcessoCCT structure
 * This follows the documented structure exactly
 */
function mapShipmentToProcessoCCT(row: any): ProcessoCCT {
  // Parse tratamentos_especiais (stored as comma-separated string or JSON)
  let tratamentos: string[] | null = null;
  if (row.tratamentos_especiais) {
    if (typeof row.tratamentos_especiais === 'string') {
      try {
        tratamentos = JSON.parse(row.tratamentos_especiais);
      } catch {
        tratamentos = row.tratamentos_especiais.split(',').map((t: string) => t.trim());
      }
    } else if (Array.isArray(row.tratamentos_especiais)) {
      tratamentos = row.tratamentos_especiais;
    }
  }

  // Derive status from last event (CRITICAL: never use fixed value)
  const derivedStatus = deriveStatusFromEvent(row.ultimo_evento_codigo);
  
  // Calculate SLA status
  const slaStatus = row.sla_status as SLAStatus || calculateSLAStatus(row.sla_limite, derivedStatus);

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
    analista_id: null, // No FK in current schema
    analista: row.nome_analista ? {
      id: 'analyst-legacy',
      nome: row.nome_analista,
      email: row.email_analista || '',
    } : null,
    nome_analista_legado: row.nome_analista, // Fallback from MariaDB
    data_decolagem_ultimo_trecho: row.data_decolagem_ultimo_trecho,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };

  // Build status_atual object
  const status_atual: CCTStatusAtual = {
    id: `status-${row.id}`,
    shipment_id: row.id,
    status_cct_oficial: derivedStatus, // DERIVED from last event
    sla_status: slaStatus,
    sla_limite: row.sla_limite,
    proximo_evento_esperado: null,
    tipo_voo: row.tipo_voo as TipoVoo || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };

  // Build eventos array from ultimo_evento_* fields
  // Since we don't have a separate events table, we create a single event from the last event
  const eventos: CCTEvento[] = [];
  if (row.ultimo_evento_data && row.ultimo_evento_codigo) {
    eventos.push({
      id: `event-${row.id}-1`,
      shipment_id: row.id,
      codigo_evento: row.ultimo_evento_codigo,
      data_hora_evento: row.ultimo_evento_data,
      descricao: row.ultimo_evento_descricao || row.ultimo_evento_codigo,
      fonte: 'LEADCOMEX',
      nivel_confianca: 'PRIMARIA',
      created_at: row.ultimo_evento_data,
    });
  }

  // Build excecoes array based on alert conditions
  const excecoes: CCTExcecao[] = [];
  const alertStatuses = ['DIS', 'OFLD', 'NOT_FOUND', 'ERRO', 'BLOQUEIO'];
  const isAlert = alertStatuses.includes(row.ultimo_evento_codigo) || row.excecoes_abertas > 0;
  
  if (isAlert) {
    excecoes.push({
      id: `exc-${row.id}`,
      shipment_id: row.id,
      tipo_excecao: row.ultimo_evento_codigo === 'DIS' || row.ultimo_evento_codigo === 'OFLD' 
        ? 'ATRASO_EVENTO' 
        : 'DIVERGENCIA_DADOS',
      descricao: `Status de alerta: ${row.ultimo_evento_codigo || 'Exceção aberta'}`,
      status_excecao: 'ABERTA',
      fonte_detectou: 'SISTEMA',
      resolvido_em: null,
      created_at: row.ultimo_evento_data || row.created_at,
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
 * Main hook to fetch CCT processes from Supabase shipments table
 * Flow: MariaDB → mariadb-dep-sync → Supabase shipments → Frontend
 */
export function useProcessosCCT() {
  return useQuery({
    queryKey: ["cct-processos"],
    queryFn: async (): Promise<ProcessoCCT[]> => {
      console.log("CCT: Fetching shipments from Supabase...");
      
      const { data, error } = await supabase
        .from("shipments")
        .select("*")
        .is("data_finalizacao", null) // Only active shipments
        .order("updated_at", { ascending: false })
        .limit(500);

      if (error) {
        console.error("CCT: Error fetching shipments:", error);
        throw new Error(error.message || 'Erro ao buscar processos CCT');
      }

      const processos = (data || []).map(mapShipmentToProcessoCCT);
      console.log(`CCT: Loaded ${processos.length} processos`);
      return processos;
    },
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // Refetch every minute
  });
}

/**
 * Fetch single CCT process by ID
 */
export function useProcessoCCT(id: string) {
  return useQuery({
    queryKey: ["cct-processo", id],
    queryFn: async (): Promise<ProcessoCCT | null> => {
      const { data, error } = await supabase
        .from("shipments")
        .select("*")
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

      // Alert count
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

export function useUpdateExcecao() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: { id: string; status_excecao?: StatusExcecao }) => {
      // Exceptions are derived from shipment status
      // To resolve, update the shipment's excecoes_abertas
      const shipmentId = data.id.replace('exc-', '');
      
      const { error } = await supabase
        .from("shipments")
        .update({ excecoes_abertas: 0 })
        .eq("id", shipmentId);

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

// Tratamentos IATA
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

// Decolagem
export function useUpdateDecolagem() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: { shipmentId: string; data_decolagem_ultimo_trecho: string }) => {
      const { error } = await supabase
        .from("shipments")
        .update({
          data_decolagem_ultimo_trecho: data.data_decolagem_ultimo_trecho,
        })
        .eq("id", data.shipmentId);

      if (error) throw error;
      
      toast.success("Decolagem atualizada");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cct-processos"] });
    },
  });
}

// Assign analyst
export function useAssignAnalista() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: { shipmentId: string; nome_analista: string; email_analista: string }) => {
      const { error } = await supabase
        .from("shipments")
        .update({
          nome_analista: data.nome_analista,
          email_analista: data.email_analista,
        })
        .eq("id", data.shipmentId);

      if (error) throw error;
      
      toast.success("Analista atribuído com sucesso");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cct-processos"] });
    },
  });
}
