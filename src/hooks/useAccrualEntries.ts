import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface AccrualEntry {
  id: string;
  fornecedor: string;
  valor: number;
  shared_code: string | null;
  status_accrual: string;
  data_upload: string;
  uploaded_by_user_id: string | null;
  created_at: string;
}

export interface AccrualEntryInput {
  fornecedor: string;
  valor: number;
  shared_code?: string;
  status_accrual?: string;
  uploaded_by_user_id?: string;
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

export function useAccrualEntries() {
  const [entries, setEntries] = useState<AccrualEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchEntries = useCallback(async (search?: string) => {
    setLoading(true);
    try {
      const response = await callMariaDB<{ success: boolean; data: AccrualEntry[] }>('get_accrual_entries', { search });
      if (response.success) {
        setEntries(response.data || []);
      }
    } catch (err) {
      console.error('Erro ao buscar accruals:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const createEntry = useCallback(async (entry: AccrualEntryInput): Promise<string | null> => {
    try {
      const response = await callMariaDB<{ success: boolean; id: string }>('create_accrual_entry', entry);
      if (response.success) {
        await fetchEntries();
        return response.id;
      }
      return null;
    } catch (err) {
      console.error('Erro ao criar accrual:', err);
      throw err;
    }
  }, [fetchEntries]);

  const bulkCreate = useCallback(async (entriesData: Array<{ fornecedor: string; valor: number; shared_code?: string }>): Promise<number> => {
    try {
      const response = await callMariaDB<{ success: boolean; inserted: number }>('bulk_create_accrual', { entries: entriesData });
      if (response.success) {
        await fetchEntries();
        return response.inserted;
      }
      return 0;
    } catch (err) {
      console.error('Erro ao criar accruals em lote:', err);
      throw err;
    }
  }, [fetchEntries]);

  const deleteEntry = useCallback(async (id: string): Promise<void> => {
    try {
      await callMariaDB('delete_accrual_entry', { id });
      await fetchEntries();
    } catch (err) {
      console.error('Erro ao deletar accrual:', err);
      throw err;
    }
  }, [fetchEntries]);

  const clearAll = useCallback(async (): Promise<void> => {
    try {
      await callMariaDB('clear_accrual_entries');
      setEntries([]);
    } catch (err) {
      console.error('Erro ao limpar accruals:', err);
      throw err;
    }
  }, []);

  return {
    entries,
    loading,
    fetchEntries,
    createEntry,
    bulkCreate,
    deleteEntry,
    clearAll
  };
}
