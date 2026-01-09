import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SlaConfig {
  id: string;
  etapa: string;
  horas_limite: number;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

// Helper function to call MariaDB proxy
async function callMariaDB<T>(action: string, params: Record<string, any> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
    body: { action, ...params }
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export function useSlaConfig() {
  const [configs, setConfigs] = useState<SlaConfig[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const response = await callMariaDB<{ success: boolean; data: SlaConfig[] }>('get_sla_configs');
      if (response.success) {
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
      await callMariaDB('update_sla_config', { id, ...updates });
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
