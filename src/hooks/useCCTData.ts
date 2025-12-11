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
  SLAStatus,
  StatusCCTOficial,
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
];

// Helper to map MariaDB row to ProcessoCCT
function mapRowToProcessoCCT(row: any): ProcessoCCT {
  const shipment: CCTShipment = {
    id: row.id?.toString() || row.master,
    house: row.house || '',
    master: row.master || '',
    cliente: row.cliente || '',
    cnpj_consignatario: row.cnpj_consignatario,
    aeroporto_origem: row.aeroporto_origem || 'N/A',
    aeroporto_destino: row.aeroporto_destino || 'N/A',
    eta: row.eta,
    etd: row.etd,
    peso_declarado: row.peso_declarado,
    peso_constatado: row.peso_constatado,
    volume_declarado: row.volume_declarado,
    volume_constatado: row.volume_constatado,
    tratamentos_especiais: row.tratamentos_especiais ? 
      (typeof row.tratamentos_especiais === 'string' ? row.tratamentos_especiais.split(',') : row.tratamentos_especiais) : 
      null,
    analista_id: null,
    analista: row.nome_analista ? {
      id: 'analyst-1',
      nome: row.nome_analista,
      email: row.email_analista || '',
    } : null,
    nome_analista_legado: row.nome_analista,
    data_decolagem_ultimo_trecho: row.data_decolagem_ultimo_trecho,
    created_at: row.created_at || new Date().toISOString(),
    updated_at: row.updated_at || new Date().toISOString(),
  };

  const status_atual: CCTStatusAtual = {
    id: `status-${row.id || row.master}`,
    shipment_id: shipment.id,
    status_cct_oficial: (row.status_cct_oficial || 'EM_TRANSITO') as StatusCCTOficial,
    sla_status: (row.sla_status || 'OK') as SLAStatus,
    sla_limite: row.sla_limite,
    proximo_evento_esperado: null,
    tipo_voo: row.tipo_voo || null,
    created_at: row.created_at || new Date().toISOString(),
    updated_at: row.updated_at || new Date().toISOString(),
  };

  // Create event from last status
  const eventos = row.ultimo_evento_data ? [{
    id: `event-${row.id || row.master}`,
    shipment_id: shipment.id,
    codigo_evento: row.ultimo_evento_codigo || 'EM_TRANSITO',
    data_hora_evento: row.ultimo_evento_data,
    descricao: row.ultimo_evento_descricao || row.status_cct_oficial,
    fonte: 'LEADCOMEX' as const,
    nivel_confianca: 'PRIMARIA' as const,
    created_at: row.ultimo_evento_data,
  }] : [];

  // Create exception if alert status
  const alertStatuses = ['DIS', 'OFLD', 'NOT_FOUND', 'ERRO'];
  const excecoes: CCTExcecao[] = alertStatuses.includes(row.status_cct_oficial) ? [{
    id: `exc-${row.id || row.master}`,
    shipment_id: shipment.id,
    tipo_excecao: 'ATRASO_EVENTO',
    descricao: `Status de alerta: ${row.status_cct_oficial}`,
    status_excecao: 'ABERTA',
    fonte_detectou: 'SISTEMA',
    resolvido_em: null,
    created_at: row.ultimo_evento_data || new Date().toISOString(),
    updated_at: row.ultimo_evento_data || new Date().toISOString(),
  }] : [];

  return {
    shipment,
    status_atual,
    eventos,
    excecoes,
  };
}

// Processos CCT - fetch from MariaDB
export function useProcessosCCT() {
  return useQuery({
    queryKey: ["cct-processos"],
    queryFn: async (): Promise<ProcessoCCT[]> => {
      console.log("CCT: Fetching shipments from MariaDB...");
      
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: { action: 'get_cct_shipments' }
      });

      if (error) {
        console.error("CCT: Error fetching shipments:", error);
        throw new Error(error.message || 'Erro ao buscar processos CCT');
      }

      if (!data?.success) {
        console.error("CCT: API returned error:", data?.error);
        throw new Error(data?.error || 'Erro ao buscar processos CCT');
      }

      const processos = (data.data || []).map(mapRowToProcessoCCT);
      console.log(`CCT: Loaded ${processos.length} processos`);
      return processos;
    },
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // Refetch every minute
  });
}

export function useProcessoCCT(id: string) {
  return useQuery({
    queryKey: ["cct-processo", id],
    queryFn: async (): Promise<ProcessoCCT | null> => {
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: { action: 'get_cct_shipment', shipmentId: id }
      });

      if (error || !data?.success) {
        console.error("CCT: Error fetching shipment:", error || data?.error);
        return null;
      }

      return mapRowToProcessoCCT(data.data);
    },
    enabled: !!id,
  });
}

// Exceções - derived from processos with alert status
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

export function useUpdateExcecao() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: { id: string; status_excecao?: StatusExcecao }) => {
      // For now, exceptions are derived from shipment status
      // To "resolve" an exception, we would need to update the shipment status
      toast.info("Exceções são derivadas do status do shipment");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cct-excecoes"] });
      queryClient.invalidateQueries({ queryKey: ["cct-processos"] });
    },
  });
}

// Regras de Notificação - empty for now (can be implemented later)
export function useRegrasNotificacao() {
  return useQuery({
    queryKey: ["cct-regras"],
    queryFn: async (): Promise<CCTRegraNotificacao[]> => {
      // Notification rules not implemented in MariaDB yet
      return [];
    },
  });
}

export function useCreateRegra() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: Omit<CCTRegraNotificacao, "id" | "created_at" | "updated_at">) => {
      toast.info("Regras de notificação ainda não implementadas no MariaDB");
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
      toast.info("Regras de notificação ainda não implementadas no MariaDB");
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
      toast.info("Regras de notificação ainda não implementadas no MariaDB");
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cct-regras"] });
    },
  });
}

// Profiles - fetch from MariaDB
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
    staleTime: Infinity, // Static data never stales
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

// Registrar Peso - update shipment in MariaDB
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
      // Note: t_status_aereo doesn't have peso columns
      // This would need to update t_dados_master or create a new CCT table
      toast.info("Registro de peso requer integração adicional com MariaDB");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cct-processos"] });
    },
  });
}

// Tratamentos IATA - update shipment
export function useUpdateTratamentos() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: { shipmentId: string; tratamentos: string[] }) => {
      // Note: t_status_aereo doesn't have tratamentos column
      toast.info("Tratamentos especiais requer integração adicional com MariaDB");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cct-processos"] });
    },
  });
}

// Decolagem - update shipment
export function useUpdateDecolagem() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: { shipmentId: string; data_decolagem_ultimo_trecho: string }) => {
      toast.info("Data de decolagem requer integração adicional com MariaDB");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cct-processos"] });
    },
  });
}

// Assign analyst - update shipment
export function useAssignAnalista() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: { shipmentId: string; nome_analista: string; email_analista: string }) => {
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

      if (error) {
        toast.error("Erro ao atribuir analista");
        throw error;
      }

      toast.success("Analista atribuído com sucesso");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cct-processos"] });
    },
  });
}
