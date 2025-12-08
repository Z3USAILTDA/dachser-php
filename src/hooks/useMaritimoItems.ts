import { useState, useEffect, useCallback } from "react";

export interface MaritimoItem {
  id: string;
  base_file_name: string;
  consignee?: string;
  container?: string;
  status: string;
  created_at: string;
}

export function useMaritimoItems(activeTab: string) {
  const [items, setItems] = useState<MaritimoItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchItems = useCallback(async () => {
    setIsLoading(true);
    try {
      // Placeholder - would fetch from API based on activeTab
      // For now, return mock data
      setItems([
        {
          id: "1",
          base_file_name: "MANIFEST_001.pdf",
          consignee: "EMPRESA ABC LTDA",
          container: "MSKU1234567",
          status: "pendente",
          created_at: new Date().toISOString(),
        },
        {
          id: "2",
          base_file_name: "MANIFEST_002.pdf",
          consignee: "INDUSTRIA XYZ SA",
          container: "TCLU7654321",
          status: "completed",
          created_at: new Date(Date.now() - 86400000).toISOString(),
        },
      ]);
    } catch (error) {
      console.error("Error fetching items:", error);
    } finally {
      setIsLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const deleteItem = async (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  return {
    items,
    isLoading,
    refetch: fetchItems,
    deleteItem,
  };
}
