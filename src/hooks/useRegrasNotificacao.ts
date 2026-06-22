import { useState, useCallback } from 'react';
import { CCTRegraNotificacao } from '@/types/cct';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/services/apiClient';
import { toast } from 'sonner';

export function useRegrasNotificacao() {
  const [regras, setRegras] = useState<CCTRegraNotificacao[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchRegras = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet('/api/cct/regras-notificacao');
      const parsed = (data?.data || []).map((r: any) => ({
        ...r,
        aeroportos: typeof r.aeroportos === 'string' ? JSON.parse(r.aeroportos) : (r.aeroportos || []),
        eventos_disparo: typeof r.eventos_disparo === 'string' ? JSON.parse(r.eventos_disparo) : (r.eventos_disparo || []),
        canais: typeof r.canais === 'string' ? JSON.parse(r.canais) : (r.canais || []),
      }));
      setRegras(parsed);
    } catch (err) {
      console.error('Erro ao buscar regras:', err);
      toast.error('Erro ao carregar regras de notificação');
    } finally {
      setLoading(false);
    }
  }, []);

  const createRegra = useCallback(async (regra: Omit<CCTRegraNotificacao, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      await apiPost('/api/cct/regras-notificacao', {
        ...regra,
        aeroportos: JSON.stringify(regra.aeroportos),
        eventos_disparo: JSON.stringify(regra.eventos_disparo),
        canais: JSON.stringify(regra.canais),
      });
      toast.success('Regra criada com sucesso');
      await fetchRegras();
      return true;
    } catch (err) {
      console.error('Erro ao criar regra:', err);
      toast.error('Erro ao criar regra');
      return false;
    }
  }, [fetchRegras]);

  const updateRegra = useCallback(async (id: string, regra: Partial<CCTRegraNotificacao>) => {
    try {
      const payload: any = {};
      if (regra.cliente_nome !== undefined) payload.cliente_nome = regra.cliente_nome;
      if (regra.cnpj_consignatario !== undefined) payload.cnpj_consignatario = regra.cnpj_consignatario;
      if (regra.aeroportos !== undefined) payload.aeroportos = JSON.stringify(regra.aeroportos);
      if (regra.eventos_disparo !== undefined) payload.eventos_disparo = JSON.stringify(regra.eventos_disparo);
      if (regra.canais !== undefined) payload.canais = JSON.stringify(regra.canais);
      if (regra.template_id !== undefined) payload.template_id = regra.template_id;
      if (regra.ativo !== undefined) payload.ativo = regra.ativo;
      await apiPatch(`/api/cct/regras-notificacao/${id}`, payload);
      toast.success('Regra atualizada com sucesso');
      await fetchRegras();
      return true;
    } catch (err) {
      console.error('Erro ao atualizar regra:', err);
      toast.error('Erro ao atualizar regra');
      return false;
    }
  }, [fetchRegras]);

  const deleteRegra = useCallback(async (id: string) => {
    try {
      await apiDelete(`/api/cct/regras-notificacao/${id}`);
      toast.success('Regra excluída com sucesso');
      await fetchRegras();
      return true;
    } catch (err) {
      console.error('Erro ao excluir regra:', err);
      toast.error('Erro ao excluir regra');
      return false;
    }
  }, [fetchRegras]);

  const toggleAtivo = useCallback(async (id: string, ativo: boolean) => {
    return updateRegra(id, { ativo });
  }, [updateRegra]);

  return { regras, loading, fetchRegras, createRegra, updateRegra, deleteRegra, toggleAtivo };
}
