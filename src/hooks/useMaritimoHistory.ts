import { useState } from "react";
import { maritimoApi, HistoryRun, HistoryResponse } from "@/services/maritimoApi";
import { toast } from "sonner";

export interface HistoryItem {
  id: string;
  base_file_name: string;
  consignee: string | null;
  container: string | null;
  status: string;
  analysis_type: string;
  created_at: string;
  updated_at: string;
}

export interface HistoryData {
  item: HistoryItem;
  runs: HistoryRun[];
}

export type { HistoryRun };

export const useMaritimoHistory = () => {
  const [history, setHistory] = useState<HistoryData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = async (itemId: string) => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await maritimoApi.getHistory(itemId);
      setHistory({
        item: data.item || { 
          id: itemId,
          base_file_name: '',
          consignee: null,
          container: null,
          status: 'pendente',
          analysis_type: 'manifest_hbl',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        runs: data.runs || []
      });
    } catch (err: any) {
      console.error('Error fetching history:', err);
      setError(err.message || 'Failed to load history');
      toast.error('Erro ao carregar histórico');
      setHistory(null);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    history,
    isLoading,
    error,
    fetchHistory,
  };
};
