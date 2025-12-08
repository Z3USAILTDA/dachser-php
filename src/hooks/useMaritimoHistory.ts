import { useState, useCallback } from "react";

interface HistoryRun {
  id: string;
  status: string;
  result_text?: string;
  json_result?: any;
  created_at: string;
  updated_at?: string;
  files?: any[];
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
      // Placeholder - would fetch from API
      setHistory({
        item: { base_file_name: "MANIFEST_001.pdf" },
        runs: [],
      });
    } catch (error) {
      console.error("Error fetching history:", error);
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
