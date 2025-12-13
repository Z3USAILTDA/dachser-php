import { useState, useEffect } from "react";
import { maritimoApi, MaritimoItem as ApiMaritimoItem } from "@/services/maritimoApi";
import { toast } from "sonner";

export type MaritimoItem = ApiMaritimoItem;

export const useMaritimoItems = (analysisType?: 'manifest_hbl' | 'hbl_mbl' | 'invoices_hbl') => {
  const [items, setItems] = useState<MaritimoItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await maritimoApi.getItems(analysisType ? { analysisType } : undefined);
      setItems(data);
    } catch (err: any) {
      console.error('Error fetching items:', err);
      setError(err.message || 'Failed to load items');
      toast.error('Erro ao carregar itens');
    } finally {
      setIsLoading(false);
    }
  };

  const deleteItem = async (itemId: string) => {
    try {
      await maritimoApi.deleteItem(itemId);
      toast.success('Item excluído com sucesso');
      // Refresh list
      await fetchItems();
    } catch (err: any) {
      console.error('Error deleting item:', err);
      toast.error('Erro ao excluir item');
    }
  };

  useEffect(() => {
    fetchItems();
  }, [analysisType]);

  return {
    items,
    isLoading,
    error,
    refetch: fetchItems,
    deleteItem,
  };
};
