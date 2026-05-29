import { useState, useEffect, useCallback } from 'react';
import {
  MBLRecord,
  TrackingData,
  CombinedMBLData,
  DraftStats,
  SyncStatus
} from '@/types/draft';
import { supabase } from '@/integrations/supabase/client';


export const useDraftData = () => {
  const [mbls, setMbls] = useState<MBLRecord[]>([]);
  const [trackingStatus, setTrackingStatus] = useState<Map<string, TrackingData>>(new Map());
  const [combinedData, setCombinedData] = useState<CombinedMBLData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [stats, setStats] = useState<DraftStats>({
    total: 0,
    completed: 0,
    inProgress: 0,
    pending: 0,
    error: 0,
    neverConsulted: 0
  });

  const determineStatus = (trackingData: TrackingData | null): SyncStatus => {
    if (!trackingData) return 'Nunca Consultado';

    const statusArmador = trackingData.status_armador?.toLowerCase() || '';

    if (statusArmador.includes('completed') || statusArmador.includes('issued')) {
      return 'Completed';
    }
    if (statusArmador.includes('progress') || statusArmador.includes('confirmed')) {
      return 'In Progress';
    }
    if (statusArmador.includes('error')) {
      return 'Error';
    }
    if (statusArmador.includes('rate') && statusArmador.includes('limit')) {
      return 'Rate Limited';
    }
    if (statusArmador.includes('pending') || statusArmador === '') {
      return 'Pending';
    }

    return 'Unknown';
  };

  // Primário: Supabase edge functions (draft-fetch-mariadb + draft-fetch-tracking-status em paralelo).
  // Fallback: Express local '/api/sea/draft-exportacao' (caso usuário rode servidor local).
  const fetchCombined = useCallback(async (): Promise<{
    mbls: MBLRecord[];
    trackingMap: Map<string, TrackingData>;
  }> => {
    // 1) Tenta Supabase primeiro
    try {
      const [mblRes, trkRes] = await Promise.all([
        supabase.functions.invoke('draft-fetch-mariadb'),
        supabase.functions.invoke('draft-fetch-tracking-status'),
      ]);

      const mblOk = !mblRes.error && mblRes.data?.success;
      const trkOk = !trkRes.error && trkRes.data?.success;

      if (mblOk && trkOk) {
        const mbls: MBLRecord[] = Array.isArray(mblRes.data.mbls) ? mblRes.data.mbls : [];
        const trackingMap = new Map<string, TrackingData>();
        const trackingSource = trkRes.data.trackingStatus ?? {};
        Object.entries(trackingSource).forEach(([mblId, trackingData]) => {
          trackingMap.set(mblId, trackingData as TrackingData);
        });
        return { mbls, trackingMap };
      }
      console.warn('[useDraftData] Supabase falhou, tentando fallback Express', {
        mblErr: mblRes.error, trkErr: trkRes.error,
      });
    } catch (e) {
      console.warn('[useDraftData] Supabase indisponível, tentando fallback Express:', e);
    }

    // 2) Fallback Express
    const response = await fetch('/api/sea/draft-exportacao');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    if (!data?.success) {
      throw new Error(data?.error || 'Resposta inválida do servidor');
    }

    const mblsList: MBLRecord[] = Array.isArray(data.mbls) ? data.mbls : [];
    const trackingMap = new Map<string, TrackingData>();
    const trackingSource = data.trackingStatus ?? data.trackingMap ?? {};
    Object.entries(trackingSource).forEach(([mblId, trackingData]) => {
      trackingMap.set(mblId, trackingData as TrackingData);
    });
    return { mbls: mblsList, trackingMap };
  }, []);


  const combineData = useCallback((
    mblList: MBLRecord[],
    trackingMap: Map<string, TrackingData>
  ): CombinedMBLData[] => {
    return mblList.map(mbl => {
      const tracking = trackingMap.get(mbl.mbl_id) || null;
      const status = determineStatus(tracking);

      return {
        mbl_id: mbl.mbl_id,
        tipo_processo: mbl.tipo_processo,
        shipper: mbl.shipper || null,
        trackingData: tracking,
        status,
        lastConsulted: tracking?.data_hora_consulta || null
      };
    });
  }, []);

  const calculateStats = useCallback((data: CombinedMBLData[]): DraftStats => {
    const stats: DraftStats = {
      total: data.length,
      completed: 0,
      inProgress: 0,
      pending: 0,
      error: 0,
      neverConsulted: 0
    };

    data.forEach(item => {
      switch (item.status) {
        case 'Completed':
          stats.completed++;
          break;
        case 'In Progress':
          stats.inProgress++;
          break;
        case 'Pending':
          stats.pending++;
          break;
        case 'Error':
        case 'Rate Limited':
          stats.error++;
          break;
        case 'Nunca Consultado':
          stats.neverConsulted++;
          break;
      }
    });

    return stats;
  }, []);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { mbls: mblList, trackingMap } = await fetchCombined();

      setMbls(mblList);
      setTrackingStatus(trackingMap);

      const combined = combineData(mblList, trackingMap);
      setCombinedData(combined);
      setStats(calculateStats(combined));
    } catch (err) {
      setError(err as Error);
      console.error('[useDraftData] Erro ao carregar dados do MariaDB:', err);

    } finally {
      setIsLoading(false);
    }
  }, [fetchCombined, combineData, calculateStats]);


  useEffect(() => {
    refetch();
  }, []);

  return {
    mbls,
    trackingStatus,
    combinedData,
    isLoading,
    error,
    refetch,
    stats
  };
};
