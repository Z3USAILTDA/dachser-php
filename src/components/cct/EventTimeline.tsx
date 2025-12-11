import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, CheckCircle, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { CCTEvento, FonteEvento, NivelConfianca } from "@/types/cct";
import { cn } from "@/lib/utils";

interface EventTimelineProps {
  eventos: CCTEvento[];
}

const fonteConfig: Record<FonteEvento, { label: string; color: string }> = {
  LEADCOMEX: { label: "LeadComex", color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30" },
  HANDLER: { label: "Handler", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  RFB: { label: "RFB", color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  MANUAL: { label: "Manual", color: "bg-gray-500/20 text-gray-400 border-gray-500/30" },
};

const eventColors: Record<string, string> = {
  AGUARDANDO_EMBARQUE: "border-yellow-500 bg-yellow-500",
  MANIFESTADO: "border-primary bg-primary",
  AREA_TRANSFERENCIA: "border-blue-500 bg-blue-500",
  CHEGADA_INFORMADA: "border-cyan-500 bg-cyan-500",
  RECEPCIONADO: "border-indigo-500 bg-indigo-500",
  EM_TRANSITO: "border-orange-500 bg-orange-500",
  ENTREGUE: "border-emerald-500 bg-emerald-500",
  BLOQUEIO: "border-destructive bg-destructive",
};

export function EventTimeline({ eventos }: EventTimelineProps) {
  if (eventos.length === 0) {
    return (
      <Card className="bg-card/50 border-border p-6 text-center">
        <AlertTriangle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-muted-foreground">Nenhum evento registrado</p>
      </Card>
    );
  }

  const sortedEventos = [...eventos].sort(
    (a, b) => new Date(a.data_hora_evento).getTime() - new Date(b.data_hora_evento).getTime()
  );

  return (
    <Card className="bg-card/50 border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          Timeline de Eventos ({eventos.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />

          {/* Events */}
          <div className="space-y-4">
            {sortedEventos.map((evento, index) => {
              const fonte = fonteConfig[evento.fonte];
              const isLast = index === sortedEventos.length - 1;
              const eventColor = eventColors[evento.codigo_evento] || "border-muted bg-muted";

              return (
                <div key={evento.id} className="relative pl-10">
                  {/* Timeline dot */}
                  <div
                    className={cn(
                      "absolute left-2.5 w-3 h-3 rounded-full border-2",
                      eventColor,
                      isLast && "ring-4 ring-primary/20"
                    )}
                  />

                  {/* Event content */}
                  <div className={cn(
                    "p-3 rounded-lg border",
                    evento.nivel_confianca === "COMPLEMENTAR" 
                      ? "bg-muted/30 border-dashed border-border" 
                      : "bg-card/50 border-border"
                  )}>
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-medium text-foreground">
                          {evento.codigo_evento.replace(/_/g, " ")}
                        </span>
                        <Badge variant="outline" className={cn("text-xs", fonte?.color)}>
                          {fonte?.label}
                        </Badge>
                        {evento.nivel_confianca === "COMPLEMENTAR" && (
                          <Badge variant="outline" className="text-xs bg-muted/50">
                            Complementar
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(evento.data_hora_evento), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                    {evento.descricao && (
                      <p className="text-sm text-muted-foreground mt-1">{evento.descricao}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
