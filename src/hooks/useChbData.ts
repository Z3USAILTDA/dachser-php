import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ChbItem {
  id: number;
  reference: string;
  consignee: string;
  status_macro: 'pre_alerta_pendente' | 'instrucao_pendente' | 'di_pendente' | 'concluida';
  step1_status: string;
  step2_status: string;
  step3_status: string;
  active: number;
  created_at: string | null;
  created_by: number | null;
  last_run_at: string | null;
}

export interface ChbFile {
  id: number;
  filename: string;
  mime: string | null;
  size_bytes: number | null;
  sha256: string | null;
  rel_path: string | null;
  url: string | null;
  created_at: string;
  created_by: number | null;
  etapa: '1' | '2' | '3';
  doc_role: string;
  doc_active: number;
}

export interface ChbRun {
  id: number;
  item_id: number;
  etapa: '1' | '2' | '3';
  status: string;
  result_text: string | null;
  result_html: string | null;
  result_json: string | null;
  used_as_ctx: number;
  created_at: string;
}

async function callMariaDB<T>(action: string, params: Record<string, any> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
    body: { action, ...params },
  });
  
  if (error) {
    throw new Error(error.message);
  }
  
  return data as T;
}

export function useChbItems() {
  const [items, setItems] = useState<ChbItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const response = await callMariaDB<{ success: boolean; data: ChbItem[] }>('get_chb_items');
      setItems(response.data || []);
    } catch (error) {
      console.error('Error fetching CHB items:', error);
      toast.error('Erro ao carregar processos');
    } finally {
      setLoading(false);
    }
  }, []);

  const createItem = useCallback(async (reference: string, consignee: string): Promise<number | null> => {
    try {
      const userId = localStorage.getItem('user_id');
      const response = await callMariaDB<{ success: boolean; id: number }>('create_chb_item', {
        reference,
        consignee,
        userId: userId ? parseInt(userId) : null,
      });
      toast.success('Processo criado com sucesso!');
      return response.id;
    } catch (error) {
      console.error('Error creating CHB item:', error);
      toast.error('Erro ao criar processo');
      return null;
    }
  }, []);

  const updateItem = useCallback(async (
    id: number, 
    updates: Partial<Pick<ChbItem, 'status_macro' | 'step1_status' | 'step2_status' | 'step3_status'>>
  ) => {
    try {
      await callMariaDB('update_chb_item', { id, ...updates });
      setItems(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
    } catch (error) {
      console.error('Error updating CHB item:', error);
      toast.error('Erro ao atualizar processo');
    }
  }, []);

  const deleteItem = useCallback(async (id: number) => {
    try {
      await callMariaDB('delete_chb_item', { id });
      setItems(prev => prev.filter(item => item.id !== id));
      toast.success('Processo removido com sucesso');
    } catch (error) {
      console.error('Error deleting CHB item:', error);
      toast.error('Erro ao remover processo');
    }
  }, []);

  return { items, loading, fetchItems, createItem, updateItem, deleteItem };
}

export function useChbFiles(itemId: number | null) {
  const [files, setFiles] = useState<ChbFile[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchFiles = useCallback(async () => {
    if (!itemId) return;
    setLoading(true);
    try {
      const response = await callMariaDB<{ success: boolean; data: ChbFile[] }>('get_chb_files', { itemId });
      setFiles(response.data || []);
    } catch (error) {
      console.error('Error fetching CHB files:', error);
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  const createFile = useCallback(async (
    filename: string,
    etapa: '1' | '2' | '3',
    docRole: string,
    options?: { mime?: string; sizeBytes?: number; url?: string }
  ): Promise<number | null> => {
    if (!itemId) return null;
    try {
      const userId = localStorage.getItem('user_id');
      const response = await callMariaDB<{ success: boolean; fileId: number }>('create_chb_file', {
        itemId,
        filename,
        etapa,
        docRole,
        mime: options?.mime,
        sizeBytes: options?.sizeBytes,
        url: options?.url,
        userId: userId ? parseInt(userId) : null,
      });
      return response.fileId;
    } catch (error) {
      console.error('Error creating CHB file:', error);
      toast.error('Erro ao salvar arquivo');
      return null;
    }
  }, [itemId]);

  const deleteFile = useCallback(async (fileId: number) => {
    if (!itemId) return;
    try {
      await callMariaDB('delete_chb_doc', { fileId, itemId });
      setFiles(prev => prev.filter(f => f.id !== fileId));
      toast.success('Documento removido');
    } catch (error) {
      console.error('Error deleting CHB file:', error);
      toast.error('Erro ao remover documento');
    }
  }, [itemId]);

  return { files, loading, fetchFiles, createFile, deleteFile };
}

export function useChbRuns(itemId: number | null) {
  const [runs, setRuns] = useState<ChbRun[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchRuns = useCallback(async (etapa?: '1' | '2' | '3') => {
    if (!itemId) return;
    setLoading(true);
    try {
      const response = await callMariaDB<{ success: boolean; data: ChbRun[] }>('get_chb_runs', { 
        itemId, 
        etapa 
      });
      setRuns(response.data || []);
    } catch (error) {
      console.error('Error fetching CHB runs:', error);
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  const createRun = useCallback(async (
    etapa: '1' | '2' | '3',
    status: string,
    resultText: string,
    resultHtml: string,
    resultJson?: object
  ): Promise<number | null> => {
    if (!itemId) return null;
    try {
      const response = await callMariaDB<{ success: boolean; runId: number }>('create_chb_run', {
        itemId,
        etapa,
        status,
        resultText,
        resultHtml,
        resultJson: resultJson ? JSON.stringify(resultJson) : null,
        usedAsCtx: false,
      });
      await fetchRuns();
      return response.runId;
    } catch (error) {
      console.error('Error creating CHB run:', error);
      toast.error('Erro ao salvar resultado da análise');
      return null;
    }
  }, [itemId, fetchRuns]);

  return { runs, loading, fetchRuns, createRun };
}
