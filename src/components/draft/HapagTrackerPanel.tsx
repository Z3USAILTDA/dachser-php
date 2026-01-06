import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Search, Save, Loader2, Package, AlertCircle, RefreshCw, Ship, Fingerprint, FileText, Container } from "lucide-react";
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
      case 'booking': return <Fingerprint className="h-4 w-4 text-muted-foreground" />;
      case 'BL': return <FileText className="h-4 w-4 text-muted-foreground" />;
      case 'container': return <Container className="h-4 w-4 text-muted-foreground" />;
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
      {/* Search Input */}
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2">
            {getSearchIcon()}
          </div>
          <Input
            placeholder={getSearchPlaceholder()}
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="pl-10 bg-[hsl(var(--card))]/60 border-border"
          />
        </div>
        
        <Button 
          onClick={handleSearch} 
          disabled={isLoading}
          variant="outline"
          className="gap-2"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Atualizar
        </Button>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-destructive" />
          <span className="text-destructive">{error}</span>
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

          {/* Save Button */}
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={isSaving} className="gap-2">
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

      {/* Empty State */}
      {!isLoading && !result && !error && (
        <div className="bg-[hsl(var(--card))]/60 border border-border rounded-lg py-16 text-center">
          <Package className="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
          <p className="text-muted-foreground">
            Digite um número de booking para iniciar o rastreamento
          </p>
        </div>
      )}
    </div>
  );
};
