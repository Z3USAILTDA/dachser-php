import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Clock, Plane, MapPin, AlertCircle, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface AwbTimelineModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  awb: string;
  consigneeName?: string;
}

interface TimelineEvent {
  id: string;
  codigo_evento: string;
  descricao_evento: string;
  data_hora_evento: string;
  aeroporto?: string;
  fonte?: string;
}

// Mapeamento de ícones por tipo de evento
const getEventIcon = (codigo: string) => {
  const upperCode = codigo?.toUpperCase() || "";
  if (upperCode === "DEP" || upperCode === "DEPARTED") {
    return <Plane className="h-4 w-4 rotate-45" />;
  }
  if (upperCode === "ARR" || upperCode === "ARRIVED") {
    return <Plane className="h-4 w-4 -rotate-45" />;
  }
  if (upperCode === "DLV" || upperCode === "DELIVERED") {
    return <MapPin className="h-4 w-4" />;
  }
  if (upperCode === "DIS" || upperCode === "OFLD" || upperCode === "NIL") {
    return <AlertCircle className="h-4 w-4" />;
  }
  return <Clock className="h-4 w-4" />;
};

// Cores por tipo de evento
const getEventColor = (codigo: string) => {
  const upperCode = codigo?.toUpperCase() || "";
  if (upperCode === "ARR" || upperCode === "DLV") {
    return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
  }
  if (upperCode === "DEP") {
    return "bg-blue-500/20 text-blue-400 border-blue-500/30";
  }
  if (upperCode === "DIS" || upperCode === "OFLD" || upperCode === "NIL") {
    return "bg-red-500/20 text-red-400 border-red-500/30";
  }
  return "bg-[#ffc800]/20 text-[#ffc800] border-[#ffc800]/30";
};

const formatDateTime = (dateStr: string | null) => {
  if (!dateStr) return "-";
  try {
    const date = new Date(dateStr);
    return format(date, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  } catch {
    return dateStr;
  }
};

export const AwbTimelineModal: React.FC<AwbTimelineModalProps> = ({
  open,
  onOpenChange,
  awb,
  consigneeName,
}) => {
  const { data: events, isLoading, error } = useQuery({
    queryKey: ["awb-timeline", awb],
    queryFn: async (): Promise<TimelineEvent[]> => {
      if (!awb) return [];

      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "get_cct_events",
          awb: awb,
        },
      });

      if (error) {
        console.error("Error fetching AWB timeline:", error);
        throw error;
      }

      if (!data?.success) {
        console.error("Error in response:", data?.error);
        return [];
      }

      const rawEvents = (data.data || []).map((row: any, index: number) => ({
        id: row.id?.toString() || `event-${awb}-${index}`,
        codigo_evento: row.codigo_evento || "UNKNOWN",
        descricao_evento: row.descricao_evento || "",
        data_hora_evento: row.data_hora_evento || "",
        aeroporto: row.aeroporto || "",
        fonte: row.fonte || "",
      }));

      // Deduplicar eventos: manter apenas o mais recente de cada código de evento
      const seen = new Set<string>();
      const deduplicatedEvents = rawEvents.filter((event: TimelineEvent) => {
        const key = event.codigo_evento?.toUpperCase() || "";
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });

      return deduplicatedEvents;
    },
    enabled: open && !!awb,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
                <span className="text-sm text-muted-foreground truncate max-w-[200px]">
                  {consigneeName}
                </span>
              </>
            )}
          </div>
        </DialogHeader>

        <div className="overflow-y-auto max-h-[55vh] pr-2 mt-4">
          {/* Estado: Carregando */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-[#ffc800] animate-spin mb-3" />
              <p className="text-sm text-muted-foreground">Carregando eventos...</p>
            </div>
          )}

          {/* Estado: Erro */}
          {error && !isLoading && (
            <div className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="w-8 h-8 text-red-400 mb-3" />
              <p className="text-sm text-red-400">Erro ao carregar eventos</p>
              <p className="text-xs text-muted-foreground mt-1">
                Tente novamente mais tarde
              </p>
            </div>
          )}

          {/* Estado: Sem eventos */}
          {!isLoading && !error && (!events || events.length === 0) && (
            <div className="flex flex-col items-center justify-center py-12">
              <Clock className="w-8 h-8 text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">
                Nenhum evento encontrado para este AWB
              </p>
            </div>
          )}

          {/* Estado: Com eventos */}
          {!isLoading && !error && events && events.length > 0 && (
            <div className="relative pl-6">
              {/* Linha vertical da timeline */}
              <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-[rgba(255,255,255,.1)]" />

              <div className="space-y-4">
                {events.map((event, index) => (
                  <div key={event.id} className="relative flex gap-4">
                    {/* Círculo do evento */}
                    <div
                      className={`absolute -left-6 w-6 h-6 rounded-full flex items-center justify-center border ${getEventColor(
                        event.codigo_evento
                      )}`}
                    >
                      {getEventIcon(event.codigo_evento)}
                    </div>

                    {/* Conteúdo do evento */}
                    <div className="flex-1 bg-[rgba(255,255,255,.03)] rounded-lg p-3 border border-[rgba(255,255,255,.06)] hover:border-[rgba(255,255,255,.12)] transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${getEventColor(
                              event.codigo_evento
                            )}`}
                          >
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
                        <p className="text-sm text-[#f5f5f5] mt-2">
                          {event.descricao_evento}
                        </p>
                      )}

                      {event.aeroporto && (
                        <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                          <MapPin className="w-3 h-3" />
                          <span>{event.aeroporto}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-[rgba(255,255,255,.08)] flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="gap-1.5"
          >
            <X className="w-4 h-4" />
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AwbTimelineModal;
