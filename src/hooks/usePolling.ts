import { useState, useEffect, useCallback, useRef } from "react";
import { maritimoApi } from "@/services/maritimoApi";
import { toast } from "sonner";

interface PollingOptions {
  interval?: number;
  onComplete?: (result: any) => void;
  onError?: (error: string) => void;
}

export const usePolling = ({ interval = 2000, onComplete, onError }: PollingOptions = {}) => {
  const [isPolling, setIsPolling] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<string>('');
  const [currentStep, setCurrentStep] = useState<string>('');
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const isPollingRef = useRef(false);

  const startPolling = useCallback(async (analysisId: string) => {
    setIsPolling(true);
    isPollingRef.current = true;
    setCurrentStatus('queued');
    setCurrentStep('Iniciando análise...');
    setProgressPercent(0);
    setAnalysisData(null);

    const pollInterval = setInterval(async () => {
      if (!isPollingRef.current) {
        clearInterval(pollInterval);
        return;
      }

      try {
        const analysis = await maritimoApi.pollAnalysis(analysisId);
        
        setCurrentStatus(analysis.status);
        setCurrentStep(analysis.progress_step || '');
        setProgressPercent(analysis.progress_percent || 0);
        setAnalysisData(analysis);

        console.log(`Polling ${analysisId}: ${analysis.status} - ${analysis.progress_step}`);

        if (analysis.status === 'completed') {
          clearInterval(pollInterval);
          setIsPolling(false);
          isPollingRef.current = false;
          toast.success('Análise concluída com sucesso!');
          onComplete?.(analysis);
        } else if (analysis.status === 'error') {
          clearInterval(pollInterval);
          setIsPolling(false);
          isPollingRef.current = false;
          toast.error('Erro na análise: ' + (analysis.error_message || 'Erro desconhecido'));
          onError?.(analysis.error_message || 'Erro desconhecido');
        }
      } catch (error: any) {
        console.error('Polling error:', error);
        clearInterval(pollInterval);
        setIsPolling(false);
        isPollingRef.current = false;
        toast.error('Erro ao consultar status da análise');
        onError?.(error.message);
      }
    }, interval);

    // Cleanup after 10 minutes (timeout)
    setTimeout(() => {
      if (isPollingRef.current) {
        clearInterval(pollInterval);
        setIsPolling(false);
        isPollingRef.current = false;
        toast.error('Tempo limite excedido após 10 minutos');
        onError?.('Timeout');
      }
    }, 600000);

  }, [interval, onComplete, onError]);

  return {
    startPolling,
    isPolling,
    currentStatus,
    currentStep,
    analysisData,
    progressPercent,
  };
};
