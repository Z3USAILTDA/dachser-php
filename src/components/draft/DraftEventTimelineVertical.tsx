import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Ship, MapPin, Package, Clock } from "lucide-react";

interface TrackingEvent {
  eventDateTime?: string;
  eventType?: string;
  eventClassifierCode?: string;
  transportEventTypeCode?: string;
  equipmentEventTypeCode?: string;
  shipmentEventTypeCode?: string;
  description?: string;
  location?: {
    locationName?: string;
    UNLocationCode?: string;
    facilityCode?: string;
    facilityCodeListProvider?: string;
  };
  vessel?: {
    name?: string;
    IMONumber?: string;
  };
  voyageNumber?: string;
  equipmentReference?: string;
  ISOEquipmentCode?: string;
  emptyIndicator?: string;
}

interface DraftEventTimelineVerticalProps {
  events: TrackingEvent[];
}

export const DraftEventTimelineVertical = ({ events }: DraftEventTimelineVerticalProps) => {
  const formatDate = (dateStr: string | undefined): string => {
    if (!dateStr) return "N/A";
    try {
      return format(parseISO(dateStr), "dd/MM/yyyy HH:mm", { locale: ptBR });
    } catch {
      return dateStr;
    }
  };

  const getEventTypeColor = (type: string | undefined): string => {
    switch (type?.toUpperCase()) {
      case 'EQUIPMENT':
        return 'bg-purple-500';
      case 'TRANSPORT':
        return 'bg-blue-500';
      case 'SHIPMENT':
        return 'bg-emerald-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getEventCode = (event: TrackingEvent): string => {
    return event.transportEventTypeCode || 
           event.equipmentEventTypeCode || 
           event.shipmentEventTypeCode || 
           event.eventClassifierCode || 
           'N/A';
  };

  if (!events || events.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        Nenhum evento disponível
      </div>
    );
  }

  return (
    <div className="max-h-96 overflow-y-auto pr-2 space-y-0">
      {events.map((event, index) => {
        const isLast = index === events.length - 1;
        const eventCode = getEventCode(event);
        
        return (
          <div key={index} className="relative flex gap-4">
            {/* Timeline Line and Dot */}
            <div className="flex flex-col items-center">
              <div className={`w-3 h-3 rounded-full ${getEventTypeColor(event.eventType)} ring-4 ring-background z-10`} />
              {!isLast && (
                <div className="w-0.5 h-full bg-border flex-1 min-h-[60px]" />
              )}
            </div>

            {/* Event Content */}
            <div className={`flex-1 pb-6 ${isLast ? '' : ''}`}>
              <div className="bg-card/50 border border-border rounded-lg p-3 space-y-2">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium text-white ${getEventTypeColor(event.eventType)}`}>
                      {event.eventType || 'EVENT'}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {eventCode}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {formatDate(event.eventDateTime)}
                  </div>
                </div>

                {/* Description */}
                {event.description && (
                  <p className="text-sm text-foreground/80">{event.description}</p>
                )}

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {/* Location */}
                  {event.location?.locationName && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <MapPin className="h-3 w-3 text-amber-400" />
                      <span>{event.location.locationName}</span>
                      {event.location.UNLocationCode && (
                        <span className="text-muted-foreground/60">({event.location.UNLocationCode})</span>
                      )}
                    </div>
                  )}

                  {/* Vessel */}
                  {event.vessel?.name && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Ship className="h-3 w-3 text-blue-400" />
                      <span>{event.vessel.name}</span>
                      {event.voyageNumber && (
                        <span className="text-muted-foreground/60">v.{event.voyageNumber}</span>
                      )}
                    </div>
                  )}

                  {/* Container */}
                  {event.equipmentReference && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Package className="h-3 w-3 text-emerald-400" />
                      <span className="font-mono">{event.equipmentReference}</span>
                      {event.ISOEquipmentCode && (
                        <span className="text-muted-foreground/60">{event.ISOEquipmentCode}</span>
                      )}
                    </div>
                  )}

                  {/* Empty Indicator */}
                  {event.emptyIndicator && (
                    <div className="flex items-center gap-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-xs ${
                        event.emptyIndicator === 'EMPTY' 
                          ? 'bg-amber-500/20 text-amber-400' 
                          : 'bg-emerald-500/20 text-emerald-400'
                      }`}>
                        {event.emptyIndicator}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
