import { useState, useCallback } from 'react';

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

async function finApi<T>(path: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(path, options);
  const data = await resp.json();
  if (!resp.ok || data?.error) throw new Error(data?.error || `HTTP ${resp.status}`);
  return data;
}

export function useAccrualEntries() {
  const [entries, setEntries] = useState<AccrualEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchEntries = useCallback(async (search?: string) => {
    setLoading(true);
    try {
      const qs = search ? `?search=${encodeURIComponent(search)}` : '';
      const response = await finApi<{ success: boolean; data: AccrualEntry[] }>(`/api/fin/accrual${qs}`);
      if (response.success) setEntries(response.data || []);
    } catch (err) {
      console.error('Erro ao buscar accruals:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const createEntry = useCallback(async (entry: AccrualEntryInput): Promise<string | null> => {
    try {
      const response = await finApi<{ success: boolean; id: string }>('/api/fin/accrual', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry),
      });
      if (response.success) { await fetchEntries(); return response.id; }
      return null;
    } catch (err) {
      console.error('Erro ao criar accrual:', err);
      throw err;
    }
  }, [fetchEntries]);

  const bulkCreate = useCallback(async (entriesData: Array<{ fornecedor: string; valor: number; shared_code?: string }>): Promise<number> => {
    try {
      const response = await finApi<{ success: boolean; inserted: number }>('/api/fin/accrual/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entries: entriesData }),
      });
      if (response.success) { await fetchEntries(); return response.inserted; }
      return 0;
    } catch (err) {
      console.error('Erro ao criar accruals em lote:', err);
      throw err;
    }
  }, [fetchEntries]);

  const deleteEntry = useCallback(async (id: string): Promise<void> => {
    try {
      await finApi(`/api/fin/accrual/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await fetchEntries();
    } catch (err) {
      console.error('Erro ao deletar accrual:', err);
      throw err;
    }
  }, [fetchEntries]);

  const clearAll = useCallback(async (): Promise<void> => {
    try {
      await finApi('/api/fin/accrual/all', { method: 'DELETE' });
      setEntries([]);
    } catch (err) {
      console.error('Erro ao limpar accruals:', err);
      throw err;
    }
  }, []);

  return { entries, loading, fetchEntries, createEntry, bulkCreate, deleteEntry, clearAll };
}
