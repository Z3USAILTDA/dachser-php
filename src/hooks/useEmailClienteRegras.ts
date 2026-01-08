import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { EmailClienteRegra } from '@/types/air';
import { toast } from 'sonner';

export function useEmailClienteRegras() {
  const [regras, setRegras] = useState<EmailClienteRegra[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchRegras = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: { action: 'get_email_cliente_regras' }
      });

      if (error) throw error;
      
      // Parse arrays from JSON strings if needed
      const parsed = (data?.data || []).map((r: any) => ({
        ...r,
        aeroportos: typeof r.aeroportos === 'string' ? JSON.parse(r.aeroportos) : (r.aeroportos || []),
        eventos_disparo: typeof r.eventos_disparo === 'string' ? JSON.parse(r.eventos_disparo) : (r.eventos_disparo || []),
      }));
      
      setRegras(parsed);
    } catch (err) {
      console.error('Erro ao buscar regras de e-mail:', err);
      toast.error('Erro ao carregar regras de notificação');
    } finally {
      setLoading(false);
    }
  }, []);

  const createRegra = useCallback(async (regra: Omit<EmailClienteRegra, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      const { error } = await supabase.functions.invoke('mariadb-proxy', {
        body: { 
          action: 'create_email_cliente_regra',
          ...regra,
          aeroportos: JSON.stringify(regra.aeroportos),
          eventos_disparo: JSON.stringify(regra.eventos_disparo),
        }
      });

      if (error) throw error;
      toast.success('Regra criada com sucesso');
      await fetchRegras();
      return true;
    } catch (err) {
      console.error('Erro ao criar regra:', err);
      toast.error('Erro ao criar regra');
      return false;
    }
  }, [fetchRegras]);

  const updateRegra = useCallback(async (id: string | number, regra: Partial<EmailClienteRegra>) => {
    try {
      const payload: any = { action: 'update_email_cliente_regra', id };
      
      if (regra.cliente_nome !== undefined) payload.cliente_nome = regra.cliente_nome;
      if (regra.cnpj_consignatario !== undefined) payload.cnpj_consignatario = regra.cnpj_consignatario;
      if (regra.email_cliente !== undefined) payload.email_cliente = regra.email_cliente;
      if (regra.aeroportos !== undefined) payload.aeroportos = JSON.stringify(regra.aeroportos);
      if (regra.eventos_disparo !== undefined) payload.eventos_disparo = JSON.stringify(regra.eventos_disparo);
      if (regra.ativo !== undefined) payload.ativo = regra.ativo;

      const { error } = await supabase.functions.invoke('mariadb-proxy', {
        body: payload
      });

      if (error) throw error;
      toast.success('Regra atualizada com sucesso');
      await fetchRegras();
      return true;
    } catch (err) {
      console.error('Erro ao atualizar regra:', err);
      toast.error('Erro ao atualizar regra');
      return false;
    }
  }, [fetchRegras]);

  const deleteRegra = useCallback(async (id: string | number) => {
    try {
      const { error } = await supabase.functions.invoke('mariadb-proxy', {
        body: { action: 'delete_email_cliente_regra', id }
      });

      if (error) throw error;
      toast.success('Regra excluída com sucesso');
      await fetchRegras();
      return true;
    } catch (err) {
      console.error('Erro ao excluir regra:', err);
      toast.error('Erro ao excluir regra');
      return false;
    }
  }, [fetchRegras]);

  const toggleAtivo = useCallback(async (id: string | number, ativo: boolean) => {
    return updateRegra(id, { ativo });
  }, [updateRegra]);

  return {
    regras,
    loading,
    fetchRegras,
    createRegra,
    updateRegra,
    deleteRegra,
    toggleAtivo,
  };
}
