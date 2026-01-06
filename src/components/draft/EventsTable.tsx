import { HapagEvent } from "@/types/draft";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "lucide-react";
import { format, parseISO } from "date-fns";

interface EventsTableProps {
  events: HapagEvent[];
}

const formatEventDate = (dateStr: string | undefined): string => {
  if (!dateStr) return '-';
  try {
    const date = parseISO(dateStr);
    return format(date, "dd/MM/yyyy, HH:mm:ss");
  } catch {
    return dateStr;
  }
};

const getEventTypeBadge = (eventType: string) => {
  switch (eventType) {
    case 'EQUIPMENT':
      return (
        <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 hover:bg-orange-500/30">
          EQUIPMENT
        </Badge>
      );
    case 'TRANSPORT':
      return (
        <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 hover:bg-blue-500/30">
          TRANSPORT
        </Badge>
      );
    case 'SHIPMENT':
      return (
        <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/30">
          SHIPMENT
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="text-muted-foreground">
          {eventType}
        </Badge>
      );
  }
};

export const EventsTable = ({ events }: EventsTableProps) => {
  // Sort events by date (most recent first)
  const sortedEvents = [...events].sort((a, b) => 
    new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime()
  );

  if (events.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Nenhum evento encontrado
      </div>
    );
  }

  return (
    <div className="bg-[hsl(var(--card))]/60 border border-border rounded-lg">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Calendar className="h-5 w-5 text-primary" />
        <span className="font-medium text-foreground">Event Timeline ({events.length} events)</span>
      </div>

      <Table>
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            <TableHead className="text-muted-foreground text-xs font-medium uppercase tracking-wider">DATE/TIME</TableHead>
            <TableHead className="text-muted-foreground text-xs font-medium uppercase tracking-wider">EVENT TYPE</TableHead>
            <TableHead className="text-muted-foreground text-xs font-medium uppercase tracking-wider">CODE</TableHead>
            <TableHead className="text-muted-foreground text-xs font-medium uppercase tracking-wider">LOCATION</TableHead>
            <TableHead className="text-muted-foreground text-xs font-medium uppercase tracking-wider">CONTAINER</TableHead>
            <TableHead className="text-muted-foreground text-xs font-medium uppercase tracking-wider">VESSEL</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedEvents.map((event, index) => (
            <TableRow key={index} className="border-border hover:bg-muted/30">
              <TableCell className="text-foreground whitespace-nowrap">
                {formatEventDate(event.dateTime)}
              </TableCell>
              <TableCell>
                {getEventTypeBadge(event.eventType)}
              </TableCell>
              <TableCell className="font-medium text-foreground">
                {event.eventCode || '-'}
              </TableCell>
              <TableCell>
                <div className="text-foreground font-medium">
                  {event.location || '-'}
                </div>
                {event.facilityName && (
                  <div className="text-xs text-muted-foreground">
                    {event.facilityName}
                  </div>
                )}
              </TableCell>
              <TableCell>
                {event.containerNo ? (
                  <div>
                    <span className="font-mono text-primary">{event.containerNo}</span>
                    {event.containerType && (
                      <span className="text-xs text-muted-foreground ml-1">
                        ({event.containerType})
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </TableCell>
              <TableCell>
                {event.vesselName ? (
                  <div>
                    <span className="font-medium text-foreground">{event.vesselName}</span>
                    {event.voyageNumber && (
                      <span className="text-xs text-primary ml-1">
                        v.{event.voyageNumber}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
