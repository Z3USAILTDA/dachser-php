import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Clock, Plane, MapPin, AlertCircle, AlertTriangle, X, Package } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { parseDBDate } from "@/utils/timezone";

interface AwbTimelineModalScraperProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  awb: string;
  consigneeName?: string;
  timelineJson: any[];
  lastEvent?: string;
}

interface TimelineEntry {
  description?: string;
  location?: string;
  date?: string;
  timestamp?: string;
  time?: string;
  flight?: string;
  pieces?: number;
  weight?: string;
}

const getEventIcon = (desc: string) => {
  const upper = (desc || "").toUpperCase();
  if (upper.includes("DEPART")) return <Plane className="h-4 w-4 rotate-45" />;
  if (upper.includes("ARRIV")) return <Plane className="h-4 w-4 -rotate-45" />;
  if (upper.includes("DELIVER")) return <MapPin className="h-4 w-4" />;
  if (upper.includes("DISCREPAN") || upper.includes("OFFLOAD") || upper.includes("MISSING")) return <AlertCircle className="h-4 w-4" />;
  return <Clock className="h-4 w-4" />;
};

const getEventColor = (desc: string) => {
  const upper = (desc || "").toUpperCase();
  if (upper.includes("ARRIV") || upper.includes("DELIVER")) return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
  if (upper.includes("DEPART")) return "bg-blue-500/20 text-blue-400 border-blue-500/30";
  if (upper.includes("DISCREPAN") || upper.includes("OFFLOAD") || upper.includes("MISSING")) return "bg-red-500/20 text-red-400 border-red-500/30";
  return "bg-[#ffc800]/20 text-[#ffc800] border-[#ffc800]/30";
};

// O timeline_json (t_fato_aereo) grava data e hora em campos SEPARADOS (`date` e `time`).
// Usar apenas `date` zerava o horário (00:00). Aqui combinamos os dois campos.
const buildDateTime = (event: TimelineEntry): string => {
  const date = (event.date || event.timestamp || "").trim();
  const time = (event.time || "").trim();
  if (!date) return "";
  // Se a data já vier com hora embutida, não duplica o campo `time`.
  const dateHasTime = /\d{1,2}:\d{2}/.test(date);
  if (dateHasTime || !time) return date;
  return `${date} ${time}`;
};

const formatEventDateTime = (event: TimelineEntry): string => {
  const combined = buildDateTime(event);
  if (!combined) return "-";
  // parseDBDate entende os formatos do timeline_json ("DD Mon YYYY HH:MM", ISO, etc.)
  // e aplica o fuso do banco (São Paulo), igual ao restante do sistema.
  const parsed = parseDBDate(combined);
  if (!parsed || isNaN(parsed.getTime())) return combined;
  return format(parsed, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
};

// Extract a short code from description for display
const extractCode = (desc: string): string => {
  if (!desc) return "UNK";
  const upper = desc.toUpperCase();
  if (upper.includes("DEPARTED")) return "DEP";
  if (upper.includes("ARRIVED")) return "ARR";
  if (upper.includes("DELIVERED")) return "DLV";
  if (upper.includes("RECEIVED FROM FLIGHT")) return "RCF";
  if (upper.includes("RECEIVED FROM SHIPPER")) return "RCS";
  if (upper.includes("MANIFESTED")) return "MAN";
  if (upper.includes("BOOKED")) return "BKD";
  if (upper.includes("NOTIFIED")) return "NFD";
  if (upper.includes("OFFLOAD")) return "OFLD";
  if (upper.includes("DISCREPAN")) return "DIS";
  if (upper.includes("FREIGHT ON HAND")) return "FOH";
  if (upper.includes("PROOF OF DELIVERY")) return "POD";
  // Return first 3-4 chars uppercase
  return desc.substring(0, 4).toUpperCase();
};

export const AwbTimelineModalScraper: React.FC<AwbTimelineModalScraperProps> = ({
  open,
  onOpenChange,
  awb,
  consigneeName,
  timelineJson,
  lastEvent,
}) => {
  // Sort timeline: use the lastEvent logic to determine correct order
  const sortedTimeline = React.useMemo(() => {
    if (!timelineJson || timelineJson.length === 0) return [];

    const entries: (TimelineEntry & { _index: number })[] = timelineJson.map((e: any, i: number) => ({
      ...e,
      _index: i,
    }));

    // Sort by date+time DESC (most recent first)
    entries.sort((a, b) => {
      const dA = parseDBDate(buildDateTime(a));
      const dB = parseDBDate(buildDateTime(b));
      const tA = dA ? dA.getTime() : 0;
      const tB = dB ? dB.getTime() : 0;
      if (tA && tB && tA !== tB) return tB - tA;
      // Same timestamp: use original order (lower index = more recent in scraper)
      return a._index - b._index;
    });

    // If lastEvent is the penultimate code, swap first two entries
    if (lastEvent && entries.length >= 2) {
      const firstCode = extractCode(entries[0].description || "");
      if (firstCode !== lastEvent.toUpperCase()) {
        // Find the entry matching lastEvent and move it to top
        const matchIdx = entries.findIndex(e => extractCode(e.description || "") === lastEvent.toUpperCase());
        if (matchIdx > 0) {
          const [match] = entries.splice(matchIdx, 1);
          entries.unshift(match);
        }
      }
    }

    return entries;
  }, [timelineJson, lastEvent]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-w-xl max-h-[80vh] overflow-hidden bg-[rgba(5,6,18,.98)] border border-[rgba(255,255,255,.12)]">
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
          {sortedTimeline.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Clock className="w-8 h-8 text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">Nenhum evento encontrado para este AWB</p>
            </div>
          ) : (
            <div className="relative pl-6">
              <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-[rgba(255,255,255,.1)]" />
              <div className="space-y-4">
                {sortedTimeline.map((event, index) => {
                  const desc = event.description || "";
                  const code = extractCode(desc);
                  const location = event.location || "";

                  return (
                    <div key={`${index}-${code}`} className="relative flex gap-4">
                      <div className={`absolute -left-6 w-6 h-6 rounded-full flex items-center justify-center border ${getEventColor(desc)}`}>
                        {getEventIcon(desc)}
                      </div>
                      <div className="flex-1 rounded-lg p-3 border transition-colors bg-[rgba(255,255,255,.03)] border-[rgba(255,255,255,.06)] hover:border-[rgba(255,255,255,.12)]">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${getEventColor(desc)}`}>
                              {code}
                            </span>
                            {index === 0 && (
                              <span className="text-[0.65rem] uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                Mais recente
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatEventDateTime(event)}
                          </span>
                        </div>
                        {desc && (
                          <p className="text-sm text-[#f5f5f5] mt-2">{desc}</p>
                        )}
                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                          {location && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="w-3 h-3" />
                              <span>{location}</span>
                            </div>
                          )}
                          {event.flight && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Plane className="w-3 h-3" />
                              <span>{event.flight}</span>
                            </div>
                          )}
                          {(event.pieces || event.weight) && (
                            <div className="flex items-center gap-1 text-xs bg-[rgba(255,255,255,.06)] text-muted-foreground px-2 py-0.5 rounded">
                              <Package className="w-3 h-3" />
                              <span>
                                {event.pieces ? `${event.pieces} pcs` : ''}
                                {event.pieces && event.weight ? ' · ' : ''}
                                {event.weight || ''}
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
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="gap-1.5">
            <X className="w-4 h-4" />
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AwbTimelineModalScraper;
