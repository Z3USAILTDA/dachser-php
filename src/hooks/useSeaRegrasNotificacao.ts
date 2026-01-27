import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SeaRegraNotificacao } from '@/types/sea';
import { toast } from 'sonner';

export function useSeaRegrasNotificacao() {
  const [regras, setRegras] = useState<SeaRegraNotificacao[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchRegras = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('olimpo-proxy', {
        body: { action: 'get_sea_regras_notificacao' }
      });

      if (error) throw error;
      
      // Parse arrays from JSON strings if needed
      const parsed = (data?.data || []).map((r: any) => ({
        ...r,
        portos_origem: typeof r.portos_origem === 'string' ? JSON.parse(r.portos_origem || '[]') : (r.portos_origem || []),
        portos_destino: typeof r.portos_destino === 'string' ? JSON.parse(r.portos_destino || '[]') : (r.portos_destino || []),
        portos: typeof r.portos === 'string' ? JSON.parse(r.portos || '[]') : (r.portos || []),
        eventos_disparo: typeof r.eventos_disparo === 'string' ? JSON.parse(r.eventos_disparo || '[]') : (r.eventos_disparo || []),
        canais: typeof r.canais === 'string' ? JSON.parse(r.canais || '[]') : (r.canais || []),
        is_default: !!r.is_default,
      }));
      
      setRegras(parsed);
    } catch (err) {
      console.error('Erro ao buscar regras marítimas:', err);
      toast.error('Erro ao carregar regras de notificação marítima');
    } finally {
      setLoading(false);
    }
  }, []);

  const createRegra = useCallback(async (regra: Omit<SeaRegraNotificacao, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      const { error } = await supabase.functions.invoke('olimpo-proxy', {
        body: { 
          action: 'create_sea_regra_notificacao',
          ...regra,
          portos_origem: JSON.stringify(regra.portos_origem),
          portos_destino: JSON.stringify(regra.portos_destino),
          eventos_disparo: JSON.stringify(regra.eventos_disparo),
          canais: JSON.stringify(regra.canais),
          is_default: regra.is_default,
        }
      });

      if (error) throw error;
      toast.success('Regra marítima criada com sucesso');
      await fetchRegras();
      return true;
    } catch (err) {
      console.error('Erro ao criar regra marítima:', err);
      toast.error('Erro ao criar regra');
      return false;
    }
  }, [fetchRegras]);

  const updateRegra = useCallback(async (id: string, regra: Partial<SeaRegraNotificacao>) => {
    try {
      const payload: any = { action: 'update_sea_regra_notificacao', id };
      
      if (regra.cliente_nome !== undefined) payload.cliente_nome = regra.cliente_nome;
      if (regra.cnpj_consignatario !== undefined) payload.cnpj_consignatario = regra.cnpj_consignatario;
      if (regra.tipo_processo !== undefined) payload.tipo_processo = regra.tipo_processo;
      if (regra.portos_origem !== undefined) payload.portos_origem = JSON.stringify(regra.portos_origem);
      if (regra.portos_destino !== undefined) payload.portos_destino = JSON.stringify(regra.portos_destino);
      if (regra.eventos_disparo !== undefined) payload.eventos_disparo = JSON.stringify(regra.eventos_disparo);
      if (regra.frequencia !== undefined) payload.frequencia = regra.frequencia;
      if (regra.canais !== undefined) payload.canais = JSON.stringify(regra.canais);
      if (regra.emails_import !== undefined) payload.emails_import = regra.emails_import;
      if (regra.emails_export !== undefined) payload.emails_export = regra.emails_export;
      if (regra.template_id !== undefined) payload.template_id = regra.template_id;
      if (regra.ativo !== undefined) payload.ativo = regra.ativo;
      if (regra.is_default !== undefined) payload.is_default = regra.is_default;

      const { error } = await supabase.functions.invoke('olimpo-proxy', {
        body: payload
      });

      if (error) throw error;
      toast.success('Regra marítima atualizada com sucesso');
      await fetchRegras();
      return true;
    } catch (err) {
      console.error('Erro ao atualizar regra marítima:', err);
      toast.error('Erro ao atualizar regra');
      return false;
    }
  }, [fetchRegras]);

  const deleteRegra = useCallback(async (id: string) => {
    try {
      const { error } = await supabase.functions.invoke('olimpo-proxy', {
        body: { action: 'delete_sea_regra_notificacao', id }
      });

      if (error) throw error;
      toast.success('Regra marítima excluída com sucesso');
      await fetchRegras();
      return true;
    } catch (err) {
      console.error('Erro ao excluir regra marítima:', err);
      toast.error('Erro ao excluir regra');
      return false;
    }
  }, [fetchRegras]);

  const toggleAtivo = useCallback(async (id: string, ativo: boolean) => {
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
