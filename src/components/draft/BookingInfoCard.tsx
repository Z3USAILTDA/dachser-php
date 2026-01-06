import { BookingInfo, TrackingData } from "@/types/draft";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrackingStatusBadge } from "./TrackingStatusBadge";
import { Ship, MapPin, Calendar, FileText, Anchor } from "lucide-react";

interface BookingInfoCardProps {
  bookingInfo?: BookingInfo | null;
  trackingData?: TrackingData | null;
}

export const BookingInfoCard = ({ bookingInfo, trackingData }: BookingInfoCardProps) => {
  // Use bookingInfo if available, otherwise fall back to trackingData
  const booking = bookingInfo?.bookingReference || trackingData?.booking || '-';
  const mbl = bookingInfo?.transportDocumentReference || trackingData?.mbl_id || '-';
  const vessel = bookingInfo?.vesselName || trackingData?.navio || '-';
  const voyage = bookingInfo?.voyage || trackingData?.voyage || '-';
  const polCode = bookingInfo?.polCode || '';
  const polName = bookingInfo?.polName || trackingData?.origem || '-';
  const podCode = bookingInfo?.podCode || '';
  const podName = bookingInfo?.podName || trackingData?.destino || '-';
  const etd = bookingInfo?.etd || trackingData?.etd || '-';
  const eta = bookingInfo?.eta || trackingData?.eta || '-';
  const status = bookingInfo?.documentStatus || 
    (trackingData?.status_armador as any) || 
    'Unknown';

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr || dateStr === '-') return '-';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('pt-BR');
    } catch {
      return dateStr;
    }
  };

  return (
    <Card className="bg-card/50 border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Informações do Booking
          </CardTitle>
          <TrackingStatusBadge status={status} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {/* Booking */}
          <div>
            <div className="text-xs text-muted-foreground mb-1">Booking</div>
            <div className="font-medium text-foreground">{booking}</div>
          </div>

          {/* MBL */}
          <div>
            <div className="text-xs text-muted-foreground mb-1">MBL</div>
            <div className="font-medium text-foreground font-mono text-sm">{mbl}</div>
          </div>

          {/* Vessel & Voyage */}
          <div>
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <Ship className="h-3 w-3" />
              Navio / Viagem
            </div>
            <div className="font-medium text-foreground">
              {vessel} / {voyage}
            </div>
          </div>

          {/* Origin */}
          <div>
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <Anchor className="h-3 w-3" />
              Origem (POL)
            </div>
            <div className="font-medium text-foreground">
              {polName}
              {polCode && <span className="text-xs text-muted-foreground ml-1">({polCode})</span>}
            </div>
          </div>

          {/* Destination */}
          <div>
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              Destino (POD)
            </div>
            <div className="font-medium text-foreground">
              {podName}
              {podCode && <span className="text-xs text-muted-foreground ml-1">({podCode})</span>}
            </div>
          </div>

          {/* ETD/ETA */}
          <div>
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              ETD / ETA
            </div>
            <div className="font-medium text-foreground">
              {formatDate(etd)} → {formatDate(eta)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
