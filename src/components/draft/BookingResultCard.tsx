import { BookingInfo, ApiMetadata } from "@/types/draft";
import { Ship, Copy, Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";

interface BookingResultCardProps {
  bookingInfo: BookingInfo;
  apiMetadata?: ApiMetadata | null;
}

const formatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '-';
  try {
    const date = parseISO(dateStr);
    return format(date, "yyyy-MM-dd");
  } catch {
    return dateStr;
  }
};

const formatDateTime = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '-';
  try {
    const date = parseISO(dateStr);
    return format(date, "dd/MM/yyyy, HH:mm:ss");
  } catch {
    return dateStr;
  }
};

export const BookingResultCard = ({ bookingInfo, apiMetadata }: BookingResultCardProps) => {
  const [copied, setCopied] = useState(false);

  const booking = bookingInfo?.bookingNumber || '-';
  const yourRef = bookingInfo?.yourReference || '-';
  const vessel = bookingInfo?.vesselName || '-';
  const polCode = bookingInfo?.originCode || '';
  const polName = bookingInfo?.originLocation || '-';
  const podCode = bookingInfo?.destinationCode || '';
  const podName = bookingInfo?.destinationLocation || '-';
  const etd = bookingInfo?.etd;
  const eta = bookingInfo?.eta;
  const containerType = bookingInfo?.containerType || '-';
  const commodity = bookingInfo?.commodity || '-';
  const status = bookingInfo?.documentStatus || 'Unknown';

  const handleCopyTransactionId = () => {
    if (apiMetadata?.transactionId) {
      navigator.clipboard.writeText(apiMetadata.transactionId);
      setCopied(true);
      toast.success('Transaction ID copiado!');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getStatusColor = (status: string) => {
    const s = status.toLowerCase();
    if (s.includes('completed') || s.includes('delivered')) {
      return 'border-green-500 text-green-500';
    }
    if (s.includes('transit') || s.includes('progress')) {
      return 'border-yellow-500 text-yellow-500';
    }
    if (s.includes('pending') || s.includes('draft')) {
      return 'border-orange-500 text-orange-500';
    }
    return 'border-primary text-primary';
  };

  return (
    <div className="space-y-4">
      {/* Booking Info Header */}
      <div className="bg-[hsl(var(--card))]/60 border border-border rounded-lg p-4">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr_1fr] gap-6 items-center">
          {/* Left - Booking Info */}
          <div>
            <div className="text-xs text-muted-foreground mb-1">Booking No.</div>
            <div className="text-xl font-bold text-foreground">{booking}</div>
            <div className="text-xs text-muted-foreground mt-2">Your Reference</div>
            <div className="text-sm text-foreground">{yourRef}</div>
          </div>

          {/* Center - Route Visualization */}
          <div className="flex items-center justify-center gap-2">
            {/* Origin */}
            <div className="text-right">
              <div className="w-3 h-3 rounded-full bg-green-500 ml-auto" />
            </div>
            <div className="flex-1 relative h-0.5 bg-primary/30 max-w-[200px]">
              <div className="absolute left-0 top-0 h-full w-1/2 bg-primary" />
            </div>
            
            {/* Ship Icon */}
            <div className="flex-shrink-0 bg-primary/20 p-2 rounded-lg">
              <Ship className="h-6 w-6 text-primary" />
            </div>
            
            <div className="flex-1 relative h-0.5 bg-primary/30 max-w-[200px]">
              <div className="absolute right-0 top-0 h-full w-0 bg-primary" />
            </div>
            {/* Destination */}
            <div className="text-left">
              <div className="w-3 h-3 rounded-full bg-primary" />
            </div>
          </div>

          {/* Right - Container & Status */}
          <div className="text-right lg:text-left">
            <div className="text-xs text-muted-foreground mb-1">Containers</div>
            <div className="text-lg font-bold text-foreground">{containerType}</div>
            <div className="text-xs text-muted-foreground mt-2">Commodity</div>
            <div className="text-sm text-foreground">{commodity}</div>
          </div>
        </div>

        {/* Route Names Row */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr_1fr] gap-6 mt-2">
          <div />
          <div className="flex justify-between text-center px-4">
            <div>
              <div className="text-sm font-medium text-foreground">
                ({polCode}) {polName}
              </div>
              <div className="text-xs text-primary">
                ETD: {formatDate(etd)}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-foreground">
                ({podCode}) {podName}
              </div>
              <div className="text-xs text-primary">
                ETA: {formatDate(eta)}
              </div>
            </div>
          </div>
          <div className="flex justify-end lg:justify-start">
            <div className="text-xs text-muted-foreground">Document Status</div>
          </div>
        </div>

        {/* Status Badge */}
        <div className="flex justify-end mt-2">
          <Badge 
            variant="outline" 
            className={`${getStatusColor(status)} border-2 font-semibold px-4 py-1`}
          >
            {status}
          </Badge>
        </div>
      </div>

      {/* API Metadata - Informações da Consulta */}
      {apiMetadata && (
        <div className="bg-[hsl(var(--card))]/60 border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-sm font-medium text-foreground">Informações da Consulta</span>
            <span className="text-xs text-muted-foreground">(Prova de Autenticidade)</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
            {/* Transaction ID */}
            <div>
              <div className="flex items-center gap-1 text-xs text-primary mb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                TRANSACTION ID
              </div>
              <div className="flex items-center gap-2">
                <code className="text-xs font-mono text-foreground bg-muted/50 px-2 py-1 rounded">
                  {apiMetadata.transactionId?.substring(0, 20)}...
                </code>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6"
                  onClick={handleCopyTransactionId}
                >
                  {copied ? (
                    <Check className="h-3 w-3 text-green-500" />
                  ) : (
                    <Copy className="h-3 w-3 text-muted-foreground" />
                  )}
                </Button>
              </div>
              <div className="text-xs text-muted-foreground mt-1">Hash único da Hapag-Lloyd</div>
            </div>

            {/* Server DateTime */}
            <div>
              <div className="flex items-center gap-1 text-xs text-blue-400 mb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                DATA/HORA SERVIDOR
              </div>
              <div className="font-medium text-foreground">
                {formatDateTime(apiMetadata.serverDateTime)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">Timestamp do servidor da API</div>
            </div>

            {/* Client DateTime */}
            <div>
              <div className="flex items-center gap-1 text-xs text-purple-400 mb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                DATA/HORA CONSULTA
              </div>
              <div className="font-medium text-foreground">
                {formatDateTime(apiMetadata.clientDateTime)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">Quando você consultou</div>
            </div>

            {/* API Endpoint */}
            <div>
              <div className="flex items-center gap-1 text-xs text-green-400 mb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                API ENDPOINT
              </div>
              <a 
                href={apiMetadata.apiEndpoint || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline flex items-center gap-1"
              >
                api.hlag.com/...
                <ExternalLink className="h-3 w-3" />
              </a>
              <div className="text-xs text-muted-foreground mt-1">URL oficial consultada</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
