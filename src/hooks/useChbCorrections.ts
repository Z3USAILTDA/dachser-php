import { useState, useCallback } from 'react';
import { toast } from 'sonner';

export interface ChbCorrection {
  id: number;
  item_id: number;
  filename: string;
  field_name: string;
  original_value: string | null;
  corrected_value: string;
  location_reference: string | null;
  location_context: string | null;
  location_confidence: 'alta' | 'media' | 'baixa' | null;
  corrected_by: string | null;
  applied_count: number;
  is_validated: boolean;
  created_at: string;
}

interface LocationResult {
  found: boolean;
  location: string;
  context: string;
  confidence: 'alta' | 'media' | 'baixa';
}

interface SaveCorrectionParams {
  item_id: number;
  filename: string;
  field_name: string;
  original_value?: string;
  corrected_value: string;
  corrected_by?: string;
  file_content?: string;
}

export function useChbCorrections(itemId?: number) {
  const [corrections, setCorrections] = useState<ChbCorrection[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const fetchCorrections = useCallback(async (id?: number) => {
    const targetId = id || itemId;
    if (!targetId) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/chb/corrections?item_id=${targetId}`);
      if (!response.ok) throw new Error('Failed to fetch corrections');
      const result = await response.json();
      if (result.success) setCorrections(result.corrections || []);
    } catch (error) {
      console.error('[useChbCorrections] fetchCorrections error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [itemId]);

  const saveCorrection = useCallback(async (params: SaveCorrectionParams): Promise<{
    success: boolean;
    location?: LocationResult;
  }> => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/chb/corrections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...params, action: 'save' }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Failed to save correction');

      if (data?.success) {
        await fetchCorrections(params.item_id);
        const location = data.location as LocationResult;
        if (location?.found) {
          toast.success(`Correção salva! Localizado: ${location.location}`, { duration: 4000 });
        } else {
          toast.success('Correção salva. Localização automática não disponível.');
        }
        return { success: true, location };
      }

      throw new Error(data?.error || 'Failed to save correction');
    } catch (error) {
      console.error('[useChbCorrections] saveCorrection error:', error);
      toast.error('Erro ao salvar correção');
      return { success: false };
    } finally {
      setIsSaving(false);
    }
  }, [fetchCorrections]);

  const deleteCorrection = useCallback(async (correctionId: number): Promise<boolean> => {
    try {
      const response = await fetch('/api/chb/corrections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correction_id: correctionId, action: 'delete' }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Failed to delete correction');

      if (data?.success) {
        setCorrections(prev => prev.filter(c => c.id !== correctionId));
        toast.success('Correção removida');
        return true;
      }

      throw new Error(data?.error || 'Failed to delete correction');
    } catch (error) {
      console.error('[useChbCorrections] deleteCorrection error:', error);
      toast.error('Erro ao remover correção');
      return false;
    }
  }, []);

  const getCorrectionForField = useCallback((filename: string, fieldName: string): ChbCorrection | undefined => {
    return corrections.find(c => c.filename === filename && c.field_name === fieldName);
  }, [corrections]);

  const hasCorrection = useCallback((filename: string, fieldName: string): boolean => {
    return corrections.some(c => c.filename === filename && c.field_name === fieldName);
  }, [corrections]);

  return {
    corrections,
    isLoading,
    isSaving,
    fetchCorrections,
    saveCorrection,
    deleteCorrection,
    getCorrectionForField,
    hasCorrection,
  };
}
