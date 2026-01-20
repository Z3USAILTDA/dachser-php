import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface LeadcomexLogFilters {
  hawb?: string;
  success?: boolean | null;
  date_from?: string;
  date_to?: string;
  execution_source?: string;
  limit?: number;
  offset?: number;
}

export interface LeadcomexLog {
  id: number;
  hawb: string;
  mawb: string | null;
  dep_date: string | null;
  success: boolean;
  matched_date: string | null;
  offset_days: number;
  total_attempts: number;
  total_time_ms: number | null;
  execution_source: string;
  lc_hawb: string | null;
  lc_data_emissao: string | null;
  lc_situacao_lead: string | null;
  lc_situacao_portal: string | null;
  lc_tipo: string | null;
  lc_situacao_carga: number | null;
  lc_categoria_carga: string | null;
  lc_aeroporto_origem: string | null;
  lc_aeroporto_destino: string | null;
  lc_peso_bruto: number | null;
  lc_quantidade_volumes: number | null;
  lc_cnpj_consignatario: string | null;
  lc_nome_consignatario: string | null;
  lc_nome_embarcador: string | null;
  lc_cidade_embarcador: string | null;
  lc_pais_embarcador: string | null;
  lc_frete_valor_total: number | null;
  lc_frete_moeda_codigo: string | null;
  lc_bloqueios_ativos: any[];
  lc_viagens_associadas: any[];
  attempts: AttemptLog[];
  created_at: string;
}

export interface AttemptLog {
  attempt_number: number;
  date: string;
  status: 'found' | 'not_found' | 'error' | 'pending' | 'processing';
  http_status?: number;
  response_time_ms?: number;
  error_message?: string;
  full_response?: any;
}

export interface LeadcomexLogStats {
  total: number;
  success_count: number;
  error_count: number;
  success_rate: string;
  avg_time_ms: number;
  avg_offset_days: string;
  avg_attempts: string;
  days_with_data: number;
}

export function useLeadcomexLogs(filters: LeadcomexLogFilters) {
  return useQuery({
    queryKey: ['leadcomex-logs', filters],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: { 
          action: 'get_leadcomex_logs',
          ...filters 
        }
      });
      
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to fetch logs');
      
      return {
        logs: data.logs as LeadcomexLog[],
        total: data.total as number,
        limit: data.limit as number,
        offset: data.offset as number,
      };
    },
    refetchInterval: 30000, // Refresh every 30s
  });
}

export function useLeadcomexLogDetail(logId: number | null) {
  return useQuery({
    queryKey: ['leadcomex-log-detail', logId],
    queryFn: async () => {
      if (!logId) return null;
      
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: { 
          action: 'get_leadcomex_log_detail',
          id: logId
        }
      });
      
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to fetch log detail');
      
      return data.log;
    },
    enabled: !!logId,
  });
}

export function useLeadcomexLogsStats(dateFrom?: string, dateTo?: string) {
  return useQuery({
    queryKey: ['leadcomex-logs-stats', dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: { 
          action: 'get_leadcomex_logs_stats',
          date_from: dateFrom,
          date_to: dateTo
        }
      });
      
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to fetch stats');
      
      return data.stats as LeadcomexLogStats;
    },
    refetchInterval: 60000, // Refresh every minute
  });
}

export function useSaveLeadcomexLog() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: {
      hawb: string;
      mawb?: string;
      dep_date?: string;
      success: boolean;
      matched_date?: string;
      offset_days: number;
      total_attempts: number;
      total_time_ms: number;
      execution_source: string;
      attempts: AttemptLog[];
      leadcomex_data?: any;
    }) => {
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: { 
          action: 'save_leadcomex_log',
          ...params
        }
      });
      
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to save log');
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leadcomex-logs'] });
      queryClient.invalidateQueries({ queryKey: ['leadcomex-logs-stats'] });
    },
  });
}
