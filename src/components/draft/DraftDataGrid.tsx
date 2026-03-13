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
  FileSpreadsheet,
  ExternalLink,
  Database,
  CheckCircle2,
  Clock,
  XCircle,
  Ship,
  Copy
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DraftEventTimeline } from "./DraftEventTimeline";
import { BookingInfoCard } from "./BookingInfoCard";
import { TablePagination } from "@/components/layout/TablePagination";
import * as XLSX from 'xlsx';

interface DraftDataGridProps {
  data: CombinedMBLData[];
  onRefresh: () => Promise<void>;
  isLoading: boolean;
  statusFilter?: string | null;
  onStatusFilterChange?: (status: string | null) => void;
}

const ITEMS_PER_PAGE = 15;
const BATCH_SIZE = 5;

type CarrierName = 'HAPAG' | 'MSC' | 'ONE' | 'OUTRO';
type CarrierFilter = 'ALL' | 'HAPAG' | 'MSC' | 'ONE';

const normalizeMblId = (mblId: string): string =>
  mblId
    .toUpperCase()
    .trim()
    .replace(/\s+/g, '')
    .replace(/^[^A-Z0-9]+/, '');

const detectCarrier = (mblId: string): { name: CarrierName; color: string } => {
  const id = normalizeMblId(mblId);
  if (/^(MEDU|MSC|EBKG)/.test(id)) return { name: 'MSC', color: '#00B4D8' };
  if (/^ONEY/.test(id)) return { name: 'ONE', color: '#FF6B9D' };
  if (/^HLC/.test(id)) return { name: 'HAPAG', color: '#ffc800' };
  return { name: 'OUTRO', color: '#888' };
};
const BATCH_DELAY_MS = 35000;

