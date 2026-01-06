import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { 
  MBLRecord, 
  TrackingData, 
  CombinedMBLData, 
  DraftStats,
  SyncStatus 
} from '@/types/draft';
import { toast } from 'sonner';

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

  const fetchMBLs = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('draft-fetch-mariadb');
      
      if (error) throw error;
      
      if (data?.success && Array.isArray(data.data)) {
        return data.data as MBLRecord[];
      }
      
      return [];
    } catch (err) {
      console.error('Erro ao buscar MBLs:', err);
      throw err;
    }
  }, []);

  const fetchTrackingStatus = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('draft-fetch-tracking-status');
      
      if (error) throw error;
      
      if (data?.success && data.data) {
        const trackingMap = new Map<string, TrackingData>();
        Object.entries(data.data).forEach(([mblId, trackingData]) => {
          trackingMap.set(mblId, trackingData as TrackingData);
        });
        return trackingMap;
      }
      
      return new Map<string, TrackingData>();
    } catch (err) {
      console.error('Erro ao buscar status de tracking:', err);
      throw err;
    }
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
      const [mblList, trackingMap] = await Promise.all([
        fetchMBLs(),
        fetchTrackingStatus()
      ]);

      setMbls(mblList);
      setTrackingStatus(trackingMap);

      const combined = combineData(mblList, trackingMap);
      setCombinedData(combined);
      setStats(calculateStats(combined));
    } catch (err) {
      setError(err as Error);
      toast.error('Erro ao carregar dados do MariaDB');
    } finally {
      setIsLoading(false);
    }
  }, [fetchMBLs, fetchTrackingStatus, combineData, calculateStats]);

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
