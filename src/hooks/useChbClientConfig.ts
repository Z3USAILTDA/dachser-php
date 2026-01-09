import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ChbClientConfig {
  id: string;
  cliente_cnpj: string;
  cliente_nome: string | null;
  tolerancia_peso: number;
  tolerancia_valor: number;
  campos_obrigatorios: string[];
  regras_comparacao: Record<string, any>;
  instrucoes_personalizadas: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
  // Novos campos de armador e agente
  armador: string | null;
  agente_destino: string | null;
  contato_email: string | null;
  prazo_resposta_dias: number | null;
  porto_descarga_real: string | null;
  // Tolerâncias de taxas acessórias
  tolerancia_taxas_acessorias_abs: number | null;
  tolerancia_taxas_acessorias_pct: number | null;
  // Regras fiscais
  beneficio_fiscal: string | null;
  cfop_padrao: string | null;
  estado_uf: string | null;
  icms_diferido: boolean | null;
}

export interface ChbClientConfigInput {
  cliente_cnpj: string;
  cliente_nome?: string;
  tolerancia_peso?: number;
  tolerancia_valor?: number;
  campos_obrigatorios?: string[];
  regras_comparacao?: Record<string, any>;
  instrucoes_personalizadas?: string;
  ativo?: boolean;
  // Novos campos
  armador?: string;
  agente_destino?: string;
  contato_email?: string;
  prazo_resposta_dias?: number;
  porto_descarga_real?: string;
  tolerancia_taxas_acessorias_abs?: number;
  tolerancia_taxas_acessorias_pct?: number;
  beneficio_fiscal?: string;
  cfop_padrao?: string;
  estado_uf?: string;
  icms_diferido?: boolean;
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

export function useChbClientConfig() {
  const [configs, setConfigs] = useState<ChbClientConfig[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const response = await callMariaDB<{ success: boolean; data: ChbClientConfig[] }>('get_chb_client_configs');
      if (response.success) {
        setConfigs(response.data || []);
      }
    } catch (err) {
      console.error('Erro ao buscar configurações:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const getConfigByClient = useCallback(async (cnpj: string): Promise<ChbClientConfig | null> => {
    try {
      const response = await callMariaDB<{ success: boolean; data: ChbClientConfig | null }>('get_chb_client_config', { cnpj });
      return response.data;
    } catch (err) {
      console.error('Erro ao buscar config do cliente:', err);
      return null;
    }
  }, []);

  const createConfig = useCallback(async (config: ChbClientConfigInput): Promise<ChbClientConfig | null> => {
    try {
      const response = await callMariaDB<{ success: boolean; id: string }>('create_chb_client_config', config);
      if (response.success) {
        await fetchConfigs();
        // Return the created config
        return { ...config, id: response.id } as ChbClientConfig;
      }
      return null;
    } catch (err) {
      console.error('Erro ao criar configuração:', err);
      throw err;
    }
  }, [fetchConfigs]);

  const updateConfig = useCallback(async (id: string, config: Partial<ChbClientConfigInput>): Promise<void> => {
    try {
      await callMariaDB('update_chb_client_config', { id, ...config });
      await fetchConfigs();
    } catch (err) {
      console.error('Erro ao atualizar configuração:', err);
      throw err;
    }
  }, [fetchConfigs]);

  const deleteConfig = useCallback(async (id: string): Promise<void> => {
    try {
      await callMariaDB('delete_chb_client_config', { id });
      await fetchConfigs();
    } catch (err) {
      console.error('Erro ao deletar configuração:', err);
      throw err;
    }
  }, [fetchConfigs]);

  return {
    configs,
    loading,
    fetchConfigs,
    getConfigByClient,
    createConfig,
    updateConfig,
    deleteConfig
  };
}
