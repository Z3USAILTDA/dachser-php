import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!data.success) {
    const err = new Error(data.error || 'Request failed') as any;
    err.retryable = data.retryable;
    throw err;
  }
  return data;
}

export interface ClientFreeTime {
  id: string;
  cliente_cnpj: string | null;
  cliente_nome: string;
  tipo_ft: 'CONTRATO' | 'PROCESSO';
  vigencia_inicio: string | null;
  vigencia_fim: string | null;
  mbl: string | null;
  free_time_days: number;
  armador: string | null;
  notas: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface CreateClientFreeTimeData {
  cliente_cnpj?: string;
  cliente_nome: string;
  tipo_ft: 'CONTRATO' | 'PROCESSO';
  vigencia_inicio?: string;
  vigencia_fim?: string;
  mbl?: string;
  free_time_days: number;
  armador?: string;
  notas?: string;
}

export function useClientFreeTimeList() {
  return useQuery({
    queryKey: ['client-free-time'],
    queryFn: async () => {
      const data = await apiFetch('/api/freetime');
      return (data.data || []) as ClientFreeTime[];
    },
    retry: 1,
    retryDelay: 3000,
    staleTime: 10000,
  });
}

export function useCreateClientFreeTime() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (formData: CreateClientFreeTimeData) => {
      return await apiFetch('/api/freetime', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-free-time'] });
      toast({ title: "Free Time cadastrado", description: "A configuração de Free Time foi salva com sucesso." });
    },
    onError: (error) => {
      toast({ title: "Erro ao cadastrar", description: error instanceof Error ? error.message : 'Erro desconhecido', variant: "destructive" });
    },
  });
}

export function useUpdateClientFreeTime() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CreateClientFreeTimeData> }) => {
      return await apiFetch(`/api/freetime/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-free-time'] });
      toast({ title: "Free Time atualizado", description: "A configuração foi atualizada com sucesso." });
    },
    onError: (error) => {
      toast({ title: "Erro ao atualizar", description: error instanceof Error ? error.message : 'Erro desconhecido', variant: "destructive" });
    },
  });
}

export function useDeleteClientFreeTime() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      return await apiFetch(`/api/freetime/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-free-time'] });
      toast({ title: "Free Time removido", description: "A configuração foi removida com sucesso." });
    },
    onError: (error) => {
      toast({ title: "Erro ao remover", description: error instanceof Error ? error.message : 'Erro desconhecido', variant: "destructive" });
    },
  });
}

export function useFreeTimeForClient(clienteNome?: string, mbl?: string) {
  return useQuery({
    queryKey: ['client-free-time', 'applicable', clienteNome, mbl],
    queryFn: async () => {
      if (!clienteNome) return null;
      const params = new URLSearchParams();
      if (clienteNome) params.set('cliente_nome', clienteNome);
      if (mbl) params.set('mbl', mbl);
      const data = await apiFetch(`/api/freetime/for-client?${params}`);
      if (data.data) return { ...data.data, origem: data.data.tipo_ft } as ClientFreeTime & { origem: string };
      return null;
    },
    enabled: !!clienteNome,
  });
}
