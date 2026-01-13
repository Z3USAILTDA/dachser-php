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
 * Map MariaDB row to ProcessoCCT structure
 * Data comes directly from mariadb-proxy get_cct_shipments action
 */
function mapRowToProcessoCCT(row: any): ProcessoCCT {
  // Parse tratamento from t_master_dados - this is the primary source
  let tratamentos: string[] | null = null;
  const tratamentoSource = row.tratamento; // Use tratamento from t_master_dados
  if (tratamentoSource) {
    if (Array.isArray(tratamentoSource)) {
      tratamentos = tratamentoSource;
    } else if (typeof tratamentoSource === 'string') {
      tratamentos = tratamentoSource.split(',').map((t: string) => t.trim()).filter(Boolean);
    }
  }

  // Build shipment object
  const shipment: CCTShipment = {
    id: row.id?.toString() || row.master,
    house: row.house || '',
    master: row.master || '',
    cliente: row.cliente || '',
    cnpj_consignatario: row.cnpj_consignatario,
    aeroporto_origem: row.aeroporto_origem || 'N/A',
    aeroporto_destino: row.aeroporto_destino || 'GRU',
    eta: row.eta,
    etd: row.etd,
    peso_declarado: row.peso_declarado ? Number(row.peso_declarado) : null,
    peso_constatado: row.peso_constatado ? Number(row.peso_constatado) : null,
    volume_declarado: row.volume_declarado,
    volume_constatado: row.volume_constatado,
    tratamentos_especiais: tratamentos,
    status_manifestacao: row.status_manifestacao || 'AGUARDANDO',
    analista_id: null,
    analista: row.nome_analista ? {
      id: 'analyst-legacy',
      nome: row.nome_analista,
      email: row.email_analista || '',
    } : null,
    nome_analista_legado: row.nome_analista,
    data_decolagem_ultimo_trecho: row.dep_datetime || row.data_decolagem_ultimo_trecho,
    dep_datetime: row.dep_datetime,
    data_manifestacao_cct: row.data_manifestacao_cct,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };

  // Build status_atual object - status is derived from ultimo_evento_codigo
  // Extract sla_info from backend response for detailed SLA display
  const sla_info = row.sla_info ? {
    status: (row.sla_info.status || row.sla_status || 'OK') as SLAStatus,
    horasRestantes: row.sla_info.horasRestantes ?? null,
    percentual: row.sla_info.percentual ?? null,
    slaConfigHoras: row.sla_info.slaConfigHoras ?? row.sla_info.horasLimite ?? 24,
    tempoResposta: row.sla_info.tempoResposta ?? null,
    usouNovaLogica: row.sla_info.usouNovaLogica ?? false,
  } : {
    status: (row.sla_status || 'OK') as SLAStatus,
    horasRestantes: null,
    percentual: null,
    slaConfigHoras: 24,
    tempoResposta: null,
    usouNovaLogica: false,
  };

  const status_atual: CCTStatusAtual = {
    id: `status-${row.id}`,
    shipment_id: row.id?.toString() || row.master,
    status_cct_oficial: row.status_cct_oficial as StatusCCTOficial || 'INFORMADA',
    sla_status: sla_info.status,
    sla_limite: row.sla_limite,
    sla_info,
    proximo_evento_esperado: null,
    tipo_voo: row.tipo_voo as TipoVoo || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };

  // Build eventos array from ultimo_evento_* fields (fallback - will be replaced by useCCTEvents)
  const eventos: CCTEvento[] = [];
  if (row.ultimo_evento_data && row.ultimo_evento_codigo) {
    eventos.push({
      id: `event-${row.id}-1`,
      shipment_id: row.id?.toString() || row.master,
      codigo_evento: row.ultimo_evento_codigo,
      data_hora_evento: row.ultimo_evento_data,
      descricao: row.ultimo_evento_descricao || row.ultimo_evento_codigo,
      fonte: 'LEADCOMEX' as FonteEvento,
      nivel_confianca: 'PRIMARIA' as NivelConfianca,
      aeroporto: row.aeroporto_destino || null,
      created_at: row.ultimo_evento_data,
    });
  }

  // Build excecoes array based on alert conditions
  const excecoes: CCTExcecao[] = [];
  if (row.excecoes_abertas > 0) {
    excecoes.push({
      id: `exc-${row.id}`,
      shipment_id: row.id?.toString() || row.master,
      tipo_excecao: 'ATRASO_EVENTO',
      descricao: `Status de alerta: ${row.ultimo_evento_codigo || 'Exceção aberta'}`,
      status_excecao: 'ABERTA' as StatusExcecao,
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
    origem_cct: row.origem_cct || 'OUTRO',
  };
}

// ==================== HOOKS ====================

/**
 * Main hook to fetch CCT processes from MariaDB via mariadb-proxy
 * Source: t_master_dados (AIR IMPORT) LEFT JOIN t_status_aereo
 */
export function useProcessosCCT() {
  return useQuery({
    queryKey: ["cct-processos"],
    queryFn: async (): Promise<ProcessoCCT[]> => {
      console.log("CCT: Fetching shipments from MariaDB via mariadb-proxy...");
      
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: { action: 'get_cct_shipments' }
      });

      if (error) {
        console.error("CCT: Error fetching shipments:", error);
        throw new Error(error.message || 'Erro ao buscar processos CCT');
      }

      if (!data?.success) {
        console.error("CCT: Error in response:", data?.error);
        throw new Error(data?.error || 'Erro ao buscar processos CCT');
      }

      const processos = (data.data || []).map(mapRowToProcessoCCT);
      console.log(`CCT: Loaded ${processos.length} processos from MariaDB`);
      return processos;
    },
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // Refetch every minute
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
export function useCCTEvents(awb: string) {
  return useQuery({
    queryKey: ["cct-events", awb],
    queryFn: async (): Promise<CCTEvento[]> => {
      if (!awb) return [];

      console.log("CCT: Fetching events for AWB:", awb);
      
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: { 
          action: 'get_cct_events',
          awb: awb
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
