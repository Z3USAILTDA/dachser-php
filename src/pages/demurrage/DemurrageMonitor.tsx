import { useState, useMemo, useEffect } from "react";
import { DemurrageLayout } from "@/components/demurrage/DemurrageLayout";
import { KpiCard } from "@/components/demurrage/KpiCard";
import { ContainerDetailsSheet } from "@/components/demurrage/ContainerDetailsSheet";
import { ImportMblDialog } from "@/components/demurrage/ImportMblDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TablePagination } from "@/components/layout/TablePagination";
import {
  Package, 
  AlertTriangle, 
  Search, 
  Clock,
  CheckCircle2,
  FileSpreadsheet,
  Ship,
  TrendingUp,
  Loader2,
  Plus,
  FileText
} from "lucide-react";
import { toast } from "sonner";
import { useDemurrageData, useDemurrageStats, useSyncDemurrage, useRecalcDemurrage, type DemurrageContainer, type DemurrageFilters } from "@/hooks/useDemurrageData";
import { exportDemurrageToExcel } from "@/utils/demurrageExcelExport";
import { exportDemurrageReportPDF } from "@/utils/demurragePdfExport";

type QuickFilter = "all" | "in_transit" | "at_risk" | "delivered";
const PAGE_SIZE = 15;

export default function DemurrageMonitor() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterArmador, setFilterArmador] = useState<string>("all");
  const [filterCliente, setFilterCliente] = useState<string>("all");
  const [filterTipoContainer, setFilterTipoContainer] = useState<string>("all");
  const [filterPortoOrigem, setFilterPortoOrigem] = useState<string>("all");
  const [filterPortoDestino, setFilterPortoDestino] = useState<string>("all");
  const [filterCronosStatus, setFilterCronosStatus] = useState<string>("all");
  const [filterFtSource, setFilterFtSource] = useState<string>("all");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [isExporting, setIsExporting] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  
  // Sheet state
  const [selectedContainer, setSelectedContainer] = useState<DemurrageContainer | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Build filters object - memoized to avoid unnecessary re-fetches
  const filters = useMemo<DemurrageFilters>(() => {
    const f: DemurrageFilters = {};
    
    if (searchTerm.trim()) f.search = searchTerm.trim();
    if (filterStatus !== "all") f.risk_status = filterStatus;
    
    // Quick filter maps to cronos_status_list for multiple values
    if (quickFilter === "in_transit") {
      f.cronos_status_list = ["IN_TRANSIT", "ARRIVED", "PENDING"];
    } else if (quickFilter === "delivered") {
      f.cronos_status_list = ["GATE_OUT", "RETURNED"];
    }
    // quickFilter === "all" or "at_risk" means no cronos_status filter (at_risk filters client-side)
    
    return f;
  }, [searchTerm, filterStatus, quickFilter]);

  const { data: containers = [], isLoading, refetch, isRefetching } = useDemurrageData(filters);
  const { data: stats } = useDemurrageStats();
  const syncMutation = useSyncDemurrage();
  const recalcMutation = useRecalcDemurrage();

  // Client-side filtering for quickFilter + additional filters
  const filteredContainers = useMemo(() => {
    let result = containers;
    
    if (quickFilter === "at_risk") {
      result = result.filter(c => ["at_risk", "critical", "exceeded"].includes(c.risk_status));
    }
    if (filterArmador !== "all") {
      result = result.filter(c => c.armador === filterArmador);
    }
    if (filterCliente !== "all") {
      result = result.filter(c => c.cliente === filterCliente);
    }
    if (filterTipoContainer !== "all") {
      result = result.filter(c => c.tipo_conteiner === filterTipoContainer);
    }
    if (filterPortoOrigem !== "all") {
      result = result.filter(c => c.porto_origem === filterPortoOrigem);
    }
    if (filterPortoDestino !== "all") {
      result = result.filter(c => c.porto_destino === filterPortoDestino);
    }
    if (filterCronosStatus !== "all") {
      result = result.filter(c => c.cronos_status === filterCronosStatus);
    }
    if (filterFtSource !== "all") {
      result = result.filter(c => c.ft_source === filterFtSource);
    }
    return result;
  }, [containers, quickFilter, filterArmador, filterCliente, filterTipoContainer, filterPortoOrigem, filterPortoDestino, filterCronosStatus, filterFtSource]);

  // Extract unique values for filter dropdowns
  const uniqueArmadores = useMemo(() => [...new Set(containers.map(c => c.armador).filter(Boolean))].sort() as string[], [containers]);
  const uniqueClientes = useMemo(() => [...new Set(containers.map(c => c.cliente).filter(Boolean))].sort() as string[], [containers]);
  const uniquePortosOrigem = useMemo(() => [...new Set(containers.map(c => c.porto_origem).filter(Boolean))].sort() as string[], [containers]);
  const uniquePortosDestino = useMemo(() => [...new Set(containers.map(c => c.porto_destino).filter(Boolean))].sort() as string[], [containers]);

  const hasActiveFilters = filterArmador !== "all" || filterCliente !== "all" || filterTipoContainer !== "all" || filterPortoOrigem !== "all" || filterPortoDestino !== "all" || filterCronosStatus !== "all" || filterFtSource !== "all" || filterStatus !== "all";

  const clearAllFilters = () => {
    setFilterStatus("all");
    setFilterArmador("all");
    setFilterCliente("all");
    setFilterTipoContainer("all");
    setFilterPortoOrigem("all");
    setFilterPortoDestino("all");
    setFilterCronosStatus("all");
    setFilterFtSource("all");
    setSearchTerm("");
  };

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterStatus, quickFilter, filterArmador, filterCliente, filterTipoContainer, filterPortoOrigem, filterPortoDestino, filterCronosStatus, filterFtSource]);

  const totalPages = Math.ceil(filteredContainers.length / PAGE_SIZE);
  const paginatedContainers = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredContainers.slice(start, start + PAGE_SIZE);
  }, [filteredContainers, currentPage]);

  const handleRefresh = async () => {
    try {
      await syncMutation.mutateAsync();
      await recalcMutation.mutateAsync();
      toast.success("Dados sincronizados e recalculados");
    } catch (error) {
      toast.error("Erro ao sincronizar dados");
    }
  };

  const handleContainerClick = (container: DemurrageContainer) => {
    setSelectedContainer(container);
    setSheetOpen(true);
  };

  const handleExport = async () => {
    if (filteredContainers.length === 0) {
      toast.error("Não há dados para exportar");
      return;
    }
    
    setIsExporting(true);
    try {
      const fileName = exportDemurrageToExcel(filteredContainers);
      toast.success(`Exportado: ${fileName}`);
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Erro ao exportar dados");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPDF = async () => {
    if (filteredContainers.length === 0) {
      toast.error("Não há dados para exportar");
      return;
    }
    try {
      const fileName = exportDemurrageReportPDF(filteredContainers);
      toast.success(`PDF exportado: ${fileName}`);
    } catch (error) {
      toast.error("Erro ao exportar PDF");
    }
  };

  const getRiskBadge = (status: string) => {
    switch (status) {
      case 'safe':
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20"><CheckCircle2 className="h-3 w-3 mr-1" /> OK</Badge>;
      case 'at_risk':
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20"><Clock className="h-3 w-3 mr-1" /> Risco</Badge>;
      case 'critical':
        return <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/30"><AlertTriangle className="h-3 w-3 mr-1" /> Crítico</Badge>;
      case 'exceeded':
        return <Badge className="bg-red-500/10 text-red-500 border-red-500/20"><AlertTriangle className="h-3 w-3 mr-1" /> Excedido</Badge>;
      default:
        return <Badge variant="secondary">Pendente</Badge>;
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(value);
  };

  const getFtSourceBadge = (ftSource: string | null, freeTimeDays: number) => {
    const days = `${freeTimeDays}d`;
    switch (ftSource) {
      case 'PROCESSO':
        return (
          <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
            {days} <span className="text-[10px] ml-1 opacity-70">MBL</span>
          </Badge>
        );
      case 'CONTRATO':
        return (
          <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20">
            {days} <span className="text-[10px] ml-1 opacity-70">Cliente</span>
          </Badge>
        );
      case 'TARIFA':
        return (
          <Badge className="bg-purple-500/10 text-purple-400 border-purple-500/20">
            {days} <span className="text-[10px] ml-1 opacity-70">Tarifa</span>
          </Badge>
        );
      case 'CONTAINER':
        return (
          <Badge variant="outline" className="text-muted-foreground">
            {days}
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary" className="text-muted-foreground">
            {days} <span className="text-[10px] ml-1 opacity-50">Default</span>
          </Badge>
        );
    }
  };

  const rightActions = (
    <div className="flex gap-2">
      <Button 
        variant="outline" 
        className="bg-[rgba(0,0,0,0.7)] border-[rgba(255,255,255,0.25)] text-[#aaaaaa] hover:text-white hover:bg-[rgba(0,0,0,0.9)]"
        onClick={handleExportPDF}
        disabled={filteredContainers.length === 0}
      >
        <FileText className="h-4 w-4 mr-2" />
        PDF
      </Button>
      <Button 
        variant="outline" 
        className="bg-[rgba(0,0,0,0.7)] border-[rgba(255,255,255,0.25)] text-[#aaaaaa] hover:text-white hover:bg-[rgba(0,0,0,0.9)]"
        onClick={handleExport}
        disabled={isExporting || filteredContainers.length === 0}
      >
        {isExporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-2" />}
        Excel
      </Button>
      <Button 
        className="bg-[#ffc800] text-black hover:bg-[#e6b400]"
        onClick={() => setImportDialogOpen(true)}
      >
        <Plus className="h-4 w-4 mr-2" />
        Importar MBL
      </Button>
    </div>
  );

  const customCards = (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        title="TOTAL MONITORADOS"
        value={stats?.total || 0}
        subtitle="Containers ativos"
        icon={<Ship className="h-6 w-6" />}
        variant="default"
        isActive={quickFilter === "all"}
        onClick={() => setQuickFilter("all")}
      />
      <KpiCard
        title="EM TRÂNSITO"
        value={stats?.inTransit || 0}
        subtitle="PENDING, IN_TRANSIT, ARRIVED"
        icon={<TrendingUp className="h-6 w-6" />}
        variant="info"
        isActive={quickFilter === "in_transit"}
        onClick={() => setQuickFilter("in_transit")}
      />
      <KpiCard
        title="EM ALERTA"
        value={stats?.atRisk || 0}
        subtitle="Risco, Crítico ou Excedido"
        icon={<AlertTriangle className="h-6 w-6" />}
        variant="critical"
        isActive={quickFilter === "at_risk"}
        onClick={() => setQuickFilter("at_risk")}
      />
      <KpiCard
        title="ENTREGUES"
        value={stats?.delivered || 0}
        subtitle="GATE_OUT, RETURNED"
        icon={<CheckCircle2 className="h-6 w-6" />}
        variant="success"
        isActive={quickFilter === "delivered"}
        onClick={() => setQuickFilter("delivered")}
      />
    </div>
  );

  return (
    <DemurrageLayout
      loading={isLoading}
      onRefresh={handleRefresh}
      isRefetching={isRefetching || syncMutation.isPending || recalcMutation.isPending}
      rightActions={rightActions}
      customCards={customCards}
    >
      <div className="space-y-4">
        {/* Filters */}
        <Card className="bg-[rgba(5,6,18,0.85)] border-[rgba(255,255,255,0.1)]">
          <CardContent className="pt-4 pb-4">
            <div className="space-y-3">
              {/* Row 1: Search + Risk Status */}
              <div className="flex gap-4 items-center">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input 
                      placeholder="Buscar por container, MBL ou cliente..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]"
                    />
                  </div>
                </div>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-40 bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]">
                    <SelectValue placeholder="Status Risco" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos Riscos</SelectItem>
                    <SelectItem value="safe">OK</SelectItem>
                    <SelectItem value="at_risk">Em Risco</SelectItem>
                    <SelectItem value="critical">Crítico</SelectItem>
                    <SelectItem value="exceeded">Excedido</SelectItem>
                  </SelectContent>
                </Select>
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" onClick={clearAllFilters} className="text-muted-foreground hover:text-white whitespace-nowrap">
                    Limpar Filtros
                  </Button>
                )}
              </div>
              {/* Row 2: Additional filters */}
              <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
                <Select value={filterArmador} onValueChange={setFilterArmador}>
                  <SelectTrigger className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)] text-sm">
                    <SelectValue placeholder="Armador" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos Armadores</SelectItem>
                    {uniqueArmadores.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterCliente} onValueChange={setFilterCliente}>
                  <SelectTrigger className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)] text-sm">
                    <SelectValue placeholder="Cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos Clientes</SelectItem>
                    {uniqueClientes.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterTipoContainer} onValueChange={setFilterTipoContainer}>
                  <SelectTrigger className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)] text-sm">
                    <SelectValue placeholder="Tipo Container" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos Tipos</SelectItem>
                    <SelectItem value="20DV">20DV</SelectItem>
                    <SelectItem value="40DV">40DV</SelectItem>
                    <SelectItem value="40HC">40HC</SelectItem>
                    <SelectItem value="20RF">20RF</SelectItem>
                    <SelectItem value="40RF">40RF</SelectItem>
                    <SelectItem value="45HC">45HC</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterPortoOrigem} onValueChange={setFilterPortoOrigem}>
                  <SelectTrigger className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)] text-sm">
                    <SelectValue placeholder="Porto Origem" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos Origens</SelectItem>
                    {uniquePortosOrigem.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterPortoDestino} onValueChange={setFilterPortoDestino}>
                  <SelectTrigger className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)] text-sm">
                    <SelectValue placeholder="Porto Destino" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos Destinos</SelectItem>
                    {uniquePortosDestino.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterCronosStatus} onValueChange={setFilterCronosStatus}>
                  <SelectTrigger className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)] text-sm">
                    <SelectValue placeholder="Status Cronos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos Status</SelectItem>
                    <SelectItem value="PENDING">PENDING</SelectItem>
                    <SelectItem value="IN_TRANSIT">IN_TRANSIT</SelectItem>
                    <SelectItem value="ARRIVED">ARRIVED</SelectItem>
                    <SelectItem value="GATE_OUT">GATE_OUT</SelectItem>
                    <SelectItem value="RETURNED">RETURNED</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterFtSource} onValueChange={setFilterFtSource}>
                  <SelectTrigger className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)] text-sm">
                    <SelectValue placeholder="Free Time Source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas Fontes</SelectItem>
                    <SelectItem value="PROCESSO">PROCESSO</SelectItem>
                    <SelectItem value="CONTRATO">CONTRATO</SelectItem>
                    <SelectItem value="TARIFA">TARIFA</SelectItem>
                    <SelectItem value="CONTAINER">CONTAINER</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="bg-[rgba(5,6,18,0.85)] border-[rgba(255,255,255,0.1)]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-foreground text-base">
              <Package className="h-5 w-5 text-[#ffc800]" />
              Containers ({filteredContainers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {filteredContainers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum container encontrado</p>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow className="border-[rgba(255,255,255,0.1)]">
                      <TableHead>Container</TableHead>
                      <TableHead>MBL</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Armador</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-center">Free Time</TableHead>
                      <TableHead className="text-center">Dias Rest.</TableHead>
                      <TableHead>Risco</TableHead>
                      <TableHead className="text-right">Demurrage (USD)</TableHead>
                      <TableHead className="text-right">Total BRL</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedContainers.map((container) => (
                      <TableRow 
                        key={container.id} 
                        className="border-[rgba(255,255,255,0.1)] cursor-pointer hover:bg-[rgba(255,200,0,0.05)]"
                        onClick={() => handleContainerClick(container)}
                      >
                        <TableCell className="font-mono font-medium">{container.numero}</TableCell>
                        <TableCell className="font-mono text-sm">{container.mbl}</TableCell>
                        <TableCell>{container.cliente || '-'}</TableCell>
                        <TableCell>{container.armador || '-'}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{container.tipo_conteiner || '-'}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {getFtSourceBadge(container.ft_source, container.free_time_days)}
                        </TableCell>
                        <TableCell className="text-center">
                          {container.days_remaining !== null ? (
                            <Badge variant={container.days_remaining <= 0 ? "destructive" : container.days_remaining <= 2 ? "secondary" : "outline"}>
                              {container.days_remaining}d
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>{getRiskBadge(container.risk_status)}</TableCell>
                        <TableCell className="text-right font-semibold text-[#ffc800]">
                          {container.expected_cost_usd > 0 ? formatCurrency(container.expected_cost_usd) : '-'}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-green-400">
                          {container.expected_cost_usd > 0 && container.pi_exchange_rate
                            ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 }).format(container.expected_cost_usd * container.pi_exchange_rate)
                            : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <TablePagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} maxVisiblePages={5} showFirstLast={false} />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Container Details Sheet */}
      <ContainerDetailsSheet
        container={selectedContainer}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />

      {/* Import MBL Dialog */}
      <ImportMblDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onSuccess={() => refetch()}
      />
    </DemurrageLayout>
  );
}
