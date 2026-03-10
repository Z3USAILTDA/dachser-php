import React, { useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Clock, Plane, MapPin, AlertCircle, AlertTriangle, Loader2, X, RefreshCw, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface AwbTimelineModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  awb: string;
  consigneeName?: string;
  onTrackingResult?: (awb: string, failed: boolean) => void;
}

interface TimelineEvent {
  id: string;
  codigo_evento: string;
  descricao_evento: string;
  data_hora_evento: string;
  aeroporto?: string;
  fonte?: string;
  pecas?: number | null;
  peso?: string | null;
}

interface Discrepancy {
  field: string;
  values: number[];
  min: number;
  max: number;
}

interface TimelineResponse {
  success: boolean;
  data: TimelineEvent[];
  tracking_failed?: boolean;
  discrepancy?: Discrepancy;
}

const getEventIcon = (codigo: string) => {
  const upperCode = codigo?.toUpperCase() || "";
  if (upperCode === "NOVO_MASTER") return <RefreshCw className="h-4 w-4" />;
  if (upperCode === "DEP" || upperCode === "DEPARTED") return <Plane className="h-4 w-4 rotate-45" />;
  if (upperCode === "ARR" || upperCode === "ARRIVED") return <Plane className="h-4 w-4 -rotate-45" />;
  if (upperCode === "DLV" || upperCode === "DELIVERED") return <MapPin className="h-4 w-4" />;
  if (upperCode === "DIS" || upperCode === "OFLD" || upperCode === "NIL") return <AlertCircle className="h-4 w-4" />;
  return <Clock className="h-4 w-4" />;
};

const getEventColor = (codigo: string) => {
  const upperCode = codigo?.toUpperCase() || "";
  if (upperCode === "NOVO_MASTER") return "bg-amber-500/20 text-amber-400 border-amber-500/30";
  if (upperCode === "ARR" || upperCode === "DLV") return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
  if (upperCode === "DEP") return "bg-blue-500/20 text-blue-400 border-blue-500/30";
  if (upperCode === "DIS" || upperCode === "OFLD" || upperCode === "NIL") return "bg-red-500/20 text-red-400 border-red-500/30";
  return "bg-[#ffc800]/20 text-[#ffc800] border-[#ffc800]/30";
};