export const DraftDataGrid = ({ data, onRefresh, isLoading, statusFilter, onStatusFilterChange }: DraftDataGridProps) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const [processProgress, setProcessProgress] = useState({ current: 0, total: 0 });
  const [selectedMBL, setSelectedMBL] = useState<CombinedMBLData | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsData, setDetailsData] = useState<any>(null);
  const [processingMBL, setProcessingMBL] = useState<string | null>(null);
  const [carrierFilter, setCarrierFilter] = useState<CarrierFilter>('ALL');

  // Remove duplicados por MBL para evitar vazamento entre filtros
  const uniqueData = useMemo(() => {
    const map = new Map<string, CombinedMBLData>();
    data.forEach((item) => {
      const key = normalizeMblId(item.mbl_id);
      if (!map.has(key)) map.set(key, item);
    });
    return Array.from(map.values());
  }, [data]);

  // Carrier stats
  const carrierStats = useMemo(() => {
    const hapag = uniqueData.filter(d => detectCarrier(d.mbl_id).name === 'HAPAG').length;
    const msc = uniqueData.filter(d => detectCarrier(d.mbl_id).name === 'MSC').length;
    const one = uniqueData.filter(d => detectCarrier(d.mbl_id).name === 'ONE').length;
    return { hapag, msc, one };
  }, [uniqueData]);

  // Data filtered by carrier
  const carrierFilteredData = useMemo(() => {
    if (carrierFilter === 'ALL') return uniqueData;
    return uniqueData.filter(d => detectCarrier(d.mbl_id).name === carrierFilter);
  }, [uniqueData, carrierFilter]);

  // Calculate stats from carrier-filtered data
  const stats = useMemo(() => {
    const completed = carrierFilteredData.filter(d => d.status === 'Completed').length;
    const inTransit = carrierFilteredData.filter(d => d.status === 'In Progress').length;
    const pending = carrierFilteredData.filter(d => d.status === 'Pending' || d.status === 'Nunca Consultado').length;
    const errors = carrierFilteredData.filter(d => d.status === 'Error').length;
    return { total: carrierFilteredData.length, completed, inTransit, pending, errors };
  }, [carrierFilteredData]);

  // Filter data based on search term and status filter
  const filteredData = useMemo(() => {
    let filtered = carrierFilteredData;
    
    // Apply status filter
    if (statusFilter) {
      if (statusFilter === 'Pending') {
        filtered = filtered.filter(item => item.status === 'Pending' || item.status === 'Nunca Consultado');
      } else {
        filtered = filtered.filter(item => item.status === statusFilter);
      }
    }
    
    // Apply search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(item => 
        item.mbl_id.toLowerCase().includes(term) ||
        item.shipper?.toLowerCase().includes(term) ||
        item.trackingData?.booking?.toLowerCase().includes(term) ||
        item.trackingData?.origem?.toLowerCase().includes(term) ||
        item.trackingData?.destino?.toLowerCase().includes(term)
      );
    }
    
    // Sort: filled rows first
    filtered = [...filtered].sort((a, b) => {
      const aHasData = a.trackingData !== null ? 1 : 0;
      const bHasData = b.trackingData !== null ? 1 : 0;
      if (bHasData !== aHasData) return bHasData - aHasData;
      return a.mbl_id.localeCompare(b.mbl_id);
    });
    
    return filtered;
  }, [carrierFilteredData, searchTerm, statusFilter]);

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

      // Handle API errors - check if it's a "not found" type error (204)
      if (error) {
        const errorMsg = error.message || '';
        // If it's a "not found" error, treat as no data available (not a failure)
        if (errorMsg.includes('204') || errorMsg.includes('não encontrado')) {
          console.log(`MBL ${mblId}: Sem dados na API Hapag-Lloyd`);
          toast.info(`${mblId}: Não encontrado na Hapag-Lloyd`);
          return { success: true, mblId, noData: true };
        }
        throw error;
      }

      // Handle rate limit response
      if (data && data.rateLimit) {
        console.log(`MBL ${mblId}: rate_limit`);
        toast.warning(`Rate limit atingido. Aguarde ${data.retryAfter || 30}s`);
        return { success: false, mblId, rateLimit: true, retryAfter: data.retryAfter };
      }

      // Handle success: false response from API (e.g., 204 No Content)
      if (data && !data.success) {
        console.log(`MBL ${mblId}: ${data.error || 'Sem dados'}`);
        toast.info(`${mblId}: ${data.error || 'Sem dados na API'}`);
        return { success: true, mblId, noData: true };
      }

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
        toast.success(`${mblId} atualizado com sucesso!`);
      }

      return { success: true, mblId };
    } catch (err: any) {
      console.error(`Erro ao rastrear ${mblId}:`, err);
      toast.error(`Erro ao consultar ${mblId}`);
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

      // Handle case where BL is not found (API returns 204/404)
      if (error) {
        // Check if it's a "not found" type error
        const errorBody = error.message || '';
        if (errorBody.includes('não encontrado') || errorBody.includes('204')) {
          setDetailsData({ notFound: true, message: 'BL não encontrado na API Hapag-Lloyd' });
          return;
        }
        throw error;
      }
      
      // Handle success: false response
      if (data && !data.success && data.error) {
        setDetailsData({ notFound: true, message: data.error });
        return;
      }
      
      setDetailsData(data);
    } catch (err) {
      console.error('Erro:', err);
      toast.error('Erro ao carregar detalhes');
      setDetailsData({ notFound: true, message: 'Erro ao consultar API' });
    } finally {
      setDetailsLoading(false);
    }
  };

  const exportToCSV = () => {
    const exportData = filteredData.map((item, index) => ({
      '#': index + 1,
      'Armador': detectCarrier(item.mbl_id).name,
      'MBL ID': item.mbl_id,
      'Shipper': item.shipper || '-',
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
      {/* Stats Cards - Filtros Clicáveis */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card 
          className={`bg-card border-border border-l-4 border-l-[hsl(var(--info))] cursor-pointer transition-all hover:scale-[1.02] ${statusFilter === null ? 'ring-2 ring-[hsl(var(--info))] ring-offset-2 ring-offset-background' : ''}`}
          onClick={() => onStatusFilterChange?.(null)}
        >
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-[hsl(var(--info))]" />
              <div>
                <div className="text-lg font-bold">{stats.total}</div>
                <div className="text-xs text-muted-foreground">Total</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card 
          className={`bg-card border-border border-l-4 border-l-[hsl(var(--success))] cursor-pointer transition-all hover:scale-[1.02] ${statusFilter === 'Completed' ? 'ring-2 ring-[hsl(var(--success))] ring-offset-2 ring-offset-background' : ''}`}
          onClick={() => onStatusFilterChange?.(statusFilter === 'Completed' ? null : 'Completed')}
        >
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
              <div>
                <div className="text-lg font-bold">{stats.completed}</div>
                <div className="text-xs text-muted-foreground">Completed</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card 
          className={`bg-card border-border border-l-4 border-l-[hsl(var(--warning))] cursor-pointer transition-all hover:scale-[1.02] ${statusFilter === 'In Progress' ? 'ring-2 ring-[hsl(var(--warning))] ring-offset-2 ring-offset-background' : ''}`}
          onClick={() => onStatusFilterChange?.(statusFilter === 'In Progress' ? null : 'In Progress')}
        >
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2">
              <Ship className="h-4 w-4 text-[hsl(var(--warning))]" />
              <div>
                <div className="text-lg font-bold">{stats.inTransit}</div>
                <div className="text-xs text-muted-foreground">Em Trânsito</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card 
          className={`bg-card border-border border-l-4 border-l-primary cursor-pointer transition-all hover:scale-[1.02] ${statusFilter === 'Pending' ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}`}
          onClick={() => onStatusFilterChange?.(statusFilter === 'Pending' ? null : 'Pending')}
        >
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              <div>
                <div className="text-lg font-bold">{stats.pending}</div>
                <div className="text-xs text-muted-foreground">Pendentes</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Carrier Filter Chips */}
      <div className="flex items-center gap-2">
        <span className="text-[0.75rem] text-[#888] uppercase tracking-wider mr-1">Armador:</span>
        {[
          { key: 'ALL' as CarrierFilter, label: 'Todos', count: uniqueData.length, color: 'hsl(var(--info))' },
          { key: 'HAPAG' as CarrierFilter, label: 'Hapag-Lloyd', count: carrierStats.hapag, color: '#ffc800' },
          { key: 'MSC' as CarrierFilter, label: 'MSC', count: carrierStats.msc, color: '#00B4D8' },
          { key: 'ONE' as CarrierFilter, label: 'ONE', count: carrierStats.one, color: '#FF6B9D' },
        ].map((c) => (
          <button
            key={c.label}
            onClick={() => { setCarrierFilter(c.key); setCurrentPage(1); }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[0.78rem] font-medium transition-all border ${
              carrierFilter === c.key
                ? 'border-current shadow-[0_0_12px_rgba(255,255,255,0.15)]'
                : 'border-[rgba(255,255,255,0.12)] bg-[rgba(5,6,18,0.8)] text-[#aaa] hover:text-white hover:bg-[rgba(5,6,18,1)]'
            }`}
            style={carrierFilter === c.key ? { color: c.color, borderColor: c.color, background: `${c.color}15` } : {}}
          >
            <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />
            {c.label}
            <span className="text-[0.7rem] opacity-70">({c.count})</span>
          </button>
        ))}
      </div>

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
          className="bg-primary text-primary-foreground hover:bg-primary/90"
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

      {/* Data Table - Dachser Style */}
      <div className="rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] backdrop-blur-[18px] shadow-[0_18px_40px_rgba(0,0,0,0.85)] overflow-hidden">
        {/* Search Header */}
        <div className="p-4 border-b border-[rgba(255,255,255,0.08)] flex items-center justify-between">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#666]" />
            <input
              type="text"
              placeholder="Buscar em todas as colunas..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-[rgba(0,0,0,0.5)] border border-[rgba(255,255,255,0.1)] text-white placeholder:text-[#666] text-[0.85rem] focus:outline-none focus:border-primary/50"
            />
          </div>
          <span className="text-[0.8rem] text-[#aaaaaa] ml-4">
            {filteredData.length} de {uniqueData.length} registros
          </span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-[rgba(255,255,255,0.08)]">
                <TableHead className="text-[#888] text-[0.75rem] uppercase tracking-wider font-medium w-12">#</TableHead>
                <TableHead className="text-[#888] text-[0.75rem] uppercase tracking-wider font-medium">Armador</TableHead>
                <TableHead className="text-[#888] text-[0.75rem] uppercase tracking-wider font-medium">MBL ID</TableHead>
                <TableHead className="text-[#888] text-[0.75rem] uppercase tracking-wider font-medium hidden lg:table-cell">Shipper</TableHead>
                <TableHead className="text-[#888] text-[0.75rem] uppercase tracking-wider font-medium">Booking</TableHead>
                <TableHead className="text-[#888] text-[0.75rem] uppercase tracking-wider font-medium hidden lg:table-cell">Viagem</TableHead>
                <TableHead className="text-[#888] text-[0.75rem] uppercase tracking-wider font-medium">Status</TableHead>
                <TableHead className="text-[#888] text-[0.75rem] uppercase tracking-wider font-medium hidden md:table-cell">Origem</TableHead>
                <TableHead className="text-[#888] text-[0.75rem] uppercase tracking-wider font-medium hidden md:table-cell">Destino</TableHead>
                <TableHead className="text-[#888] text-[0.75rem] uppercase tracking-wider font-medium hidden xl:table-cell">Navio</TableHead>
                <TableHead className="text-[#888] text-[0.75rem] uppercase tracking-wider font-medium hidden xl:table-cell">ETD</TableHead>
                <TableHead className="text-[#888] text-[0.75rem] uppercase tracking-wider font-medium hidden xl:table-cell">ETA</TableHead>
                <TableHead className="text-[#888] text-[0.75rem] uppercase tracking-wider font-medium">Última Consulta</TableHead>
                <TableHead className="text-[#888] text-[0.75rem] uppercase tracking-wider font-medium text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={14} className="text-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-primary" />
                    <span className="text-[#aaaaaa] text-[0.85rem]">Carregando...</span>
                  </TableCell>
                </TableRow>
              ) : paginatedData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={14} className="text-center py-12 text-[#aaaaaa]">
                    {searchTerm ? `Nenhum resultado para "${searchTerm}"` : 'Nenhum dado disponível'}
                  </TableCell>
                </TableRow>
              ) : (
                paginatedData.map((item, index) => (
                  <TableRow 
                    key={`${item.mbl_id}-${(currentPage - 1) * ITEMS_PER_PAGE + index}`}
                    className={`border-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.03)] ${index % 2 === 0 ? "bg-[rgba(255,255,255,0.02)]" : ""}`}
                  >
                    <TableCell className="text-[#888] text-[0.85rem]">
                      {(currentPage - 1) * ITEMS_PER_PAGE + index + 1}
                    </TableCell>
                    <TableCell className="text-[0.8rem] font-semibold" style={{ color: detectCarrier(item.mbl_id).color }}>
                      {detectCarrier(item.mbl_id).name}
                    </TableCell>
                    <TableCell className="font-mono text-primary text-[0.85rem]">{item.mbl_id}</TableCell>
                    <TableCell className="text-[#aaaaaa] text-[0.85rem] hidden lg:table-cell max-w-[180px] truncate" title={item.shipper || '-'}>
                      {item.shipper || '-'}
                    </TableCell>
                    <TableCell className="text-white text-[0.85rem]">{item.trackingData?.booking || '-'}</TableCell>
                    <TableCell className="text-[#aaaaaa] text-[0.85rem] hidden lg:table-cell">{item.trackingData?.voyage || '-'}</TableCell>
                    <TableCell><TrackingStatusBadge status={item.status} showIcon={false} /></TableCell>
                    <TableCell className="text-[#aaaaaa] text-[0.85rem] hidden md:table-cell">{item.trackingData?.origem || '-'}</TableCell>
                    <TableCell className="text-[#aaaaaa] text-[0.85rem] hidden md:table-cell">{item.trackingData?.destino || '-'}</TableCell>
                    <TableCell className="text-white text-[0.85rem] hidden xl:table-cell">{item.trackingData?.navio || '-'}</TableCell>
                    <TableCell className="text-[#aaaaaa] text-[0.85rem] hidden xl:table-cell">{formatDate(item.trackingData?.etd)}</TableCell>
                    <TableCell className="text-[#aaaaaa] text-[0.85rem] hidden xl:table-cell">{formatDate(item.trackingData?.eta)}</TableCell>
                    <TableCell className="text-[#888] text-[0.8rem]">{formatDate(item.lastConsulted)}</TableCell>
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
        <div className="p-4 border-t border-[rgba(255,255,255,0.08)]">
          <div className="flex items-center justify-between">
            <span className="text-[0.8rem] text-[#aaaaaa]">
              {filteredData.length} de {data.length} registros
            </span>
            <TablePagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          </div>
        </div>

        {/* Footer Note */}
        <div className="text-[0.75rem] text-[#888] text-center py-3 border-t border-[rgba(255,255,255,0.08)]">
          Nota: A API Hapag-Lloyd possui rate limit. Consultas em lote são processadas com delay de 35s entre batches.
        </div>
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
          ) : detailsData?.notFound ? (
            <div className="text-center py-8">
              <XCircle className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">{detailsData.message}</p>
              <p className="text-sm text-muted-foreground/70 mt-2">
                O BL pode não existir ou ainda não ter eventos registrados na Hapag-Lloyd.
              </p>
            </div>
          ) : detailsData ? (
            <div className="space-y-6">
              <BookingInfoCard 
                bookingInfo={detailsData.bookingInfo} 
                trackingData={selectedMBL?.trackingData}
              />

              {/* Hash de Comprovação */}
              {(detailsData.apiMetadata?.transactionId || selectedMBL?.trackingData?.transaction_id) && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-white/5 border border-white/10">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">Hash de Comprovação:</span>
                  <code className="text-xs font-mono bg-black/30 px-2 py-1 rounded truncate max-w-[300px]">
                    {detailsData.apiMetadata?.transactionId || selectedMBL?.trackingData?.transaction_id}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 shrink-0"
                    onClick={() => {
                      const hash = detailsData.apiMetadata?.transactionId || selectedMBL?.trackingData?.transaction_id;
                      if (hash) {
                        navigator.clipboard.writeText(hash);
                        toast.success("Hash copiado!");
                      }
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
              
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
