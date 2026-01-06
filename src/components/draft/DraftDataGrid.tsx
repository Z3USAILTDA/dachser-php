import { useState, useMemo } from "react";
import { CombinedMBLData } from "@/types/draft";
import { TrackingStatusBadge } from "./TrackingStatusBadge";
import { Card, CardContent } from "@/components/ui/card";
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
  ChevronRight,
  FileSpreadsheet,
  ExternalLink,
  Database,
  CheckCircle2,
  Clock,
  XCircle,
  Ship
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DraftEventTimeline } from "./DraftEventTimeline";
import { BookingInfoCard } from "./BookingInfoCard";
import * as XLSX from 'xlsx';

interface DraftDataGridProps {
  data: CombinedMBLData[];
  onRefresh: () => Promise<void>;
  isLoading: boolean;
}

const ITEMS_PER_PAGE = 20;
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 35000;

export const DraftDataGrid = ({ data, onRefresh, isLoading }: DraftDataGridProps) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const [processProgress, setProcessProgress] = useState({ current: 0, total: 0 });
  const [selectedMBL, setSelectedMBL] = useState<CombinedMBLData | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsData, setDetailsData] = useState<any>(null);
  const [processingMBL, setProcessingMBL] = useState<string | null>(null);

  // Calculate stats
  const stats = useMemo(() => {
    const completed = data.filter(d => d.status === 'Completed').length;
    const inTransit = data.filter(d => d.status === 'In Progress').length;
    const pending = data.filter(d => d.status === 'Pending' || d.status === 'Nunca Consultado').length;
    const errors = data.filter(d => d.status === 'Error').length;
    return { total: data.length, completed, inTransit, pending, errors };
  }, [data]);

  // Filter data based on search term
  const filteredData = useMemo(() => {
    if (!searchTerm.trim()) return data;
    const term = searchTerm.toLowerCase();
    return data.filter(item => 
      item.mbl_id.toLowerCase().includes(term) ||
      item.trackingData?.booking?.toLowerCase().includes(term) ||
      item.trackingData?.origem?.toLowerCase().includes(term) ||
      item.trackingData?.destino?.toLowerCase().includes(term)
    );
  }, [data, searchTerm]);

  // Paginate data
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredData.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredData, currentPage]);

  const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE);

  const formatDate = (dateStr: string | null | undefined): string => {
    if (!dateStr) return "-";
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
        toast.success(`MBL ${mblId} atualizado`);
      }

      return { success: true, mblId };
    } catch (err: any) {
      console.error(`Erro ao rastrear ${mblId}:`, err);
      toast.error(`Erro: ${mblId}`);
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
      toast.info('Nenhum MBL pendente');
      return;
    }

    setIsProcessingAll(true);
    setProcessProgress({ current: 0, total: pendingMBLs.length });

    let processed = 0;
    let successful = 0;

    for (let i = 0; i < pendingMBLs.length; i += BATCH_SIZE) {
      const batch = pendingMBLs.slice(i, i + BATCH_SIZE);
      
      const results = await Promise.all(
        batch.map(item => trackSingleMBL(item.mbl_id))
      );

      results.forEach(result => {
        processed++;
        if (result.success) successful++;
      });

      setProcessProgress({ current: processed, total: pendingMBLs.length });

      if (i + BATCH_SIZE < pendingMBLs.length) {
        toast.info(`Aguardando 35s...`);
        await sleep(BATCH_DELAY_MS);
      }
    }

    setIsProcessingAll(false);
    toast.success(`Concluído: ${successful}/${pendingMBLs.length}`);
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
      console.error('Erro:', err);
      toast.error('Erro ao carregar');
    } finally {
      setDetailsLoading(false);
    }
  };

  const exportToCSV = () => {
    const exportData = filteredData.map((item, index) => ({
      '#': index + 1,
      'MBL ID': item.mbl_id,
      'Booking': item.trackingData?.booking || '-',
      'Viagem': item.trackingData?.voyage || '-',
      'Status': item.status,
      'Origem': item.trackingData?.origem || '-',
      'Destino': item.trackingData?.destino || '-',
      'Navio': item.trackingData?.navio || '-',
      'ETD': item.trackingData?.etd || '-',
      'ETA': item.trackingData?.eta || '-',
      'Transaction ID': item.trackingData?.transaction_id || '-',
      'Data Consulta': item.lastConsulted || '-'
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'MBLs');
    
    const fileName = `draft_export_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
    toast.success('Exportado com sucesso');
  };

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="bg-card/50 border-border border-l-4 border-l-blue-500">
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-blue-400" />
              <div>
                <div className="text-lg font-bold">{stats.total}</div>
                <div className="text-xs text-muted-foreground">Total</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border border-l-4 border-l-emerald-500">
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <div>
                <div className="text-lg font-bold">{stats.completed}</div>
                <div className="text-xs text-muted-foreground">Completed</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border border-l-4 border-l-amber-500">
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2">
              <Ship className="h-4 w-4 text-amber-400" />
              <div>
                <div className="text-lg font-bold">{stats.inTransit}</div>
                <div className="text-xs text-muted-foreground">Em Trânsito</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border border-l-4 border-l-orange-500">
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-orange-400" />
              <div>
                <div className="text-lg font-bold">{stats.pending}</div>
                <div className="text-xs text-muted-foreground">Pendentes</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border border-l-4 border-l-rose-500">
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-rose-400" />
              <div>
                <div className="text-lg font-bold">{stats.errors}</div>
                <div className="text-xs text-muted-foreground">Erros</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions Bar */}
      <div className="flex flex-wrap justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={onRefresh}
            disabled={isLoading || isProcessingAll}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </Button>
          <Button
            onClick={processAllPending}
            disabled={isLoading || isProcessingAll || stats.pending === 0}
            className="bg-[#ffc800] text-black hover:bg-[#ffdc50]"
          >
            {isProcessingAll ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            <span className="hidden sm:inline">Buscar Status API</span>
            <span className="sm:hidden">API</span>
          </Button>
          <Button
            variant="outline"
            onClick={exportToCSV}
            disabled={filteredData.length === 0}
          >
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Exportar CSV</span>
          </Button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="pl-10"
          />
        </div>
      </div>

      {/* Progress Bar */}
      {isProcessingAll && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Processando MBLs...</span>
            <span>
              {processProgress.current}/{processProgress.total} 
              ({Math.round((processProgress.current / processProgress.total) * 100)}%)
            </span>
          </div>
          <Progress value={(processProgress.current / processProgress.total) * 100} />
        </div>
      )}

      {/* Data Table */}
      <div className="border border-border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="font-semibold w-12">#</TableHead>
              <TableHead className="font-semibold">MBL ID</TableHead>
              <TableHead className="font-semibold">Booking</TableHead>
              <TableHead className="font-semibold hidden lg:table-cell">Viagem</TableHead>
              <TableHead className="font-semibold">Status</TableHead>
              <TableHead className="font-semibold hidden md:table-cell">Origem</TableHead>
              <TableHead className="font-semibold hidden md:table-cell">Destino</TableHead>
              <TableHead className="font-semibold hidden xl:table-cell">Navio</TableHead>
              <TableHead className="font-semibold hidden xl:table-cell">ETD</TableHead>
              <TableHead className="font-semibold hidden xl:table-cell">ETA</TableHead>
              <TableHead className="font-semibold hidden 2xl:table-cell">Transaction ID</TableHead>
              <TableHead className="font-semibold">Última Consulta</TableHead>
              <TableHead className="font-semibold text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={14} className="text-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                  <span className="text-muted-foreground">Carregando...</span>
                </TableCell>
              </TableRow>
            ) : paginatedData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={14} className="text-center py-8 text-muted-foreground">
                  {searchTerm ? 'Nenhum resultado' : 'Nenhum dado'}
                </TableCell>
              </TableRow>
            ) : (
              paginatedData.map((item, index) => (
                <TableRow key={item.mbl_id} className="hover:bg-muted/30">
                  <TableCell className="text-muted-foreground text-sm">
                    {(currentPage - 1) * ITEMS_PER_PAGE + index + 1}
                  </TableCell>
                  <TableCell className="font-mono text-sm">{item.mbl_id}</TableCell>
                  <TableCell className="text-sm">{item.trackingData?.booking || '-'}</TableCell>
                  <TableCell className="text-sm hidden lg:table-cell">{item.trackingData?.voyage || '-'}</TableCell>
                  <TableCell><TrackingStatusBadge status={item.status} showIcon={false} /></TableCell>
                  <TableCell className="text-sm hidden md:table-cell">{item.trackingData?.origem || '-'}</TableCell>
                  <TableCell className="text-sm hidden md:table-cell">{item.trackingData?.destino || '-'}</TableCell>
                  <TableCell className="text-sm hidden xl:table-cell">{item.trackingData?.navio || '-'}</TableCell>
                  <TableCell className="text-sm hidden xl:table-cell">{formatDate(item.trackingData?.etd)}</TableCell>
                  <TableCell className="text-sm hidden xl:table-cell">{formatDate(item.trackingData?.eta)}</TableCell>
                  <TableCell className="font-mono text-xs hidden 2xl:table-cell truncate max-w-[100px]">
                    {item.trackingData?.transaction_id || '-'}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{formatDate(item.lastConsulted)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => trackSingleMBL(item.mbl_id).then(() => onRefresh())}
                        disabled={processingMBL === item.mbl_id || isProcessingAll}
                        title="Consultar"
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
                        asChild
                        title="Hapag-Lloyd"
                      >
                        <a
                          href={`https://www.hapag-lloyd.com/en/online-business/track/track-by-booking-solution.html?blno=${item.mbl_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => viewDetails(item)}
                        title="Detalhes"
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
            {((currentPage - 1) * ITEMS_PER_PAGE) + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, filteredData.length)} de {filteredData.length}
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
              {currentPage}/{totalPages}
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

      {/* Footer Note */}
      <div className="text-xs text-muted-foreground text-center py-2 border-t border-border">
        Nota: A API Hapag-Lloyd possui rate limit. Consultas em lote são processadas com delay de 35s entre batches.
      </div>

      {/* Details Modal */}
      <Dialog open={!!selectedMBL} onOpenChange={() => setSelectedMBL(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-mono">
              {selectedMBL?.mbl_id}
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
                  <h4 className="font-semibold mb-2">Containers ({detailsData.containers.length})</h4>
                  <div className="flex flex-wrap gap-2">
                    {detailsData.containers.map((c: any, i: number) => (
                      <span key={i} className="px-2 py-1 bg-muted rounded text-sm font-mono">
                        {c.equipmentReference} - {c.ISOEquipmentCode}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {detailsData.events?.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-3">Timeline</h4>
                  <DraftEventTimeline events={detailsData.events} />
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Consulte o MBL primeiro.
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
