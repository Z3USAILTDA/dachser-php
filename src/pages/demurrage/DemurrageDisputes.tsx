import { useState, useMemo, useEffect } from "react";
import { DemurrageLayout } from "@/components/demurrage/DemurrageLayout";
import { KpiCard } from "@/components/demurrage/KpiCard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TablePagination } from "@/components/layout/TablePagination";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Scale, Plus, CheckCircle, XCircle, Clock, MessageSquare, DollarSign, TrendingUp, History } from "lucide-react";
import { useDemurrageData, useUpdateDemurrageContainer, useDemurrageDisputesList, useUpdateDemurrageDispute, useDemurrageContainerEvents, DemurrageContainer, DemurrageDispute } from "@/hooks/useDemurrageData";
import { OpenDisputeDialog } from "@/components/demurrage/OpenDisputeDialog";
import { ResolveDisputeDialog } from "@/components/demurrage/ResolveDisputeDialog";
import { SelectContainerForDisputeDialog } from "@/components/demurrage/SelectContainerForDisputeDialog";
import { ContainerTimeline } from "@/components/demurrage/ContainerTimeline";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { toast } from "sonner";

type QuickFilter = "all" | "total" | "recovered" | "in_progress" | "success_rate";
const PAGE_SIZE = 15;

export default function DemurrageDisputes() {
  const [activeTab, setActiveTab] = useState("all");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [currentPage, setCurrentPage] = useState(1);
  
  // Dialog states
  const [selectContainerOpen, setSelectContainerOpen] = useState(false);
  const [openDisputeDialogOpen, setOpenDisputeDialogOpen] = useState(false);
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [selectedContainer, setSelectedContainer] = useState<DemurrageContainer | null>(null);
  const [resolveType, setResolveType] = useState<"won" | "lost">("won");
  const [selectedDispute, setSelectedDispute] = useState<DemurrageDispute | null>(null);
  const [timelineOpen, setTimelineOpen] = useState(false);

  const { data: containers = [], isLoading: containersLoading } = useDemurrageData();
  const { data: disputes = [], isLoading: disputesLoading } = useDemurrageDisputesList();
  const updateContainer = useUpdateDemurrageContainer();
  const updateDispute = useUpdateDemurrageDispute();
  
  const isLoading = containersLoading || disputesLoading;

  // Merge disputes with container data for display
  const disputeContainers = useMemo(() => {
    // Create a map of containers by ID for quick lookup
    const containerMap = new Map<number, DemurrageContainer>();
    containers.forEach(c => containerMap.set(c.id, c));
    
    // Use disputes from the dedicated table, enriching with container data
    return disputes.map(d => {
      const container = containerMap.get(d.container_id);
      return {
        ...d,
        numero: d.container_number || container?.numero || '-',
        cliente: d.client_name || container?.cliente || '-',
        armador: d.armador || container?.armador || '-',
        container,
      };
    });
  }, [disputes, containers]);

  const formatCurrency = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(value);

  const getStatusLabel = (status: string | null) => {
    const labels: Record<string, string> = { opened: 'Aberta', negotiating: 'Em negociação', won: 'Ganha', lost: 'Perdida' };
    return labels[status || ''] || status || 'Pendente';
  };

  const getStatusBadge = (status: string | null) => {
    const Icon = status === 'opened' ? Clock : status === 'negotiating' ? MessageSquare : status === 'won' ? CheckCircle : status === 'lost' ? XCircle : Clock;
    const colors: Record<string, string> = {
      opened: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
      negotiating: "bg-blue-500/10 text-blue-500 border-blue-500/20",
      won: "bg-green-500/10 text-green-500 border-green-500/20",
      lost: "bg-red-500/10 text-red-500 border-red-500/20",
    };
    
    return (
      <Badge className={colors[status || ''] || "bg-gray-500/10 text-gray-500 border-gray-500/20"}>
        <Icon className="h-3 w-3 mr-1" />
        {getStatusLabel(status)}
      </Badge>
    );
  };

  const stats = useMemo(() => {
    const total = disputeContainers.length;
    const opened = disputeContainers.filter(d => d.status === 'opened').length;
    const negotiating = disputeContainers.filter(d => d.status === 'negotiating').length;
    const won = disputeContainers.filter(d => d.status === 'won').length;
    const lost = disputeContainers.filter(d => d.status === 'lost').length;
    const totalDisputed = disputeContainers.reduce((sum, d) => sum + (d.disputed_amount_usd || 0), 0);
    const totalRecovered = disputeContainers.reduce((sum, d) => sum + (d.recovered_amount_usd || 0), 0);
    const inProgress = opened + negotiating;
    const successRate = won + lost > 0 ? Math.round((won / (won + lost)) * 100) : 0;

    return { total, opened, negotiating, won, lost, totalDisputed, totalRecovered, inProgress, successRate };
  }, [disputeContainers]);

  const filteredDisputes = useMemo(() => {
    if (activeTab === 'all') return disputeContainers;
    return disputeContainers.filter(d => d.status === activeTab);
  }, [disputeContainers, activeTab]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, quickFilter]);

  const totalPages = Math.ceil(filteredDisputes.length / PAGE_SIZE);
  const paginatedDisputes = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredDisputes.slice(start, start + PAGE_SIZE);
  }, [filteredDisputes, currentPage]);

  const handleQuickFilterChange = (filter: QuickFilter) => {
    setQuickFilter(filter);
    if (filter === "in_progress") {
      setActiveTab("negotiating");
    } else {
      setActiveTab("all");
    }
  };

  // Handler: Open new dispute button
  const handleOpenNewDispute = () => {
    setSelectContainerOpen(true);
  };

  // Handler: Container selected from list
  const handleContainerSelected = (container: DemurrageContainer) => {
    setSelectedContainer(container);
    setOpenDisputeDialogOpen(true);
  };

  // Handler: Submit new dispute
  const handleSubmitDispute = async (data: { disputed_amount_usd: number; dispute_reason: string }) => {
    if (!selectedContainer) return;
    
    try {
      await updateContainer.mutateAsync({
        containerId: selectedContainer.id,
        updates: {
          dispute_status: 'opened',
          disputed_amount_usd: data.disputed_amount_usd,
          dispute_reason: data.dispute_reason,
          recovered_amount_usd: 0,
        }
      });
      toast.success("Disputa aberta com sucesso!");
      setSelectedContainer(null);
    } catch (error) {
      console.error('Error opening dispute:', error);
      toast.error("Erro ao abrir disputa");
      throw error;
    }
  };

  // Handler: Mark as negotiating (uses dispute from table)
  type DisputeWithContainer = typeof disputeContainers[0];
  
  const handleNegotiate = async (dispute: DisputeWithContainer) => {
    try {
      await updateDispute.mutateAsync({
        disputeId: dispute.id,
        updates: {
          status: 'negotiating',
        }
      });
      toast.success("Disputa marcada como em negociação");
    } catch (error) {
      console.error('Error updating dispute:', error);
      toast.error("Erro ao atualizar disputa");
    }
  };

  // Handler: Open resolve dialog (won/lost)
  const handleOpenResolveDialog = (dispute: DisputeWithContainer, type: "won" | "lost") => {
    setSelectedDispute(dispute);
    if (dispute.container) {
      setSelectedContainer(dispute.container);
    }
    setResolveType(type);
    setResolveDialogOpen(true);
  };

  // Handler: Submit resolution
  const handleSubmitResolution = async (data: { recovered_amount_usd: number; notes?: string }) => {
    if (!selectedDispute) return;
    
    try {
      await updateDispute.mutateAsync({
        disputeId: selectedDispute.id,
        updates: {
          status: resolveType,
          recovered_amount_usd: data.recovered_amount_usd,
          resolution_notes: data.notes || null,
          resolved_at: new Date().toISOString(),
        },
      });
      
      toast.success(resolveType === 'won' ? "Disputa marcada como ganha!" : "Disputa marcada como perdida");
      setSelectedDispute(null);
      setSelectedContainer(null);
    } catch (error) {
      console.error('Error resolving dispute:', error);
      toast.error("Erro ao resolver disputa");
      throw error;
    }
  };

  // Handler: View timeline
  const handleViewTimeline = (dispute: DisputeWithContainer) => {
    setSelectedDispute(dispute);
    setTimelineOpen(true);
  };

  const rightActions = (
    <Button onClick={handleOpenNewDispute} className="bg-[#ffc800] text-black hover:bg-[#e6b400]">
      <Plus className="h-4 w-4 mr-2" />
      Abrir Disputa
    </Button>
  );

  const customCards = (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        title="TOTAL DISPUTADO"
        value={formatCurrency(stats.totalDisputed)}
        subtitle={`${stats.total} disputa(s)`}
        icon={<DollarSign className="h-6 w-6" />}
        variant="default"
        isActive={quickFilter === "total"}
        onClick={() => handleQuickFilterChange("total")}
      />
      <KpiCard
        title="VALOR RECUPERADO"
        value={formatCurrency(stats.totalRecovered)}
        subtitle={`${stats.won} disputa(s) ganha(s)`}
        icon={<TrendingUp className="h-6 w-6" />}
        variant="success"
        isActive={quickFilter === "recovered"}
        onClick={() => handleQuickFilterChange("recovered")}
      />
      <KpiCard
        title="EM ANDAMENTO"
        value={stats.inProgress}
        subtitle="Abertas + Negociando"
        icon={<Clock className="h-6 w-6" />}
        variant="info"
        isActive={quickFilter === "in_progress"}
        onClick={() => handleQuickFilterChange("in_progress")}
      />
      <KpiCard
        title="TAXA DE SUCESSO"
        value={`${stats.successRate}%`}
        subtitle={`${stats.won}W / ${stats.lost}L`}
        icon={<CheckCircle className="h-6 w-6" />}
        variant="success"
        isActive={quickFilter === "success_rate"}
        onClick={() => handleQuickFilterChange("success_rate")}
      />
    </div>
  );

  return (
    <DemurrageLayout
      rightActions={rightActions}
      customCards={customCards}
      loading={isLoading}
    >
      <div className="space-y-4">
        {/* Inner Nav */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="all">Todas ({stats.total})</TabsTrigger>
            <TabsTrigger value="opened">Abertas ({stats.opened})</TabsTrigger>
            <TabsTrigger value="negotiating">Negociando ({stats.negotiating})</TabsTrigger>
            <TabsTrigger value="won">Ganhas ({stats.won})</TabsTrigger>
            <TabsTrigger value="lost">Perdidas ({stats.lost})</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Content */}
        <Card className="bg-[rgba(5,6,18,0.85)] border-[rgba(255,255,255,0.1)]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-foreground text-base">
              <Scale className="h-5 w-5 text-[#ffc800]" />
              Disputas
            </CardTitle>
            <CardDescription>{filteredDisputes.length} disputa(s)</CardDescription>
          </CardHeader>
          <CardContent>
            {filteredDisputes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Scale className="h-12 w-12 mb-4 opacity-50" />
                <p>Nenhuma disputa encontrada</p>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow className="border-[rgba(255,255,255,0.1)]">
                      <TableHead>Container</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Armador</TableHead>
                      <TableHead className="text-right">Valor Disputado</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Motivo</TableHead>
                      <TableHead className="text-right">Recuperado</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedDisputes.map((dispute) => (
                      <TableRow key={dispute.id} className="border-[rgba(255,255,255,0.1)]">
                        <TableCell className="font-mono">{dispute.numero}</TableCell>
                        <TableCell>{dispute.cliente || '-'}</TableCell>
                        <TableCell>{dispute.armador || '-'}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(dispute.disputed_amount_usd)}</TableCell>
                        <TableCell>{getStatusBadge(dispute.status)}</TableCell>
                        <TableCell className="max-w-[150px] truncate" title={dispute.reason || ''}>
                          {dispute.reason || '-'}
                        </TableCell>
                        <TableCell className="text-right font-medium text-green-500">
                          {dispute.status === 'won' ? formatCurrency(dispute.recovered_amount_usd) : '-'}
                        </TableCell>
                        <TableCell>
                          <TooltipProvider>
                            <div className="flex gap-1">
                              {dispute.status === 'opened' && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button 
                                      size="sm" 
                                      variant="outline" 
                                      className="border-[rgba(255,255,255,0.2)] text-xs"
                                      onClick={() => handleNegotiate(dispute)}
                                      disabled={updateDispute.isPending}
                                    >
                                      <MessageSquare className="h-3 w-3 mr-1" />
                                      Negociar
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Iniciar negociação</TooltipContent>
                                </Tooltip>
                              )}
                              {(dispute.status === 'opened' || dispute.status === 'negotiating') && (
                                <>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button 
                                        size="sm" 
                                        className="bg-green-500/20 text-green-500 hover:bg-green-500/30 h-8 w-8 p-0"
                                        onClick={() => handleOpenResolveDialog(dispute, "won")}
                                        disabled={updateDispute.isPending}
                                      >
                                        <CheckCircle className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Marcar como ganha</TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button 
                                        size="sm" 
                                        className="bg-red-500/20 text-red-500 hover:bg-red-500/30 h-8 w-8 p-0"
                                        onClick={() => handleOpenResolveDialog(dispute, "lost")}
                                        disabled={updateDispute.isPending}
                                      >
                                        <XCircle className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Marcar como perdida</TooltipContent>
                                  </Tooltip>
                                </>
                              )}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button 
                                    size="sm" 
                                    variant="ghost" 
                                    className="h-8 w-8 p-0"
                                    onClick={() => handleViewTimeline(dispute)}
                                  >
                                    <History className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Ver histórico</TooltipContent>
                              </Tooltip>
                            </div>
                          </TooltipProvider>
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

      {/* Dialogs */}
      <SelectContainerForDisputeDialog
        open={selectContainerOpen}
        onOpenChange={setSelectContainerOpen}
        containers={containers}
        onSelect={handleContainerSelected}
      />
      
      <OpenDisputeDialog
        open={openDisputeDialogOpen}
        onOpenChange={setOpenDisputeDialogOpen}
        container={selectedContainer}
        onSubmit={handleSubmitDispute}
        isLoading={updateContainer.isPending}
      />
      
      <ResolveDisputeDialog
        open={resolveDialogOpen}
        onOpenChange={setResolveDialogOpen}
        container={selectedContainer}
        resolution={resolveType}
        onSubmit={handleSubmitResolution}
        isLoading={updateDispute.isPending}
      />

      {/* Timeline Sheet */}
      <Sheet open={timelineOpen} onOpenChange={setTimelineOpen}>
        <SheetContent className="bg-[rgba(5,6,18,0.95)] border-[rgba(255,255,255,0.1)] w-[500px] sm:max-w-[500px]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-[#ffc800]" />
              Histórico da Disputa
            </SheetTitle>
            <SheetDescription>
              {selectedDispute?.container_number} - {selectedDispute?.client_name}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="p-4 bg-[rgba(255,255,255,0.05)] rounded-lg">
              <p className="text-sm text-muted-foreground">Status atual</p>
              <p className="font-medium">{selectedDispute?.status === 'opened' ? 'Aberta' : selectedDispute?.status === 'negotiating' ? 'Em negociação' : selectedDispute?.status === 'won' ? 'Ganha' : 'Perdida'}</p>
            </div>
            <div className="p-4 bg-[rgba(255,255,255,0.05)] rounded-lg">
              <p className="text-sm text-muted-foreground">Valor Disputado</p>
              <p className="font-medium text-[#ffc800]">{formatCurrency(selectedDispute?.disputed_amount_usd || 0)}</p>
            </div>
            {selectedDispute?.reason && (
              <div className="p-4 bg-[rgba(255,255,255,0.05)] rounded-lg">
                <p className="text-sm text-muted-foreground">Motivo</p>
                <p className="text-sm">{selectedDispute.reason}</p>
              </div>
            )}
            {selectedDispute?.resolution_notes && (
              <div className="p-4 bg-[rgba(255,255,255,0.05)] rounded-lg">
                <p className="text-sm text-muted-foreground">Notas de Resolução</p>
                <p className="text-sm">{selectedDispute.resolution_notes}</p>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </DemurrageLayout>
  );
}
