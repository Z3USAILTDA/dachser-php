import { HapagEvent } from "@/types/draft";
import { Package, Ship, FileText, MapPin } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface DraftEventTimelineProps {
  events: HapagEvent[];
}

const eventTypeConfig: Record<string, {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
}> = {
  'EQUIPMENT': {
    icon: Package,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/20'
  },
  'TRANSPORT': {
    icon: Ship,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20'
  },
  'SHIPMENT': {
    icon: FileText,
    color: 'text-green-400',
    bgColor: 'bg-green-500/20'
  }
};

const getEventCode = (event: HapagEvent): string => {
  return event.equipmentEventTypeCode || 
         event.transportEventTypeCode || 
         event.shipmentEventTypeCode || 
         'N/A';
};

const getEventDescription = (event: HapagEvent): string => {
  const code = getEventCode(event);
  const descriptions: Record<string, string> = {
    'GTOT': 'Gate Out from Terminal',
    'GTIN': 'Gate In to Terminal',
    'LOAD': 'Loaded on Vessel',
    'DISC': 'Discharged from Vessel',
    'DEPA': 'Departure',
    'ARRI': 'Arrival',
    'CONF': 'Confirmed',
    'ISSU': 'Issued'
  };
  return descriptions[code] || code;
};

const getLocationInfo = (event: HapagEvent): string => {
  const location = event.eventLocation || event.transportCall?.location;
  if (!location) return '';
  
  const name = location.locationName || '';
  const code = location.UNLocationCode || '';
  
  if (name && code) return `${name} (${code})`;
  return name || code;
};

const formatEventDate = (dateStr: string): string => {
  try {
    const date = parseISO(dateStr);
    return format(date, "dd/MM/yyyy HH:mm", { locale: ptBR });
  } catch {
    return dateStr;
  }
};

export const DraftEventTimeline = ({ events }: DraftEventTimelineProps) => {
  // Sort events by date (most recent first)
  const sortedEvents = [...events].sort((a, b) => 
    new Date(b.eventDateTime).getTime() - new Date(a.eventDateTime).getTime()
  );

  if (events.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Nenhum evento encontrado
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sortedEvents.map((event, index) => {
        const config = eventTypeConfig[event.eventType] || eventTypeConfig['SHIPMENT'];
        const Icon = config.icon;
        const location = getLocationInfo(event);

        return (
          <div key={index} className="flex gap-4">
            {/* Timeline indicator */}
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full ${config.bgColor} flex items-center justify-center`}>
                <Icon className={`h-4 w-4 ${config.color}`} />
              </div>
              {index < sortedEvents.length - 1 && (
                <div className="w-0.5 h-full bg-border mt-2" />
              )}
            </div>

            {/* Event content */}
            <div className="flex-1 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-foreground">
                  {getEventCode(event)}
                </span>
                <span className="text-sm text-muted-foreground">
                  {getEventDescription(event)}
                </span>
              </div>
              
              <div className="text-xs text-muted-foreground">
                {formatEventDate(event.eventDateTime)}
              </div>

              {location && (
                <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  {location}
                </div>
              )}

              {event.equipmentReference && (
                <div className="mt-1 text-xs text-muted-foreground">
                  Container: {event.equipmentReference}
                  {event.ISOEquipmentCode && ` (${event.ISOEquipmentCode})`}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