const formatDateTime = (dateStr: string | null) => {
  if (!dateStr) return "-";
  try {
    return format(new Date(dateStr), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  } catch {
    return dateStr;
  }
};

export const AwbTimelineModal: React.FC<AwbTimelineModalProps> = ({
  open,
  onOpenChange,
  awb,
  consigneeName,
  onTrackingResult,
}) => {
  const latestResultRef = React.useRef<{ awb: string; failed: boolean } | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["awb-timeline", awb],
    queryFn: async (): Promise<TimelineResponse> => {
      if (!awb) return { success: true, data: [], tracking_failed: false };

      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { action: "get_awb_tracking_events", awb },
      });

      if (error) throw error;
      if (!data?.success) return { success: true, data: [], tracking_failed: true };

      const rawEvents = (data.data || []).map((row: any, index: number) => ({
        id: row.id?.toString() || `event-${awb}-${index}`,
        codigo_evento: row.codigo_evento || "UNKNOWN",
        descricao_evento: row.descricao_evento || "",
        data_hora_evento: row.data_hora_evento || "",
        aeroporto: row.aeroporto || "",
        fonte: row.fonte || "",
        pecas: row.pecas ?? null,
        peso: row.peso ?? null,
      }));

      const deduped = rawEvents.filter((event: TimelineEvent, index: number) => {
        if (index === 0) return true;
        return event.codigo_evento?.toUpperCase() !== rawEvents[index - 1].codigo_evento?.toUpperCase();
      });

      deduped.sort((a: TimelineEvent, b: TimelineEvent) => {
        const dateA = a.data_hora_evento ? new Date(a.data_hora_evento).getTime() : 0;
        const dateB = b.data_hora_evento ? new Date(b.data_hora_evento).getTime() : 0;
        return dateB - dateA;
      });

      return {
        success: true,
        data: deduped,
        tracking_failed: !!data.tracking_failed,
        discrepancy: data.discrepancy || null,
      };
    },
    enabled: open && !!awb,
    staleTime: 0,
  });

  useEffect(() => {
    if (!isLoading && !error && data !== undefined && awb) {
      const failed = data.tracking_failed === true;
      latestResultRef.current = { awb, failed };
      if (onTrackingResult) {
        onTrackingResult(awb, failed);
      }
    }
  }, [data, isLoading, error, awb]);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && latestResultRef.current && onTrackingResult) {
      onTrackingResult(latestResultRef.current.awb, latestResultRef.current.failed);
    }
    onOpenChange(newOpen);
  };

  const events = data?.data || [];
  const trackingFailed = data?.tracking_failed || false;
  const backendDiscrepancy = data?.discrepancy || null;

  // Pieces summary: always calculate when events have pieces data
  const piecesSummary = React.useMemo(() => {
    const piecesValues = events
      .map((e: TimelineEvent) => e.pecas)
      .filter((v): v is number => v != null && v > 0);
    if (piecesValues.length === 0) return null;
    const unique = [...new Set(piecesValues)];
    const hasDiscrepancy = backendDiscrepancy != null || unique.length >= 2;
    return {
      values: unique,
      min: Math.min(...unique),
      max: Math.max(...unique),
      hasDiscrepancy,
      declared: unique[unique.length - 1], // earliest event's pieces (last in DESC-sorted array)
      current: unique[0], // latest event's pieces
    };
  }, [backendDiscrepancy, events]);
  const discrepancy = backendDiscrepancy || (piecesSummary?.hasDiscrepancy ? { field: 'pecas', values: piecesSummary.values, min: piecesSummary.min, max: piecesSummary.max } : null);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl max-h-[80vh] overflow-hidden bg-[rgba(5,6,18,.98)] border border-[rgba(255,255,255,.12)]">
        <DialogHeader className="pb-4 border-b border-[rgba(255,255,255,.08)]">
          <DialogTitle className="text-[#f5f5f5] flex items-center gap-2">
            <Clock className="w-5 h-5 text-[#ffc800]" />
            Timeline de Eventos
          </DialogTitle>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-sm text-muted-foreground">AWB:</span>
            <span className="font-mono text-[#ffc800] font-semibold">{awb}</span>
            {consigneeName && (
              <>
                <span className="text-muted-foreground">|</span>
                <span className="text-sm text-muted-foreground truncate max-w-[200px]">{consigneeName}</span>
              </>
            )}
          </div>
        </DialogHeader>

        <div className="overflow-y-auto max-h-[55vh] pr-2 mt-4">
          {/* Pieces summary / discrepancy alert */}
          {piecesSummary && !discrepancy && (
            <Alert className="mb-4 border-blue-500/30 bg-blue-500/10">
              <Package className="h-4 w-4 text-blue-400" />
              <AlertDescription className="text-blue-300 text-sm">
                📦 Peças declaradas: <strong>{piecesSummary.declared}</strong> · Peso: {
                  events.find((e: TimelineEvent) => e.peso)?.peso || 'N/A'
                }
              </AlertDescription>
            </Alert>
          )}

          {/* Discrepancy alert banner */}
          {discrepancy && (
            <Alert className="mb-4 border-amber-500/40 bg-amber-500/10">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <AlertDescription className="text-amber-300 text-sm">
                ⚠ Discrepância de {discrepancy.field === 'pecas' ? 'peças' : discrepancy.field} detectada: valores encontrados{' '}
                <strong>{discrepancy.values.join(' e ')}</strong>
              </AlertDescription>
            </Alert>
          )}

          {isLoading && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-[#ffc800] animate-spin mb-3" />
              <p className="text-sm text-muted-foreground">Carregando eventos...</p>
            </div>
          )}

          {error && !isLoading && (
            <div className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="w-8 h-8 text-red-400 mb-3" />
              <p className="text-sm text-red-400">Erro ao carregar eventos</p>
              <p className="text-xs text-muted-foreground mt-1">Tente novamente mais tarde</p>
            </div>
          )}

          {!isLoading && !error && trackingFailed && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
                <AlertTriangle className="w-7 h-7 text-red-400" />
              </div>
              <p className="text-sm font-medium text-red-400">Falha no Rastreio</p>
              <p className="text-xs text-muted-foreground mt-2 text-center max-w-[300px]">
                Rastreamento indisponível para este AWB. Não foi possível obter dados de rastreio em nenhuma fonte disponível.
              </p>
            </div>
          )}

          {!isLoading && !error && !trackingFailed && events.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12">
              <Clock className="w-8 h-8 text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">Nenhum evento encontrado para este AWB</p>
            </div>
          )}

          {!isLoading && !error && !trackingFailed && events.length > 0 && (
            <div className="relative pl-6">
              <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-[rgba(255,255,255,.1)]" />
              <div className="space-y-4">
                {events.map((event, index) => {
                  const hasDivergentPieces = discrepancy && event.pecas != null && event.pecas !== discrepancy.max;
                  return (
                    <div key={event.id} className="relative flex gap-4">
                      <div className={`absolute -left-6 w-6 h-6 rounded-full flex items-center justify-center border ${getEventColor(event.codigo_evento)}`}>
                        {getEventIcon(event.codigo_evento)}
                      </div>
                      <div className={`flex-1 rounded-lg p-3 border transition-colors ${
                        hasDivergentPieces
                          ? 'bg-red-500/5 border-red-500/20 hover:border-red-500/30'
                          : 'bg-[rgba(255,255,255,.03)] border-[rgba(255,255,255,.06)] hover:border-[rgba(255,255,255,.12)]'
                      }`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${getEventColor(event.codigo_evento)}`}>
                              {event.codigo_evento}
                            </span>
                            {index === 0 && (
                              <span className="text-[0.65rem] uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                Mais recente
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatDateTime(event.data_hora_evento)}
                          </span>
                        </div>
                        {event.descricao_evento && (
                          <p className="text-sm text-[#f5f5f5] mt-2">{event.descricao_evento}</p>
                        )}
                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                          {event.aeroporto && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="w-3 h-3" />
                              <span>{event.aeroporto}</span>
                            </div>
                          )}
                          {(event.pecas != null || event.peso != null) && (
                            <div className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded ${
                              hasDivergentPieces
                                ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                                : 'bg-[rgba(255,255,255,.06)] text-muted-foreground'
                            }`}>
                              <Package className="w-3 h-3" />
                              <span>
                                {event.pecas != null ? `${event.pecas} pcs` : ''}
                                {event.pecas != null && event.peso ? ' · ' : ''}
                                {event.peso ? `${event.peso}` : ''}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-[rgba(255,255,255,.08)] flex justify-end">
          <Button variant="outline" size="sm" onClick={() => handleOpenChange(false)} className="gap-1.5">
            <X className="w-4 h-4" />
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AwbTimelineModal;
