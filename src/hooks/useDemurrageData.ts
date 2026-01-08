import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DemurrageContainer {
  id: number;
  numero: string;
  mbl: string;
  booking: string | null;
  cliente: string | null;
  armador: string | null;
  tipo_processo: string | null;
  porto_origem: string | null;
  porto_destino: string | null;
  navio: string | null;
  vessel_imo: string | null;
  voyage: string | null;
  etd: string | null;
  eta: string | null;
  data_atracacao: string | null;
  data_gate_out: string | null;
  last_event: string | null;
  container_status: string | null;
  status_armador: string | null;
  cronos_status: string;
  email_analista: string | null;
  email_cliente: string | null;
  tipo_conteiner: string | null;
  ft_started_at: string | null;
  free_time_days: number;
  free_time_end_date: string | null;
  data_devolucao: string | null;
  days_remaining: number | null;
  excedente_dias: number;
  expected_cost_usd: number;
  rate_usd_per_day: number | null;
  risk_status: string;
  risk_score: number;
  pre_invoice_number: string | null;
  pre_invoice_status: string;
  pre_invoice_total_usd: number | null;
  disputed_amount_usd: number;
  recovered_amount_usd: number;
  dispute_status: string | null;
  dispute_reason: string | null;
  armador_invoice_number: string | null;
  armador_cost_usd: number | null;
  armador_days_charged: number | null;
  audit_status: string | null;
  discrepancy_usd: number | null;
  client_auto_alert: boolean;
  client_alert_days_before: number;
  client_report_frequency: string;
  notes: string | null;
  mariadb_id: number | null;
  last_sync_at: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DemurrageFilters {
  search?: string;
  risk_status?: string;
  cronos_status?: string;
  cliente?: string;
  armador?: string;
  pre_invoice_status?: string;
  dispute_status?: string;
  audit_status?: string;
}

export interface DemurrageStats {
  total: number;
  inTransit: number;
  atRisk: number;
  delivered: number;
  totalDemurrageUsd: number;
}

export interface DemurrageRate {
  id: number;
  armador: string;
  container_type: string;
  free_time_days: number;
  rate_usd: number;
  period_type: string;
  period_start_day: number | null;
  period_end_day: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export function useDemurrageData(filters?: DemurrageFilters) {
  return useQuery({
    queryKey: ['demurrage_containers', filters],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: {
          action: 'demurrage_get_containers',
          search: filters?.search,
          risk_status: filters?.risk_status,
          cronos_status: filters?.cronos_status,
          cliente: filters?.cliente,
          armador: filters?.armador,
          pre_invoice_status: filters?.pre_invoice_status,
          dispute_status: filters?.dispute_status,
          audit_status: filters?.audit_status,
        }
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to fetch containers');
      return (data.data || []) as DemurrageContainer[];
    },
  });
}

export function useDemurrageStats() {
  return useQuery({
    queryKey: ['demurrage_stats'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: { action: 'demurrage_get_stats' }
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to fetch stats');
      return data.data as DemurrageStats;
    },
  });
}

export function useUpdateDemurrageContainer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ containerId, updates }: { containerId: number; updates: Record<string, unknown> }) => {
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: {
          action: 'demurrage_update_container',
          container_id: containerId,
          updates,
        }
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to update container');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demurrage_containers'] });
      queryClient.invalidateQueries({ queryKey: ['demurrage_stats'] });
    },
  });
}

export function useDemurrageRates() {
  return useQuery({
    queryKey: ['demurrage_rates'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: { action: 'demurrage_get_rates' }
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to fetch rates');
      return (data.data || []) as DemurrageRate[];
    },
  });
}

export function useCreateDemurrageRate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (rate: {
      armador: string;
      container_type: string;
      free_time_days: number;
      rate_usd: number;
      period_type?: string;
      period_start_day?: number;
      period_end_day?: number;
    }) => {
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: {
          action: 'demurrage_create_rate',
          ...rate,
        }
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to create rate');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demurrage_rates'] });
    },
  });
}

export function useUpdateDemurrageRate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & Partial<{
      armador: string;
      container_type: string;
      free_time_days: number;
      rate_usd: number;
      period_type: string;
      period_start_day: number;
      period_end_day: number;
      active: boolean;
    }>) => {
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: {
          action: 'demurrage_update_rate',
          rate_id: id,
          updates,
        }
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to update rate');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demurrage_rates'] });
    },
  });
}

export function useDeleteDemurrageRate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: {
          action: 'demurrage_delete_rate',
          rate_id: id,
        }
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to delete rate');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demurrage_rates'] });
    },
  });
}

export function useDemurrageSettings() {
  return useQuery({
    queryKey: ['demurrage_settings'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: { action: 'demurrage_get_settings' }
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to fetch settings');
      return (data.data || {}) as Record<string, string>;
    },
  });
}

export function useUpdateDemurrageSetting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: {
          action: 'demurrage_update_setting',
          setting_key: key,
          setting_value: value,
        }
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to update setting');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demurrage_settings'] });
    },
  });
}

export function useSyncDemurrage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('demurrage-mariadb-sync');
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demurrage_containers'] });
      queryClient.invalidateQueries({ queryKey: ['demurrage_stats'] });
    },
  });
}

export function useRecalcDemurrage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('demurrage-recalc');
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demurrage_containers'] });
      queryClient.invalidateQueries({ queryKey: ['demurrage_stats'] });
    },
  });
}

export function useDemurrageClients() {
  return useQuery({
    queryKey: ['demurrage_clients'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: { action: 'demurrage_get_unique_clients' }
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to fetch clients');
      return (data.data || []) as Array<{ cliente: string; total_containers: number; total_demurrage: number }>;
    },
  });
}

export function useDemurrageArmadores() {
  return useQuery({
    queryKey: ['demurrage_armadores'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: { action: 'demurrage_get_unique_armadores' }
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to fetch armadores');
      return (data.data || []) as Array<{ armador: string; total_containers: number }>;
    },
  });
}
