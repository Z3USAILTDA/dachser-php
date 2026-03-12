import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Clock, 
  CheckCircle, 
  AlertTriangle, 
  PlaneTakeoff, 
  PlaneLanding, 
  Package, 
  Truck, 
  Send, 
  ShieldAlert, 
  FileCheck,
  ClipboardCheck,
  MapPin,
  Unlock
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { CCTEvento, FonteEvento, NivelConfianca } from "@/types/cct";
import { compareCCTEventsByRecency } from "@/utils/cctStatusResolver";

interface EventTimelineProps {
  eventos: CCTEvento[];
}

// Configuração de fonte/origem do evento
const fonteConfig: Record<string, { label: string; color: string }> = {
  LEADCOMEX: { label: "LeadComex", color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30" },
  HANDLER: { label: "Handler", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  RFB: { label: "RFB", color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  MANUAL: { label: "Manual", color: "bg-gray-500/20 text-gray-400 border-gray-500/30" },
  TRACKING: { label: "Tracking", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
};

// Função para obter ícone baseado no código do evento
const getEventIcon = (codigo: string) => {
  const upperCode = codigo?.toUpperCase() || '';
  
  // DEP / Aguardando
  if (upperCode.includes('DEP') || upperCode === 'AGUARDANDO_EMBARQUE' || upperCode === 'AGUARDANDO_MANIFESTACAO' || upperCode === 'AGUARDANDO') {
    return PlaneTakeoff;
  }
  
  // Manifestado / Check
  if (upperCode === 'MANIFESTADO' || upperCode.includes('MAN')) {
    return ClipboardCheck;
  }
  
  // Área de transferência / Pacote
  if (upperCode === 'AREA_TRANSFERENCIA' || upperCode.includes('RCF') || upperCode.includes('NFD') || upperCode.includes('DESCARREGAMENTO')) {
    return Package;
  }
  
  // Em voo
  if (upperCode === 'EM_VOO' || upperCode.includes('ARR') === false && upperCode.includes('DEP')) {
    return Send;
  }
  
  // Chegada / Pouso
  if (upperCode === 'CHEGADA_INFORMADA' || upperCode === 'CHEGADA_AERONAVE' || upperCode.includes('ARR')) {
    return PlaneLanding;
  }
  
  // Recepcionado / Check
  if (upperCode === 'RECEPCIONADO' || upperCode.includes('RCS') || upperCode.includes('PC') || upperCode.includes('DI_REGISTRADA')) {
    return FileCheck;
  }
  
  // Em trânsito / Entrega
  if (upperCode === 'EM_TRANSITO' || upperCode.includes('DLV') || upperCode === 'ENTREGUE') {
    return Truck;
  }
  
  // Desembaraço / Liberado
  if (upperCode === 'DESEMBARACO' || upperCode === 'LIBERADO') {
    return CheckCircle;
  }
  
  // Bloqueio / Erro
  if (upperCode === 'BLOQUEIO' || upperCode === 'DISCREPANCIA' || upperCode.includes('DIS') || upperCode.includes('OFLD')) {
    return ShieldAlert;
  }
  
  // Desbloqueio - carga liberada
  if (upperCode === 'DESBLOQUEIO') {
    return Unlock;
  }
  
  return Clock;
};

// Função para obter cor baseada no código do evento
const getEventColor = (codigo: string) => {
  const upperCode = codigo?.toUpperCase() || '';
  
  // 🔴 Erros/Bloqueios
  if (upperCode === 'BLOQUEIO' || upperCode === 'DISCREPANCIA' || upperCode.includes('DIS') || upperCode.includes('OFLD') || upperCode.includes('ERR')) {
    return {
      dot: "border-red-500 bg-red-500",
      icon: "text-red-400",
      card: "border-red-500/30 bg-red-500/5"
    };
  }
  
  // 🟢 Desbloqueios (carga liberada)
  if (upperCode === 'DESBLOQUEIO') {
    return {
      dot: "border-emerald-500 bg-emerald-500",
      icon: "text-emerald-400",
      card: "border-emerald-500/30 bg-emerald-500/5"
    };
  }
  
  // 🟢 Concluídos / Entregue
  if (upperCode === 'ENTREGUE' || upperCode === 'LIBERADO' || upperCode === 'DESEMBARACO' || upperCode.includes('DLV')) {
    return {
      dot: "border-emerald-500 bg-emerald-500",
      icon: "text-emerald-400",
      card: "border-emerald-500/30 bg-emerald-500/5"
    };
  }
  
  // 🔵 Manifestado/Processando
  if (upperCode === 'MANIFESTADO' || upperCode === 'RECEPCIONADO' || upperCode === 'AREA_TRANSFERENCIA' || upperCode.includes('RCF') || upperCode.includes('RCS')) {
    return {
      dot: "border-blue-500 bg-blue-500",
      icon: "text-blue-400",
      card: "border-blue-500/30 bg-blue-500/5"
    };
  }
  
  // 🟡 Em trânsito / Chegada
  if (upperCode === 'EM_VOO' || upperCode === 'EM_TRANSITO' || upperCode === 'CHEGADA_INFORMADA' || upperCode.includes('ARR') || upperCode.includes('NFD')) {
    return {
      dot: "border-yellow-500 bg-yellow-500",
      icon: "text-yellow-400",
      card: "border-yellow-500/30 bg-yellow-500/5"
    };
  }
  
  // ⚪ DEP inicial / Aguardando
  if (upperCode === 'AGUARDANDO_EMBARQUE' || upperCode === 'AGUARDANDO_MANIFESTACAO' || upperCode === 'AGUARDANDO' || upperCode.includes('DEP')) {
    return {
      dot: "border-gray-500 bg-gray-500",
      icon: "text-gray-400",
      card: "border-gray-500/30 bg-gray-500/5"
    };
  }
  
  // Default - Amarelo/Primary
  return {
    dot: "border-[#ffc800] bg-[#ffc800]",
    icon: "text-[#ffc800]",
    card: "border-[#ffc800]/30 bg-[#ffc800]/5"
  };
};

// Formatar código de evento para exibição
const formatEventCode = (codigo: string) => {
  if (!codigo) return 'Evento';
  return codigo.replace(/_/g, ' ');
};

export function EventTimeline({ eventos }: EventTimelineProps) {
  if (!eventos || eventos.length === 0) {
    return (
      <div className="p-10 text-center">
        <Clock className="h-12 w-12 text-[#666] mx-auto mb-4" />
        <p className="text-[#888]">Nenhum evento registrado</p>
        <p className="text-[#555] text-sm mt-2">Os eventos aparecerão aqui conforme forem rastreados</p>
      </div>
    );
  }

  // Ordenar eventos por data DESC (mais recente primeiro) e remover duplicados
  // Para BLOQUEIO/DESBLOQUEIO: manter todos (cada um tem motivo diferente)
  // Para outros: manter apenas a primeira ocorrência de cada código (a mais recente)
  const sortedEventos = [...eventos]
    .sort((a, b) => new Date(b.data_hora_evento).getTime() - new Date(a.data_hora_evento).getTime())
    .filter((evento, index, arr) => {
      const code = evento.codigo_evento?.toUpperCase() || '';
      // Keep all BLOQUEIO/DESBLOQUEIO events (each has a different reason)
      if (code === 'BLOQUEIO' || code === 'DESBLOQUEIO') return true;
      return arr.findIndex(e => e.codigo_evento === evento.codigo_evento) === index;
    });

  return (
    <div className="p-4">
      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-[rgba(255,255,255,0.1)]" />

        {/* Events */}
        <div className="space-y-4">
          {sortedEventos.map((evento, index) => {
            const fonte = fonteConfig[evento.fonte] || fonteConfig.TRACKING;
            const isLatest = index === 0;
            const colors = getEventColor(evento.codigo_evento);
            const EventIcon = getEventIcon(evento.codigo_evento);

            return (
              <div 
                key={evento.id} 
                className="relative pl-14 animate-fade-in"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                {/* Timeline dot with icon */}
                <div
                  className={cn(
                    "absolute left-3 w-6 h-6 rounded-full border-2 flex items-center justify-center",
                    colors.dot,
                    isLatest && "ring-4 ring-[#ffc800]/20"
                  )}
                >
                  <EventIcon className={cn("h-3 w-3", "text-white")} />
                </div>

                {/* Event content card */}
                <div className={cn(
                  "p-4 rounded-lg border transition-all hover:bg-[rgba(255,255,255,0.02)]",
                  "bg-[rgba(255,255,255,0.03)]", colors.card
                )}>
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    {/* Left side - Event info */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn("font-mono font-medium", colors.icon)}>
                        {formatEventCode(evento.codigo_evento)}
                      </span>
                      <Badge variant="outline" className={cn("text-xs", fonte.color)}>
                        {fonte.label}
                      </Badge>
                    </div>
                    
                    {/* Right side - Date and Time */}
                    <div className="text-right">
                      <span className="text-sm text-white font-medium">
                        {format(new Date(evento.data_hora_evento), "dd/MM/yyyy", { locale: ptBR })}
                      </span>
                      <span className="text-xs text-[#888] ml-2">
                        {format(new Date(evento.data_hora_evento), "HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                  </div>
                  
                  {/* Description - structured for bloqueio/desbloqueio */}
                  {evento.descricao && evento.descricao !== evento.codigo_evento && (() => {
                    const isBloqueio = evento.codigo_evento?.toUpperCase() === 'BLOQUEIO';
                    const isDesbloqueio = evento.codigo_evento?.toUpperCase() === 'DESBLOQUEIO';
                    const hasPipe = evento.descricao.includes(' | ');
                    
                    if ((isBloqueio || isDesbloqueio) && hasPipe) {
                      const parts = evento.descricao.split(' | ');
                      const motivo = parts[0];
                      const extras = parts.slice(1);
                      const colorClass = isBloqueio ? 'text-red-400' : 'text-emerald-400';
                      
                      return (
                        <div className="mt-2 space-y-1">
                          <p className={cn("text-sm font-medium", colorClass)}>{motivo}</p>
                          {extras.map((extra, i) => (
                            <p key={i} className="text-xs text-[#888]">{extra}</p>
                          ))}
                        </div>
                      );
                    }
                    
                    return (
                      <p className={cn(
                        "text-sm mt-2",
                        isBloqueio ? "text-red-400 font-medium" 
                          : isDesbloqueio ? "text-emerald-400 font-medium"
                          : "text-[#aaa]"
                      )}>
                        {evento.descricao}
                      </p>
                    );
                  })()}
                  
                  {/* Motivo do bloqueio - fallback when descricao equals codigo */}
                  {evento.codigo_evento?.toUpperCase() === 'BLOQUEIO' && (!evento.descricao || evento.descricao === evento.codigo_evento || evento.descricao === 'BLOQUEIO') && (
                    <p className="text-sm text-red-400/70 mt-2 italic">Motivo não informado</p>
                  )}
                  
                  {/* Aeroporto */}
                  {evento.aeroporto && (
                    <div className="flex items-center gap-1 mt-2 text-xs text-[#666]">
                      <MapPin className="h-3 w-3" />
                      <span>{evento.aeroporto}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
