import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { 
  Ship, 
  Anchor, 
  Package, 
  FileCheck, 
  Truck, 
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RefreshCw,
  Navigation,
  Box
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { ContainerEvent } from "@/hooks/useDemurrageData";

interface FreeTimeEvent {
  id: string;
  event_code: string;
  event_datetime: string;
  event_description: string | null;
  location?: string | null;
  source?: string;
}

interface ContainerTimelineProps {
  events: ContainerEvent[];
  freeTimeStart?: string | null;
  freeTimeEnd?: string | null;
}

const EVENT_ICONS: Record<string, React.ReactNode> = {
  DEP: <Ship className="h-4 w-4" />,
  DEPARTURE: <Ship className="h-4 w-4" />,
  ARR: <Anchor className="h-4 w-4" />,
  ARRIVAL: <Anchor className="h-4 w-4" />,
  DISCHARGE: <Package className="h-4 w-4" />,
  DISCHARGED: <Package className="h-4 w-4" />,
  CUSTOMS: <FileCheck className="h-4 w-4" />,
  GATE_OUT: <Truck className="h-4 w-4" />,
  RETURNED: <CheckCircle2 className="h-4 w-4" />,
  FREE_TIME_START: <Clock className="h-4 w-4" />,
  FREE_TIME_END: <AlertTriangle className="h-4 w-4" />,
  MBL_SYNC: <RefreshCw className="h-4 w-4" />,
  STATUS_UPDATE: <Navigation className="h-4 w-4" />,
  LOADED: <Box className="h-4 w-4" />,
  IN_TRANSIT: <Ship className="h-4 w-4" />,
};

const EVENT_COLORS: Record<string, string> = {
  DEP: "bg-green-500/10 text-green-400 border-green-500/20",
  DEPARTURE: "bg-green-500/10 text-green-400 border-green-500/20",
  ARR: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  ARRIVAL: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  DISCHARGE: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  DISCHARGED: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  CUSTOMS: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  GATE_OUT: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  RETURNED: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  FREE_TIME_START: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  FREE_TIME_END: "bg-red-500/10 text-red-400 border-red-500/20",
  MBL_SYNC: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  STATUS_UPDATE: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  LOADED: "bg-teal-500/10 text-teal-400 border-teal-500/20",
  IN_TRANSIT: "bg-sky-500/10 text-sky-400 border-sky-500/20",
};

const EVENT_LABELS: Record<string, string> = {
  DEP: "Partida",
  DEPARTURE: "Partida",
  ARR: "Chegada",
  ARRIVAL: "Chegada",
  DISCHARGE: "Descarga",
  DISCHARGED: "Descarga",
  CUSTOMS: "Liberação Alfândega",
  GATE_OUT: "Gate Out",
  RETURNED: "Devolução",
  FREE_TIME_START: "Início Free Time",
  FREE_TIME_END: "Fim Free Time",
  MBL_SYNC: "Sincronização",
  STATUS_UPDATE: "Atualização",
  LOADED: "Carregado",
  IN_TRANSIT: "Em Trânsito",
};

export function ContainerTimeline({ events, freeTimeStart, freeTimeEnd }: ContainerTimelineProps) {
  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "-";
    try {
      return format(parseISO(dateStr), "dd/MM/yyyy HH:mm", { locale: ptBR });
    } catch {
      return dateStr;
    }
  };

  const allEvents = useMemo(() => {
    // Convert ContainerEvent to unified format
    const normalized: FreeTimeEvent[] = events.map((evt) => ({
      id: String(evt.id),
      event_code: evt.event_code?.toUpperCase() || 'STATUS_UPDATE',
      event_datetime: evt.event_datetime || evt.created_at,
      event_description: evt.event_description || evt.container_status || null,
      location: evt.location,
      source: evt.source,
    }));

    // Add Free Time markers
    if (freeTimeStart) {
      normalized.push({
        id: "ft-start",
        event_code: "FREE_TIME_START",
        event_datetime: freeTimeStart,
        event_description: "Início do período de free time",
        source: "SISTEMA",
      });
    }

    if (freeTimeEnd) {
      normalized.push({
        id: "ft-end",
        event_code: "FREE_TIME_END",
        event_datetime: freeTimeEnd,
        event_description: "Término do período de free time",
        source: "SISTEMA",
      });
    }

    // Sort by date (oldest first for timeline)
    return normalized.sort((a, b) => {
      const dateA = new Date(a.event_datetime || '').getTime();
      const dateB = new Date(b.event_datetime || '').getTime();
      return dateA - dateB;
    });
  }, [events, freeTimeStart, freeTimeEnd]);

  if (allEvents.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>Nenhum evento registrado</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-[rgba(255,255,255,0.1)]" />

      <div className="space-y-4">
        {allEvents.map((event, index) => {
          const eventCode = event.event_code?.toUpperCase() || 'STATUS_UPDATE';
          const icon = EVENT_ICONS[eventCode] || <Calendar className="h-4 w-4" />;
          const colorClass = EVENT_COLORS[eventCode] || "bg-gray-500/10 text-gray-400 border-gray-500/20";
          const label = EVENT_LABELS[eventCode] || eventCode;
          const isFreeTimeMarker = eventCode === "FREE_TIME_START" || eventCode === "FREE_TIME_END";

          return (
            <div key={event.id || index} className="relative pl-10">
              {/* Event dot */}
              <div className={`absolute left-2 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                isFreeTimeMarker 
                  ? eventCode === "FREE_TIME_END" 
                    ? "bg-red-500 border-red-400" 
                    : "bg-yellow-500 border-yellow-400"
                  : "bg-[#0a0a0a] border-[#ffc800]"
              }`}>
                {isFreeTimeMarker && (
                  <span className="w-2 h-2 rounded-full bg-white" />
                )}
              </div>

              <div className={`p-3 rounded-lg border ${
                isFreeTimeMarker 
                  ? eventCode === "FREE_TIME_END"
                    ? "bg-red-500/5 border-red-500/30"
                    : "bg-yellow-500/5 border-yellow-500/30"
                  : "bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.1)]"
              }`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Badge className={colorClass}>
                      {icon}
                      <span className="ml-1">{label}</span>
                    </Badge>
                    {event.location && (
                      <span className="text-xs text-muted-foreground">{event.location}</span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(event.event_datetime)}
                  </span>
                </div>
                
                {event.event_description && (
                  <p className="text-sm mt-2 text-foreground">{event.event_description}</p>
                )}
                
                {event.source && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Fonte: {event.source}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
