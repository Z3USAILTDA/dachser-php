import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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

// Listar todas as configurações de Free Time (MariaDB)
export function useClientFreeTimeList() {
  return useQuery({
    queryKey: ['client-free-time'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('client-freetime-crud', {
        body: { action: 'list' }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      
      return (data.data || []) as ClientFreeTime[];
    },
  });
}

// Criar nova configuração de Free Time (MariaDB)
export function useCreateClientFreeTime() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (formData: CreateClientFreeTimeData) => {
      const { data, error } = await supabase.functions.invoke('client-freetime-crud', {
        body: { action: 'create', data: formData }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-free-time'] });
      toast({
        title: "Free Time cadastrado",
        description: "A configuração de Free Time foi salva com sucesso.",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao cadastrar",
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: "destructive",
      });
    },
  });
}

// Atualizar configuração de Free Time (MariaDB)
export function useUpdateClientFreeTime() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CreateClientFreeTimeData> }) => {
      const { data: result, error } = await supabase.functions.invoke('client-freetime-crud', {
        body: { action: 'update', id, data }
      });

      if (error) throw error;
      if (!result.success) throw new Error(result.error);
      
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-free-time'] });
      toast({
        title: "Free Time atualizado",
        description: "A configuração foi atualizada com sucesso.",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao atualizar",
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: "destructive",
      });
    },
  });
}

// Excluir configuração de Free Time - soft delete (MariaDB)
export function useDeleteClientFreeTime() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke('client-freetime-crud', {
        body: { action: 'delete', id }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-free-time'] });
      toast({
        title: "Free Time removido",
        description: "A configuração foi removida com sucesso.",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao remover",
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: "destructive",
      });
    },
  });
}

// Buscar Free Time aplicável para um cliente/MBL (MariaDB)
export function useFreeTimeForClient(clienteNome?: string, mbl?: string) {
  return useQuery({
    queryKey: ['client-free-time', 'applicable', clienteNome, mbl],
    queryFn: async () => {
      if (!clienteNome) return null;

      const { data, error } = await supabase.functions.invoke('client-freetime-crud', {
        body: { action: 'findForClient', clienteNome, mbl }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      
      if (data.data) {
        return { ...data.data, origem: data.data.tipo_ft } as ClientFreeTime & { origem: string };
      }
      
      return null;
    },
    enabled: !!clienteNome,
  });
}
