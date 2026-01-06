import { BookingInfo, ApiMetadata } from "@/types/draft";
import { Ship, Copy, Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    if (s.includes('completed') || s.includes('delivered') || s.includes('approved')) {
      return 'border-emerald-500 text-emerald-400 bg-emerald-500/10';
    }
    if (s.includes('transit') || s.includes('progress')) {
      return 'border-amber-500 text-amber-400 bg-amber-500/10';
    }
    if (s.includes('pending') || s.includes('draft')) {
      return 'border-orange-500 text-orange-400 bg-orange-500/10';
    }
    return 'border-[#ffc800] text-[#ffc800] bg-[#ffc800]/10';
  };

  return (
    <div className="space-y-4">
      {/* Booking Info Card - Dachser Style */}
      <div 
        className="rounded-2xl p-6 backdrop-blur-[18px]"
        style={{
          background: 'rgba(5,6,18,0.9)',
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 18px 40px rgba(0,0,0,0.85)'
        }}
      >
        <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr_200px_200px] gap-6 items-start">
          {/* Col 1 - Booking Info (200px) */}
          <div className="space-y-4">
            <div>
              <div className="text-[0.7rem] text-[#888] uppercase tracking-wider mb-1">Booking No.</div>
              <div className="text-2xl font-bold text-white">{booking}</div>
            </div>
            <div>
              <div className="text-[0.7rem] text-[#888] uppercase tracking-wider mb-1">Your Reference</div>
              <div className="text-[0.9rem] text-white/90 break-all">{yourRef}</div>
            </div>
          </div>

          {/* Col 2 - Journey Timeline (flex) */}
          <div className="flex flex-col items-center justify-center py-4">
            <div className="flex items-center w-full">
              {/* Origin Dot */}
              <div className="flex flex-col items-center">
                <div className="w-4 h-4 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20" />
              </div>
              
              {/* Line to ship */}
              <div className="flex-1 h-0.5 bg-gradient-to-r from-emerald-500 to-[#ffc800]" />
              
              {/* Ship Icon */}
              <div className="flex-shrink-0 bg-[#ffc800]/20 p-3 rounded-xl border border-[#ffc800]/30">
                <Ship className="h-6 w-6 text-[#ffc800]" />
              </div>
              
              {/* Line to destination */}
              <div className="flex-1 h-0.5 bg-gradient-to-r from-[#ffc800] to-[#ffc800]/30" />
              
              {/* Destination Dot */}
              <div className="flex flex-col items-center">
                <div className="w-4 h-4 rounded-full bg-[#ffc800] ring-4 ring-[#ffc800]/20" />
              </div>
            </div>

            {/* Route Names */}
            <div className="flex justify-between w-full mt-4">
              <div className="text-left">
                <div className="text-[0.85rem] font-medium text-white">
                  {polCode && `(${polCode})`} {polName}
                </div>
                <div className="text-[0.75rem] text-emerald-400 mt-0.5">
                  ETD: {formatDate(etd)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[0.85rem] font-medium text-white">
                  {podCode && `(${podCode})`} {podName}
                </div>
                <div className="text-[0.75rem] text-[#ffc800] mt-0.5">
                  ETA: {formatDate(eta)}
                </div>
              </div>
            </div>

            {/* Vessel Info */}
            <div className="mt-3 text-center">
              <span className="text-[0.75rem] text-[#888]">Vessel: </span>
              <span className="text-[0.85rem] text-[#ffc800] font-medium">{vessel}</span>
            </div>
          </div>

          {/* Col 3 - Containers & Commodity (200px) */}
          <div className="space-y-4">
            <div>
              <div className="text-[0.7rem] text-[#888] uppercase tracking-wider mb-1">Containers</div>
              <div className="text-xl font-bold text-white">{containerType}</div>
            </div>
            <div>
              <div className="text-[0.7rem] text-[#888] uppercase tracking-wider mb-1">Commodity</div>
              <div className="text-[0.9rem] text-white/90">{commodity}</div>
            </div>
          </div>

          {/* Col 4 - Document Status (200px) */}
          <div className="space-y-2 lg:text-right">
            <div className="text-[0.7rem] text-[#888] uppercase tracking-wider mb-2">Document Status</div>
            <span 
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full border-2 text-[0.85rem] font-semibold ${getStatusColor(status)}`}
            >
              {status.toLowerCase().includes('approved') && <Check className="h-4 w-4" />}
              {status}
            </span>
          </div>
        </div>
      </div>

      {/* API Metadata - Informações da Consulta - Dachser Style */}
      {apiMetadata && (
        <div 
          className="rounded-2xl p-5 backdrop-blur-[18px]"
          style={{
            background: 'rgba(5,6,18,0.9)',
            border: '1px solid rgba(255,255,255,0.12)',
            boxShadow: '0 18px 40px rgba(0,0,0,0.85)'
          }}
        >
          <div className="flex items-center gap-2 mb-5">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[0.85rem] font-medium text-white">Informações da Consulta</span>
            <span className="text-[0.72rem] text-[#666]">(Prova de Autenticidade)</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Transaction ID */}
            <div>
              <div className="flex items-center gap-1.5 text-[0.68rem] text-[#ffc800] uppercase tracking-wider mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#ffc800]" />
                TRANSACTION ID
              </div>
              <div className="flex items-center gap-2">
                <code className="text-[0.75rem] font-mono text-white bg-[rgba(0,0,0,0.5)] px-2.5 py-1.5 rounded-lg border border-[rgba(255,255,255,0.08)]">
                  {apiMetadata.transactionId?.substring(0, 18)}...
                </code>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7 rounded-lg bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.1)]"
                  onClick={handleCopyTransactionId}
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-[#888]" />
                  )}
                </Button>
              </div>
              <div className="text-[0.68rem] text-[#666] mt-1.5">Hash único da Hapag-Lloyd</div>
            </div>

            {/* Server DateTime */}
            <div>
              <div className="flex items-center gap-1.5 text-[0.68rem] text-blue-400 uppercase tracking-wider mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                DATA/HORA SERVIDOR
              </div>
              <div className="text-[0.85rem] font-medium text-white">
                {formatDateTime(apiMetadata.serverDateTime)}
              </div>
              <div className="text-[0.68rem] text-[#666] mt-1.5">Timestamp do servidor da API</div>
            </div>

            {/* Client DateTime */}
            <div>
              <div className="flex items-center gap-1.5 text-[0.68rem] text-purple-400 uppercase tracking-wider mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                DATA/HORA CONSULTA
              </div>
              <div className="text-[0.85rem] font-medium text-white">
                {formatDateTime(apiMetadata.clientDateTime)}
              </div>
              <div className="text-[0.68rem] text-[#666] mt-1.5">Quando você consultou</div>
            </div>

            {/* API Endpoint */}
            <div>
              <div className="flex items-center gap-1.5 text-[0.68rem] text-emerald-400 uppercase tracking-wider mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                API ENDPOINT
              </div>
              <a 
                href={apiMetadata.apiEndpoint || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[0.85rem] text-[#ffc800] hover:text-[#ffdc50] flex items-center gap-1.5 transition-colors"
              >
                api.hlag.com/...
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <div className="text-[0.68rem] text-[#666] mt-1.5">URL oficial consultada</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
