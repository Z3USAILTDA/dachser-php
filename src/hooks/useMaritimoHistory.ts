import { useState, useCallback } from "react";
import { maritimoApi, HistoryRun } from "@/services/maritimoApi";

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
