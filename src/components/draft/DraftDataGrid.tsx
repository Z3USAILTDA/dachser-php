import { useState, useMemo } from "react";
import { CombinedMBLData } from "@/types/draft";
import { TrackingStatusBadge } from "./TrackingStatusBadge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Search, 
  RefreshCw, 
  Download, 
  Eye, 
  RotateCcw,
  Loader2,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DraftEventTimeline } from "./DraftEventTimeline";
import { BookingInfoCard } from "./BookingInfoCard";

interface DraftDataGridProps {
  data: CombinedMBLData[];
  onRefresh: () => Promise<void>;
  isLoading: boolean;
}

const ITEMS_PER_PAGE = 50;
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 35000; // 35 seconds between batches

export const DraftDataGrid = ({ data, onRefresh, isLoading }: DraftDataGridProps) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const [processProgress, setProcessProgress] = useState({ current: 0, total: 0 });
  const [selectedMBL, setSelectedMBL] = useState<CombinedMBLData | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsData, setDetailsData] = useState<any>(null);
  const [processingMBL, setProcessingMBL] = useState<string | null>(null);

  // Filter data based on search term
  const filteredData = useMemo(() => {
    if (!searchTerm.trim()) return data;
    return data.filter(item => 
      item.mbl_id.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [data, searchTerm]);

  // Paginate data
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredData.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredData, currentPage]);

  const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE);

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return "Nunca";
    try {
      return format(parseISO(dateStr), "dd/MM HH:mm", { locale: ptBR });
    } catch {
      return dateStr;
    }
  };

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const trackSingleMBL = async (mblId: string) => {
    setProcessingMBL(mblId);
    try {
      const { data, error } = await supabase.functions.invoke('draft-track-hapag-multi', {
        body: { searchType: 'BL', searchValue: mblId }
      });

      if (error) throw error;

      if (data?.success && data?.bookingInfo) {
        // Save to MariaDB
        await supabase.functions.invoke('draft-save-tracking', {
          body: { 
            trackingData: {
              mbl_id: mblId,
              booking: data.bookingInfo.bookingReference,
              origem: data.bookingInfo.polName,
              destino: data.bookingInfo.podName,
              navio: data.bookingInfo.vesselName,
              voyage: data.bookingInfo.voyage,
              etd: data.bookingInfo.etd,
              eta: data.bookingInfo.eta,
              status_armador: data.bookingInfo.documentStatus,
              transaction_id: data.apiMetadata?.transactionId
            }
          }
        });
        toast.success(`MBL ${mblId} atualizado com sucesso`);
      }

      return { success: true, mblId };
    } catch (err: any) {
      console.error(`Erro ao rastrear ${mblId}:`, err);
      toast.error(`Erro ao rastrear ${mblId}`);
      return { success: false, mblId, error: err.message };
    } finally {
      setProcessingMBL(null);
    }
  };

  const processAllPending = async () => {
    const pendingMBLs = data.filter(
      item => item.status === 'Nunca Consultado' || item.status === 'Pending'
    );

    if (pendingMBLs.length === 0) {
      toast.info('Nenhum MBL pendente para processar');
      return;
    }

    setIsProcessingAll(true);
    setProcessProgress({ current: 0, total: pendingMBLs.length });

    let processed = 0;
    let successful = 0;
    let failed = 0;

    // Process in batches
    for (let i = 0; i < pendingMBLs.length; i += BATCH_SIZE) {
      const batch = pendingMBLs.slice(i, i + BATCH_SIZE);
      
      // Process batch in parallel
      const results = await Promise.all(
        batch.map(item => trackSingleMBL(item.mbl_id))
      );

      results.forEach(result => {
        processed++;
        if (result.success) successful++;
        else failed++;
      });

      setProcessProgress({ current: processed, total: pendingMBLs.length });

      // Wait between batches (except for last batch)
      if (i + BATCH_SIZE < pendingMBLs.length) {
        toast.info(`Aguardando 35s antes do próximo lote...`);
        await sleep(BATCH_DELAY_MS);
      }
    }

    setIsProcessingAll(false);
    toast.success(`Processamento concluído: ${successful} sucesso, ${failed} erros`);
    onRefresh();
  };

  const viewDetails = async (item: CombinedMBLData) => {
    setSelectedMBL(item);
    setDetailsLoading(true);
    setDetailsData(null);

    try {
      const { data, error } = await supabase.functions.invoke('draft-track-hapag-multi', {
        body: { searchType: 'BL', searchValue: item.mbl_id }
      });

      if (error) throw error;
      setDetailsData(data);
    } catch (err) {
      console.error('Erro ao carregar detalhes:', err);
      toast.error('Erro ao carregar detalhes');
    } finally {
      setDetailsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Search and Actions Bar */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar MBL..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={onRefresh}
            disabled={isLoading || isProcessingAll}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button
            onClick={processAllPending}
            disabled={isLoading || isProcessingAll}
          >
            {isProcessingAll ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Buscar Todos
          </Button>
        </div>
      </div>

      {/* Progress Bar (when processing) */}
      {isProcessingAll && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Processando MBLs...</span>
            <span>
              {processProgress.current}/{processProgress.total} 
              ({Math.round((processProgress.current / processProgress.total) * 100)}%)
            </span>
          </div>
          <Progress 
            value={(processProgress.current / processProgress.total) * 100} 
          />
        </div>
      )}

      {/* Data Table */}
      <div className="border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="font-semibold">MBL ID</TableHead>
              <TableHead className="font-semibold">Status</TableHead>
              <TableHead className="font-semibold">Última Consulta</TableHead>
              <TableHead className="font-semibold text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                  <span className="text-muted-foreground">Carregando dados...</span>
                </TableCell>
              </TableRow>
            ) : paginatedData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  {searchTerm ? 'Nenhum MBL encontrado' : 'Nenhum dado disponível'}
                </TableCell>
              </TableRow>
            ) : (
              paginatedData.map((item) => (
                <TableRow key={item.mbl_id} className="hover:bg-muted/30">
                  <TableCell className="font-mono text-sm">
                    {item.mbl_id}
                  </TableCell>
                  <TableCell>
                    <TrackingStatusBadge status={item.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(item.lastConsulted)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => trackSingleMBL(item.mbl_id).then(() => onRefresh())}
                        disabled={processingMBL === item.mbl_id || isProcessingAll}
                        title="Consultar/Atualizar"
                      >
                        {processingMBL === item.mbl_id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RotateCcw className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => viewDetails(item)}
                        title="Ver Detalhes"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Mostrando {((currentPage - 1) * ITEMS_PER_PAGE) + 1}-
            {Math.min(currentPage * ITEMS_PER_PAGE, filteredData.length)} de {filteredData.length}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">
              Página {currentPage} de {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Details Modal */}
      <Dialog open={!!selectedMBL} onOpenChange={() => setSelectedMBL(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-mono">
              Detalhes: {selectedMBL?.mbl_id}
            </DialogTitle>
          </DialogHeader>
          
          {detailsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : detailsData ? (
            <div className="space-y-6">
              <BookingInfoCard 
                bookingInfo={detailsData.bookingInfo} 
                trackingData={selectedMBL?.trackingData}
              />
              
              {detailsData.containers?.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">
                    Containers ({detailsData.containers.length})
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {detailsData.containers.map((c: any, i: number) => (
                      <span 
                        key={i}
                        className="px-2 py-1 bg-muted rounded text-sm font-mono"
                      >
                        {c.equipmentReference} - {c.ISOEquipmentCode}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {detailsData.events?.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-3">Timeline de Eventos</h4>
                  <DraftEventTimeline events={detailsData.events} />
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum detalhe disponível. Tente consultar o MBL primeiro.
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
