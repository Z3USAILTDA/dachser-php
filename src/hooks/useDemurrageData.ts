import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

export interface DemurrageContainer {
  id: string;
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

export function useDemurrageData(filters?: DemurrageFilters) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['t_demurrage_containers', filters],
    queryFn: async () => {
      let q = supabase
        .from('t_demurrage_containers')
        .select('*')
        .eq('active', true);

      // Apply filters
      if (filters?.search) {
        q = q.or(`numero.ilike.%${filters.search}%,mbl.ilike.%${filters.search}%,cliente.ilike.%${filters.search}%,armador.ilike.%${filters.search}%`);
      }
      if (filters?.risk_status && filters.risk_status !== 'all') {
        q = q.eq('risk_status', filters.risk_status);
      }
      if (filters?.cronos_status && filters.cronos_status !== 'all') {
        q = q.eq('cronos_status', filters.cronos_status);
      }
      if (filters?.cliente) {
        q = q.eq('cliente', filters.cliente);
      }
      if (filters?.armador) {
        q = q.eq('armador', filters.armador);
      }
      if (filters?.pre_invoice_status && filters.pre_invoice_status !== 'all') {
        q = q.eq('pre_invoice_status', filters.pre_invoice_status);
      }
      if (filters?.dispute_status && filters.dispute_status !== 'all') {
        q = q.eq('dispute_status', filters.dispute_status);
      }
      if (filters?.audit_status && filters.audit_status !== 'all') {
        q = q.eq('audit_status', filters.audit_status);
      }

      const { data, error } = await q.order('updated_at', { ascending: false });

      if (error) throw error;
      return (data || []) as DemurrageContainer[];
    },
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('t_demurrage_containers_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 't_demurrage_containers',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['t_demurrage_containers'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

export function useDemurrageStats() {
  return useQuery({
    queryKey: ['t_demurrage_containers_stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('t_demurrage_containers')
        .select('cronos_status, risk_status, expected_cost_usd')
        .eq('active', true);

      if (error) throw error;

      const containers = data || [];
      
      const stats: DemurrageStats = {
        total: containers.length,
        inTransit: containers.filter(c => 
          ['IN_TRANSIT', 'ARRIVED', 'PENDING'].includes(c.cronos_status)
        ).length,
        atRisk: containers.filter(c => 
          ['at_risk', 'critical', 'exceeded'].includes(c.risk_status)
        ).length,
        delivered: containers.filter(c => 
          ['GATE_OUT', 'RETURNED'].includes(c.cronos_status)
        ).length,
        totalDemurrageUsd: containers.reduce((sum, c) => sum + (c.expected_cost_usd || 0), 0),
      };

      return stats;
    },
  });
}

export function useDemurrageRates() {
  return useQuery({
    queryKey: ['t_demurrage_rates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('t_demurrage_rates')
        .select('*')
        .eq('active', true)
        .order('armador', { ascending: true });

      if (error) throw error;
      return data || [];
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
      const { data, error } = await supabase
        .from('t_demurrage_rates')
        .insert(rate)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['t_demurrage_rates'] });
    },
  });
}

export function useUpdateDemurrageRate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<{
      armador: string;
      container_type: string;
      free_time_days: number;
      rate_usd: number;
      period_type: string;
      period_start_day: number;
      period_end_day: number;
      active: boolean;
    }>) => {
      const { data, error } = await supabase
        .from('t_demurrage_rates')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['t_demurrage_rates'] });
    },
  });
}

export function useDeleteDemurrageRate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('t_demurrage_rates')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['t_demurrage_rates'] });
    },
  });
}

export function useDemurrageSettings() {
  return useQuery({
    queryKey: ['t_demurrage_settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('t_demurrage_settings')
        .select('*');

      if (error) throw error;

      const settings: Record<string, string> = {};
      (data || []).forEach((s: { key: string; value: string }) => {
        settings[s.key] = s.value;
      });

      return settings;
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
      queryClient.invalidateQueries({ queryKey: ['t_demurrage_containers'] });
      queryClient.invalidateQueries({ queryKey: ['t_demurrage_containers_stats'] });
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
      queryClient.invalidateQueries({ queryKey: ['t_demurrage_containers'] });
      queryClient.invalidateQueries({ queryKey: ['t_demurrage_containers_stats'] });
    },
  });
}
