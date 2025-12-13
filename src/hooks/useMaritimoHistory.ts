import { useState, useCallback } from "react";
import { maritimoApi } from "@/services/maritimoApi";

interface HistoryRun {
  id: string;
  status: string;
  result_text?: string;
  result_html?: string;
  json_result?: any;
  created_at: string;
  updated_at?: string;
  created_by_email?: string;
  files?: {
    id: string;
    file_name: string;
    file_type: string;
    role: string;
  }[];
}

interface HistoryData {
  item: {
    base_file_name: string;
  };
  runs: HistoryRun[];
}

export function useMaritimoHistory() {
  const [history, setHistory] = useState<HistoryData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchHistory = useCallback(async (itemId: string) => {
    setIsLoading(true);
    try {
      const data = await maritimoApi.getHistory(itemId);
      setHistory({
        item: data.item || { base_file_name: '' },
        runs: data.runs || [],
      });
    } catch (error) {
      console.error("Error fetching SEA history:", error);
      setHistory({ item: { base_file_name: '' }, runs: [] });
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    history,
    isLoading,
    fetchHistory,
  };
}
