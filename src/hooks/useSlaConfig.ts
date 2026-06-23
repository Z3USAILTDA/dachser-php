import { useState, useCallback } from 'react';
import { apiGet, apiPatch } from '@/services/apiClient';

export interface SlaConfig {
  id: string;
  etapa: string;
  horas_limite: number;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export function useSlaConfig() {
  const [configs, setConfigs] = useState<SlaConfig[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiGet('/api/admin/sla-config');
      if (response?.success) {
        setConfigs(response.data || []);
      }
    } catch (err) {
      console.error('Erro ao buscar configurações de SLA:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const updateConfig = useCallback(async (id: string, updates: { horas_limite?: number; ativo?: boolean }): Promise<void> => {
    try {
      await apiPatch(`/api/admin/sla-config/${id}`, updates);
      await fetchConfigs();
    } catch (err) {
      console.error('Erro ao atualizar configuração de SLA:', err);
      throw err;
    }
  }, [fetchConfigs]);

  return {
    configs,
    loading,
    fetchConfigs,
    updateConfig
  };
}
