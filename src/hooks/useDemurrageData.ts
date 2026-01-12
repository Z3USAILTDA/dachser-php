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
  ft_source: string | null;
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
  cronos_status_list?: string[];
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
      // Build request body, only including non-empty values
      const body: Record<string, unknown> = {
        action: 'demurrage_get_containers',
      };
      
      if (filters?.search) body.search = filters.search;
      if (filters?.risk_status) body.risk_status = filters.risk_status;
      if (filters?.cronos_status) body.cronos_status = filters.cronos_status;
      if (filters?.cronos_status_list && filters.cronos_status_list.length > 0) {
        body.cronos_status_list = filters.cronos_status_list;
      }
      if (filters?.cliente) body.cliente = filters.cliente;
      if (filters?.armador) body.armador = filters.armador;
      if (filters?.pre_invoice_status) body.pre_invoice_status = filters.pre_invoice_status;
      if (filters?.dispute_status) body.dispute_status = filters.dispute_status;
      if (filters?.audit_status) body.audit_status = filters.audit_status;
      
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', { body });
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

export interface ContainerEvent {
  id: number;
  mbl_id: string;
  container: string;
  event_code: string;
  event_description: string | null;
  event_datetime: string | null;
  location: string | null;
  vessel_name: string | null;
  voyage: string | null;
  container_status: string | null;
  eta: string | null;
  source: string;
  created_at: string;
}

export function useDemurrageContainerEvents(containerNumber: string | null) {
  return useQuery({
    queryKey: ['demurrage_container_events', containerNumber],
    queryFn: async () => {
      if (!containerNumber) return [];

      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: {
          action: 'demurrage_get_container_events',
          container_number: containerNumber,
        }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to fetch container events');
      return (data.data || []) as ContainerEvent[];
    },
    enabled: !!containerNumber,
  });
}

// Pre-Invoice interfaces
export interface PreInvoice {
  id: number;
  invoice_number: string;
  shipment_mbl: string | null;
  client_name: string | null;
  bl_number: string | null;
  vessel_name: string | null;
  voyage_number: string | null;
  origin_port: string | null;
  destination_port: string | null;
  arrival_date: string | null;
  issue_date: string | null;
  due_date: string | null;
  total_usd: number;
  total_brl: number;
  exchange_rate: number;
  status: string;
  workflow_status: string;
  financial_status: string;
  posted_at: string | null;
  created_at: string;
  updated_at: string;
  items?: PreInvoiceItem[];
}

export interface PreInvoiceItem {
  id: number;
  pre_invoice_id: number;
  container_id: number;
  container_number: string;
  container_type: string | null;
  free_time_days: number | null;
  period_start_date: string | null;
  period_end_date: string | null;
  days_count: number;
  daily_rate_usd: number | null;
  total_usd: number;
  period_type: string | null;
  created_at: string;
}

export interface PreInvoiceFilters {
  status?: string;
  workflow_status?: string;
  client_name?: string;
}

export function useDemurragePreInvoices(filters?: PreInvoiceFilters) {
  return useQuery({
    queryKey: ['demurrage_pre_invoices', filters],
    queryFn: async () => {
      const body: Record<string, unknown> = {
        action: 'demurrage_get_pre_invoices',
      };
      
      if (filters?.status) body.status = filters.status;
      if (filters?.workflow_status) body.workflow_status = filters.workflow_status;
      if (filters?.client_name) body.client_name = filters.client_name;

      const { data, error } = await supabase.functions.invoke('mariadb-proxy', { body });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to fetch pre-invoices');
      return (data.data || []) as PreInvoice[];
    },
  });
}

export function useDemurragePreInvoiceItems(preInvoiceId: number | null) {
  return useQuery({
    queryKey: ['demurrage_pre_invoice_items', preInvoiceId],
    queryFn: async () => {
      if (!preInvoiceId) return [];

      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: {
          action: 'demurrage_get_pre_invoice_items',
          pre_invoice_id: preInvoiceId,
        }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to fetch pre-invoice items');
      return (data.data || []) as PreInvoiceItem[];
    },
    enabled: !!preInvoiceId,
  });
}

export function useUpdatePreInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ invoiceId, updates }: { invoiceId: number; updates: Record<string, unknown> }) => {
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: {
          action: 'demurrage_update_pre_invoice',
          invoice_id: invoiceId,
          updates,
        }
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to update pre-invoice');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demurrage_pre_invoices'] });
      queryClient.invalidateQueries({ queryKey: ['demurrage_containers'] });
    },
  });
}

export function useGeneratePreInvoices() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('demurrage-auto-invoice');
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demurrage_pre_invoices'] });
      queryClient.invalidateQueries({ queryKey: ['demurrage_containers'] });
    },
  });
}

// Bulk Update Containers
export function useBulkUpdateDemurrageContainers() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ containerIds, updates }: { containerIds: number[]; updates: Record<string, unknown> }) => {
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: {
          action: 'demurrage_bulk_update_containers',
          container_ids: containerIds,
          updates,
        }
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to bulk update containers');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demurrage_containers'] });
      queryClient.invalidateQueries({ queryKey: ['demurrage_stats'] });
    },
  });
}

// Create Demurrage Dispute
export interface CreateDisputeData {
  container_id: number;
  container_number?: string;
  client_name?: string;
  armador?: string;
  disputed_amount_usd: number;
  reason?: string;
  success_probability?: number;
  opened_by?: string;
}

export function useCreateDemurrageDispute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (disputeData: CreateDisputeData) => {
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: {
          action: 'demurrage_create_dispute',
          ...disputeData,
        }
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to create dispute');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demurrage_containers'] });
      queryClient.invalidateQueries({ queryKey: ['demurrage_disputes'] });
      queryClient.invalidateQueries({ queryKey: ['demurrage_stats'] });
    },
  });
}
