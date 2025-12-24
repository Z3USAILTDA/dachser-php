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
}

export function useChbClientConfig() {
  const [configs, setConfigs] = useState<ChbClientConfig[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('chb_client_config')
        .select('*')
        .order('cliente_nome', { ascending: true });

      if (error) throw error;
      setConfigs((data as ChbClientConfig[]) || []);
    } catch (err) {
      console.error('Erro ao buscar configurações:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const getConfigByClient = useCallback(async (cnpj: string): Promise<ChbClientConfig | null> => {
    try {
      const { data, error } = await supabase
        .from('chb_client_config')
        .select('*')
        .eq('cliente_cnpj', cnpj)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null; // Not found
        throw error;
      }
      return data as ChbClientConfig;
    } catch (err) {
      console.error('Erro ao buscar config do cliente:', err);
      return null;
    }
  }, []);

  const createConfig = useCallback(async (config: ChbClientConfigInput): Promise<ChbClientConfig | null> => {
    try {
      const { data, error } = await supabase
        .from('chb_client_config')
        .insert(config)
        .select()
        .single();

      if (error) throw error;
      await fetchConfigs();
      return data as ChbClientConfig;
    } catch (err) {
      console.error('Erro ao criar configuração:', err);
      throw err;
    }
  }, [fetchConfigs]);

  const updateConfig = useCallback(async (id: string, config: Partial<ChbClientConfigInput>): Promise<void> => {
    try {
      const { error } = await supabase
        .from('chb_client_config')
        .update(config)
        .eq('id', id);

      if (error) throw error;
      await fetchConfigs();
    } catch (err) {
      console.error('Erro ao atualizar configuração:', err);
      throw err;
    }
  }, [fetchConfigs]);

  const deleteConfig = useCallback(async (id: string): Promise<void> => {
    try {
      const { error } = await supabase
        .from('chb_client_config')
        .delete()
        .eq('id', id);

      if (error) throw error;
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
