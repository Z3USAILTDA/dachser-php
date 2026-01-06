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
import { Search, Save, Loader2, Package, AlertCircle } from "lucide-react";
import { BookingInfoCard } from "./BookingInfoCard";
import { DraftEventTimeline } from "./DraftEventTimeline";
import { TrackingApiResponse, ContainerInfo, HapagEvent } from "@/types/draft";

interface HapagTrackerPanelProps {
  onSave?: () => void;
}

type SearchType = 'booking' | 'BL' | 'container';

export const HapagTrackerPanel = ({ onSave }: HapagTrackerPanelProps) => {
  const [searchType, setSearchType] = useState<SearchType>('BL');
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

  const getSearchPlaceholder = (): string => {
    switch (searchType) {
      case 'booking': return 'Ex: 123456789';
      case 'BL': return 'Ex: HLCUSHA240001234';
      case 'container': return 'Ex: HLCU1234567';
    }
  };

  return (
    <div className="space-y-6">
      {/* Search Form */}
      <Card className="bg-card/50 border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" />
            Consultar Hapag-Lloyd
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <Select value={searchType} onValueChange={(v) => setSearchType(v as SearchType)}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BL">Bill of Lading</SelectItem>
                <SelectItem value="booking">Booking</SelectItem>
                <SelectItem value="container">Container</SelectItem>
              </SelectContent>
            </Select>

            <Input
              placeholder={getSearchPlaceholder()}
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1"
            />

            <Button onClick={handleSearch} disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              Consultar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Error State */}
      {error && (
        <Card className="bg-destructive/10 border-destructive/30">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <span className="text-destructive">{error}</span>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Booking Info */}
          <BookingInfoCard bookingInfo={result.bookingInfo} />

          {/* Containers */}
          {result.containers && result.containers.length > 0 && (
            <Card className="bg-card/50 border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Package className="h-5 w-5 text-primary" />
                  Containers ({result.containers.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {result.containers.map((container: ContainerInfo, index: number) => (
                    <div 
                      key={index}
                      className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg"
                    >
                      <Package className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <div className="font-mono text-sm font-medium">
                          {container.containerNo}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {container.type} - {container.status}
                        </div>
                        {container.placeOfActivity && (
                          <div className="text-xs text-muted-foreground">
                            {container.placeOfActivity}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Timeline */}
          {result.events && result.events.length > 0 && (
            <Card className="bg-card/50 border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Timeline de Eventos</CardTitle>
              </CardHeader>
              <CardContent>
                <DraftEventTimeline events={result.events as HapagEvent[]} />
              </CardContent>
            </Card>
          )}

          {/* Save Button */}
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Salvar no MariaDB
            </Button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !result && !error && (
        <Card className="bg-card/50 border-border">
          <CardContent className="py-12 text-center text-muted-foreground">
            <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Digite um número e clique em "Consultar" para buscar informações</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
