import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

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

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Request failed');
  return data;
}

export function useClientProfiles() {
  return useQuery({
    queryKey: ['demurrage_client_profiles'],
    queryFn: async () => {
      const data = await apiFetch('/api/demurrage/client-profiles');
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
      const data = await apiFetch('/api/demurrage/client-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
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
      const data = await apiFetch(`/api/demurrage/client-profiles/${encodeURIComponent(cliente)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
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
      const data = await apiFetch(`/api/demurrage/client-profiles/${encodeURIComponent(cliente)}`, {
        method: 'DELETE',
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demurrage_client_profiles'] });
    },
  });
}
