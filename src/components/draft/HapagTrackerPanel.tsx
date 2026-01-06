import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Search, Save, Loader2, Package, AlertCircle, Ship, Fingerprint, FileText, Container } from "lucide-react";
import { BookingResultCard } from "./BookingResultCard";
import { ContainersTable } from "./ContainersTable";
import { EventsTable } from "./EventsTable";
import { TrackingApiResponse, ContainerInfo, HapagEvent } from "@/types/draft";

interface HapagTrackerPanelProps {
  onSave?: () => void;
}

type SearchType = 'booking' | 'BL' | 'container';

export const HapagTrackerPanel = ({ onSave }: HapagTrackerPanelProps) => {
  const [searchType, setSearchType] = useState<SearchType>('booking');
  const [searchValue, setSearchValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [result, setResult] = useState<TrackingApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!searchValue.trim()) {
      toast.error('Digite um valor para buscar');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('draft-track-hapag-multi', {
        body: { searchType, searchValue: searchValue.trim() }
      });

      if (fnError) throw fnError;

      if (data?.success) {
        setResult(data as TrackingApiResponse);
        toast.success('Consulta realizada com sucesso');
      } else {
        setError(data?.error || 'Erro desconhecido');
        toast.error(data?.error || 'Erro ao consultar');
      }
    } catch (err: any) {
      console.error('Erro na consulta:', err);
      const errorMessage = err.message || 'Erro ao consultar API';
      setError(errorMessage);
      
      if (errorMessage.includes('429')) {
        toast.error('Rate limit atingido. Aguarde 1 minuto.');
      } else if (errorMessage.includes('404')) {
        toast.error('Documento não encontrado');
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!result?.bookingInfo) {
      toast.error('Nenhum dado para salvar');
      return;
    }

    setIsSaving(true);

    try {
      const { error: saveError } = await supabase.functions.invoke('draft-save-tracking', {
        body: {
          trackingData: {
            mbl_id: result.bookingInfo.transportDocumentReference,
            booking: result.bookingInfo.bookingNumber,
            origem: result.bookingInfo.originLocation,
            destino: result.bookingInfo.destinationLocation,
            navio: result.bookingInfo.vesselName,
            voyage: result.bookingInfo.voyageNumber,
            etd: result.bookingInfo.etd,
            eta: result.bookingInfo.eta,
            status_armador: result.bookingInfo.documentStatus,
            transaction_id: result.apiMetadata?.transactionId
          }
        }
      });

      if (saveError) throw saveError;

      toast.success('Dados salvos no MariaDB');
      onSave?.();
    } catch (err: any) {
      console.error('Erro ao salvar:', err);
      toast.error('Erro ao salvar dados');
    } finally {
      setIsSaving(false);
    }
  };

  const getSearchIcon = () => {
    switch (searchType) {
      case 'booking': return <Fingerprint className="h-4 w-4 text-[#888]" />;
      case 'BL': return <FileText className="h-4 w-4 text-[#888]" />;
      case 'container': return <Container className="h-4 w-4 text-[#888]" />;
    }
  };

  const getSearchPlaceholder = (): string => {
    switch (searchType) {
      case 'booking': return 'Ex: 14387297';
      case 'BL': return 'Ex: HLCUSHA240001234';
      case 'container': return 'Ex: HLCU1234567';
    }
  };

  return (
    <div className="space-y-6">
      {/* Search Input - Dachser Style */}
      <div className="flex items-center gap-3">
        <Select value={searchType} onValueChange={(v) => setSearchType(v as SearchType)}>
          <SelectTrigger className="w-[140px] h-10 rounded-full bg-[#13141a] border-[rgba(255,255,255,0.14)] text-[0.82rem] text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#13141a] border-[rgba(255,255,255,0.14)] rounded-xl">
            <SelectItem value="booking" className="text-white hover:bg-[rgba(255,255,255,0.05)]">
              <span className="flex items-center gap-2">
                <Fingerprint className="h-3.5 w-3.5" />
                Booking
              </span>
            </SelectItem>
            <SelectItem value="BL" className="text-white hover:bg-[rgba(255,255,255,0.05)]">
              <span className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5" />
                BL Number
              </span>
            </SelectItem>
            <SelectItem value="container" className="text-white hover:bg-[rgba(255,255,255,0.05)]">
              <span className="flex items-center gap-2">
                <Container className="h-3.5 w-3.5" />
                Container
              </span>
            </SelectItem>
          </SelectContent>
        </Select>

        <div className="flex-1 relative">
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2">
            {getSearchIcon()}
          </div>
          <Input
            placeholder={getSearchPlaceholder()}
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="h-10 pl-10 pr-4 rounded-full border-[rgba(255,255,255,0.14)] bg-[#13141a] text-white text-[0.82rem] placeholder:text-[#666] focus:outline-none focus:border-[#ffc800] focus:ring-1 focus:ring-[rgba(255,200,0,0.5)]"
          />
        </div>
        
        <Button 
          onClick={handleSearch} 
          disabled={isLoading}
          className="h-10 px-6 rounded-full bg-[#ffc800] text-black text-[0.82rem] font-semibold hover:bg-[#ffdc50] transition shadow-[0_0_20px_rgba(255,200,0,0.3)] gap-2"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          Consultar
        </Button>
      </div>

      {/* Error State - Dachser Style */}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 flex items-center gap-3 backdrop-blur-[18px]">
          <AlertCircle className="h-5 w-5 text-rose-400" />
          <span className="text-rose-400 text-[0.85rem]">{error}</span>
        </div>
      )}

      {/* Results */}
      {result && result.bookingInfo && (
        <div className="space-y-4">
          {/* Booking Info Card */}
          <BookingResultCard 
            bookingInfo={result.bookingInfo} 
            apiMetadata={result.apiMetadata}
          />

          {/* Containers Table */}
          {result.containers && result.containers.length > 0 && (
            <ContainersTable containers={result.containers} />
          )}

          {/* Events Timeline */}
          {result.events && result.events.length > 0 && (
            <EventsTable events={result.events as HapagEvent[]} />
          )}

          {/* Save Button - Dachser Style */}
          <div className="flex justify-end">
            <Button 
              onClick={handleSave} 
              disabled={isSaving} 
              className="h-10 px-6 rounded-full bg-[#ffc800] text-black text-[0.82rem] font-semibold hover:bg-[#ffdc50] transition shadow-[0_0_20px_rgba(255,200,0,0.3)] gap-2"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Salvar no MariaDB
            </Button>
          </div>
        </div>
      )}

      {/* Empty State - Dachser Style */}
      {!isLoading && !result && !error && (
        <div 
          className="rounded-2xl py-20 text-center backdrop-blur-[18px]"
          style={{
            background: 'rgba(5,6,18,0.9)',
            border: '1px solid rgba(255,255,255,0.12)',
            boxShadow: '0 18px 40px rgba(0,0,0,0.85)'
          }}
        >
          <Ship className="h-16 w-16 mx-auto mb-4 text-[#ffc800]/50" />
          <p className="text-[#888] text-[0.9rem]">
            Selecione o tipo de busca e digite o número para consultar
          </p>
          <p className="text-[#666] text-[0.78rem] mt-2">
            Booking, BL ou Container Number
          </p>
        </div>
      )}
    </div>
  );
};
