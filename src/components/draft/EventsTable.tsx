import { HapagEvent } from "@/types/draft";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[0.72rem] font-medium bg-orange-500/15 text-orange-400 border border-orange-500/25">
          EQUIPMENT
        </span>
      );
    case 'TRANSPORT':
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[0.72rem] font-medium bg-blue-500/15 text-blue-400 border border-blue-500/25">
          TRANSPORT
        </span>
      );
    case 'SHIPMENT':
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[0.72rem] font-medium bg-[#ffc800]/15 text-[#ffc800] border border-[#ffc800]/25">
          SHIPMENT
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[0.72rem] font-medium bg-[rgba(255,255,255,0.05)] text-[#888] border border-[rgba(255,255,255,0.12)]">
          {eventType}
        </span>
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
      <div 
        className="rounded-2xl py-12 text-center backdrop-blur-[18px]"
        style={{
          background: 'rgba(5,6,18,0.9)',
          border: '1px solid rgba(255,255,255,0.12)',
        }}
      >
        <span className="text-[#888] text-[0.85rem]">Nenhum evento encontrado</span>
      </div>
    );
  }

  return (
    <div 
      className="rounded-2xl overflow-hidden backdrop-blur-[18px]"
      style={{
        background: 'rgba(5,6,18,0.9)',
        border: '1px solid rgba(255,255,255,0.12)',
        boxShadow: '0 18px 40px rgba(0,0,0,0.85)'
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-4 border-b border-[rgba(255,255,255,0.08)]">
        <Calendar className="h-5 w-5 text-[#ffc800]" />
        <span className="text-[0.85rem] font-medium text-white">Event Timeline ({events.length} events)</span>
      </div>

      <Table>
        <TableHeader>
          <TableRow className="border-[rgba(255,255,255,0.06)] hover:bg-transparent">
            <TableHead className="text-[#888] text-[0.7rem] uppercase tracking-wider font-medium px-5 py-3">DATE/TIME</TableHead>
            <TableHead className="text-[#888] text-[0.7rem] uppercase tracking-wider font-medium">EVENT TYPE</TableHead>
            <TableHead className="text-[#888] text-[0.7rem] uppercase tracking-wider font-medium">CODE</TableHead>
            <TableHead className="text-[#888] text-[0.7rem] uppercase tracking-wider font-medium">LOCATION</TableHead>
            <TableHead className="text-[#888] text-[0.7rem] uppercase tracking-wider font-medium">CONTAINER</TableHead>
            <TableHead className="text-[#888] text-[0.7rem] uppercase tracking-wider font-medium">EMPTY</TableHead>
            <TableHead className="text-[#888] text-[0.7rem] uppercase tracking-wider font-medium">VESSEL</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedEvents.map((event, index) => (
            <TableRow 
              key={index} 
              className="border-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.03)] transition-colors"
            >
              <TableCell className="px-5 py-3.5 text-white/90 whitespace-nowrap text-[0.82rem]">
                {formatEventDate(event.dateTime)}
              </TableCell>
              <TableCell>
                {getEventTypeBadge(event.eventType)}
              </TableCell>
              <TableCell className="font-medium text-white text-[0.85rem]">
                {event.eventCode || '-'}
              </TableCell>
              <TableCell>
                <div className="text-white font-medium text-[0.85rem]">
                  {event.location || '-'}
                </div>
                {event.facilityName && (
                  <div className="text-[0.72rem] text-[#888]">
                    {event.facilityName}
                  </div>
                )}
              </TableCell>
              <TableCell>
                {event.containerNo ? (
                  <div>
                    <span className="font-mono text-[#ffc800] text-[0.85rem]">{event.containerNo}</span>
                    {event.containerType && (
                      <span className="text-[0.72rem] text-[#888] ml-1.5">
                        ({event.containerType})
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-[#666]">-</span>
                )}
              </TableCell>
              <TableCell>
                {(event as any).emptyIndicator === 'EMPTY' ? (
                  <span className="text-amber-400 text-[0.82rem] font-medium">EMPTY</span>
                ) : (event as any).emptyIndicator === 'LADEN' ? (
                  <span className="text-emerald-400 text-[0.82rem] font-medium">LADEN</span>
                ) : (
                  <span className="text-[#666]">-</span>
                )}
              </TableCell>
              <TableCell>
                {event.vesselName ? (
                  <div>
                    <span className="font-medium text-white text-[0.85rem]">{event.vesselName}</span>
                    {event.voyageNumber && (
                      <span className="text-[0.75rem] text-[#ffc800] ml-1.5">
                        v.{event.voyageNumber}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-[#666]">-</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
