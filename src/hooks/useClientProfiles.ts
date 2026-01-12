import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ClientProfile {
  id: number;
  cliente: string;
  auto_alert_enabled: boolean;
  alert_days_before: number;
  report_frequency: string;
  contact_emails: string[];
  created_at: string;
  updated_at: string;
}

export function useClientProfiles() {
  return useQuery({
    queryKey: ['demurrage_client_profiles'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: { action: 'demurrage_get_client_profiles' }
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to fetch client profiles');
      return (data.data || []) as ClientProfile[];
    },
  });
}

export function useCreateClientProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (profile: {
      cliente: string;
      auto_alert_enabled: boolean;
      alert_days_before: number;
      report_frequency: string;
      contact_emails: string[];
    }) => {
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: {
          action: 'demurrage_create_client_profile',
          ...profile,
        }
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to create client profile');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demurrage_client_profiles'] });
      queryClient.invalidateQueries({ queryKey: ['demurrage_containers'] });
    },
  });
}

export function useUpdateClientProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ cliente, ...updates }: {
      cliente: string;
      auto_alert_enabled?: boolean;
      alert_days_before?: number;
      report_frequency?: string;
      contact_emails?: string[];
    }) => {
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: {
          action: 'demurrage_update_client_profile',
          cliente,
          updates,
        }
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to update client profile');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demurrage_client_profiles'] });
      queryClient.invalidateQueries({ queryKey: ['demurrage_containers'] });
    },
  });
}

export function useDeleteClientProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (cliente: string) => {
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: {
          action: 'demurrage_delete_client_profile',
          cliente,
        }
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to delete client profile');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demurrage_client_profiles'] });
    },
  });
}
