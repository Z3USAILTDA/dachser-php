import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
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

  // Fetch corrections for an item
  const fetchCorrections = useCallback(async (id?: number) => {
    const targetId = id || itemId;
    if (!targetId) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('chb-corrections', {
        body: null,
        method: 'GET',
      });

      // Since we can't pass query params easily, we'll use POST for fetching
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chb-corrections?item_id=${targetId}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch corrections');
      }

      const result = await response.json();
      if (result.success) {
        setCorrections(result.corrections || []);
      }
    } catch (error) {
      console.error('[useChbCorrections] fetchCorrections error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [itemId]);

  // Save a correction
  const saveCorrection = useCallback(async (params: SaveCorrectionParams): Promise<{
    success: boolean;
    location?: LocationResult;
  }> => {
    setIsSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('chb-corrections', {
        body: {
          ...params,
          action: 'save'
        },
      });

      if (error) throw error;

      if (data?.success) {
        // Refresh corrections list
        await fetchCorrections(params.item_id);
        
        const location = data.location as LocationResult;
        if (location?.found) {
          toast.success(
            `Correção salva! Localizado: ${location.location}`,
            { duration: 4000 }
          );
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

  // Delete a correction
  const deleteCorrection = useCallback(async (correctionId: number): Promise<boolean> => {
    try {
      const { data, error } = await supabase.functions.invoke('chb-corrections', {
        body: {
          correction_id: correctionId,
          action: 'delete'
        },
      });

      if (error) throw error;

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

  // Get correction for a specific field/file
  const getCorrectionForField = useCallback((filename: string, fieldName: string): ChbCorrection | undefined => {
    return corrections.find(
      c => c.filename === filename && c.field_name === fieldName
    );
  }, [corrections]);

  // Check if a field has a correction
  const hasCorrection = useCallback((filename: string, fieldName: string): boolean => {
    return corrections.some(
      c => c.filename === filename && c.field_name === fieldName
    );
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
