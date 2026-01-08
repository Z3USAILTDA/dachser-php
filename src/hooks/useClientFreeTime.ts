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

// Listar todas as configurações de Free Time
export function useClientFreeTimeList() {
  return useQuery({
    queryKey: ['client-free-time'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('t_client_free_time' as any)
        .select('*')
        .eq('ativo', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as ClientFreeTime[];
    },
  });
}

// Criar nova configuração de Free Time
export function useCreateClientFreeTime() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateClientFreeTimeData) => {
      const { data: result, error } = await supabase
        .from('t_client_free_time' as any)
        .insert({
          ...data,
          ativo: true,
        })
        .select()
        .single();

      if (error) throw error;
      return result as unknown as ClientFreeTime;
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
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

// Atualizar configuração de Free Time
export function useUpdateClientFreeTime() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CreateClientFreeTimeData> }) => {
      const { data: result, error } = await supabase
        .from('t_client_free_time' as any)
        .update({
          ...data,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return result as unknown as ClientFreeTime;
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
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

// Excluir configuração de Free Time (soft delete)
export function useDeleteClientFreeTime() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('t_client_free_time' as any)
        .update({ ativo: false, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
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
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

// Buscar Free Time aplicável para um cliente/MBL
export function useFreeTimeForClient(clienteNome?: string, mbl?: string) {
  return useQuery({
    queryKey: ['client-free-time', 'applicable', clienteNome, mbl],
    queryFn: async () => {
      if (!clienteNome) return null;

      const today = new Date().toISOString().split('T')[0];

      // Primeiro, tentar encontrar FT por processo (MBL específico)
      if (mbl) {
        const { data: processoFT } = await supabase
          .from('t_client_free_time' as any)
          .select('*')
          .eq('ativo', true)
          .eq('tipo_ft', 'PROCESSO')
          .eq('mbl', mbl)
          .single();

        if (processoFT) {
          const ftData = processoFT as unknown as ClientFreeTime;
          return { ...ftData, origem: 'PROCESSO' };
        }
      }

      // Segundo, buscar FT por contrato (cliente + vigência ativa)
      const { data: contratoFT } = await supabase
        .from('t_client_free_time' as any)
        .select('*')
        .eq('ativo', true)
        .eq('tipo_ft', 'CONTRATO')
        .ilike('cliente_nome', `%${clienteNome}%`)
        .lte('vigencia_inicio', today)
        .gte('vigencia_fim', today)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (contratoFT) {
        const ftData = contratoFT as unknown as ClientFreeTime;
        return { ...ftData, origem: 'CONTRATO' };
      }

      return null;
    },
    enabled: !!clienteNome,
  });
}
