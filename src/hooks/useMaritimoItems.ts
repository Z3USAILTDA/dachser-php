import { useState, useEffect, useCallback } from "react";
import { maritimoApi } from "@/services/maritimoApi";

export interface MaritimoItem {
  id: string;
  base_file_name: string;
  consignee?: string;
  container?: string;
  status: string;
  analysis_type?: string;
  created_at: string;
  updated_at?: string;
  run_count?: number;
}

export function useMaritimoItems(activeTab: string) {
  const [items, setItems] = useState<MaritimoItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchItems = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await maritimoApi.getItems({ analysisType: activeTab });
      setItems(data || []);
    } catch (error) {
      console.error("Error fetching SEA items:", error);
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const deleteItem = async (id: string) => {
    try {
      await maritimoApi.deleteItem(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (error) {
      console.error("Error deleting SEA item:", error);
      throw error;
    }
  };

  return {
    items,
    isLoading,
    refetch: fetchItems,
    deleteItem,
  };
}
