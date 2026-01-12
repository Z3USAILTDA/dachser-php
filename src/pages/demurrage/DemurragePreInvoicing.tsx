import { useState, useMemo, useEffect } from "react";
import { DemurrageLayout } from "@/components/demurrage/DemurrageLayout";
import { KpiCard } from "@/components/demurrage/KpiCard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  FileText, Clock, CheckCircle2, Send, Eye, AlertTriangle, DollarSign,
  MoreHorizontal, FileSpreadsheet, Loader2
} from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { TablePagination } from "@/components/layout/TablePagination";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator,
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDemurrageData, useUpdateDemurrageContainer, type DemurrageContainer } from "@/hooks/useDemurrageData";
import { toast } from "sonner";
import { exportDemurrageToExcel } from "@/utils/demurrageExcelExport";

type QuickFilter = "all" | "waiting" | "total_usd" | "pending";
type BulkAction = "revisar" | "lancar" | "marcar_pago" | null;
const PAGE_SIZE = 15;

export default function DemurragePreInvoicing() {
  const [activeTab, setActiveTab] = useState("all");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkAction, setBulkAction] = useState<BulkAction>(null);
  const [isExporting, setIsExporting] = useState(false);

  const { data: containers = [], isLoading, refetch } = useDemurrageData();
  const updateMutation = useUpdateDemurrageContainer();

  // Filter containers that have pre-invoice data or expected_cost > 0
  const invoiceableContainers = useMemo(() => {
    return containers.filter(c => c.expected_cost_usd > 0 || c.pre_invoice_number);
  }, [containers]);

  const formatCurrency = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

  const getWorkflowBadge = (status: string) => {
    switch (status) {
      case 'CALCULADO':
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20"><Clock className="h-3 w-3 mr-1" />Calculada</Badge>;
      case 'REVISADO':
        return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20"><Eye className="h-3 w-3 mr-1" />Revisada</Badge>;
      case 'ENVIADO':
        return <Badge className="bg-purple-500/10 text-purple-500 border-purple-500/20"><Send className="h-3 w-3 mr-1" />Lançada</Badge>;
      case 'FATURADO':
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20"><CheckCircle2 className="h-3 w-3 mr-1" />Faturada</Badge>;
      case 'PAGO':
        return <Badge className="bg-green-600/10 text-green-400 border-green-600/20"><CheckCircle2 className="h-3 w-3 mr-1" />Paga</Badge>;
      default:
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pendente</Badge>;
    }
  };

  const stats = useMemo(() => {
    const total = invoiceableContainers.length;
    const calculated = invoiceableContainers.filter(c => c.pre_invoice_status === 'PENDENTE' || !c.pre_invoice_status).length;
    const reviewed = invoiceableContainers.filter(c => c.pre_invoice_status === 'REVISADO').length;
    const sent = invoiceableContainers.filter(c => c.pre_invoice_status === 'ENVIADO').length;
    const finalized = invoiceableContainers.filter(c => ['FATURADO', 'PAGO'].includes(c.pre_invoice_status)).length;
    const totalUsd = invoiceableContainers.reduce((sum, c) => sum + (c.expected_cost_usd || 0), 0);
    const pendingUsd = invoiceableContainers
      .filter(c => !['FATURADO', 'PAGO'].includes(c.pre_invoice_status))
      .reduce((sum, c) => sum + (c.expected_cost_usd || 0), 0);

    return { total, calculated, reviewed, sent, finalized, totalUsd, pendingUsd };
  }, [invoiceableContainers]);

  const filteredInvoices = useMemo(() => {
    if (activeTab === 'all') return invoiceableContainers;
    
    const statusMap: Record<string, string[]> = {
      calculated: ['PENDENTE', ''],
      reviewed: ['REVISADO'],
      sent_to_otelo: ['ENVIADO'],
      finalized: ['FATURADO', 'PAGO'],
    };
    
    const validStatuses = statusMap[activeTab] || [];
    return invoiceableContainers.filter(c => 
      validStatuses.includes(c.pre_invoice_status) || 
      (activeTab === 'calculated' && !c.pre_invoice_status)
    );
  }, [invoiceableContainers, activeTab]);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, [activeTab, quickFilter]);

  const totalPages = Math.ceil(filteredInvoices.length / PAGE_SIZE);
  const paginatedInvoices = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredInvoices.slice(start, start + PAGE_SIZE);
  }, [filteredInvoices, currentPage]);

  const handleQuickFilterChange = (filter: QuickFilter) => {
    setQuickFilter(filter);
    if (filter === "waiting") {
      setActiveTab("calculated");
    } else {
      setActiveTab("all");
    }
  };

  // Selection handlers
  const toggleSelectAll = () => {
    if (selectedIds.size === paginatedInvoices.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedInvoices.map(c => c.id)));
    }
  };

  const toggleSelect = (id: number) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  // Action handlers
  const handleSingleAction = async (container: DemurrageContainer, newStatus: string) => {
    try {
      await updateMutation.mutateAsync({
        containerId: container.id,
        updates: { pre_invoice_status: newStatus }
      });
      toast.success(`Container ${container.numero} atualizado para ${newStatus}`);
    } catch (error) {
      toast.error("Erro ao atualizar status");
    }
  };

  const handleBulkAction = async () => {
    if (!bulkAction || selectedIds.size === 0) return;

    const statusMap: Record<string, string> = {
      revisar: 'REVISADO',
      lancar: 'ENVIADO',
      marcar_pago: 'PAGO',
    };

    const newStatus = statusMap[bulkAction];
    const selectedContainers = filteredInvoices.filter(c => selectedIds.has(c.id));

    try {
      await Promise.all(
        selectedContainers.map(c => 
          updateMutation.mutateAsync({
            containerId: c.id,
            updates: { pre_invoice_status: newStatus }
          })
        )
      );
      toast.success(`${selectedContainers.length} container(s) atualizado(s) para ${newStatus}`);
      setSelectedIds(new Set());
      refetch();
    } catch (error) {
      toast.error("Erro ao atualizar containers");
    } finally {
      setBulkAction(null);
    }
  };

  const handleExport = async () => {
    if (filteredInvoices.length === 0) {
      toast.error("Não há dados para exportar");
      return;
    }
    
    setIsExporting(true);
    try {
      const fileName = exportDemurrageToExcel(filteredInvoices);
      toast.success(`Exportado: ${fileName}`);
    } catch (error) {
      toast.error("Erro ao exportar dados");
    } finally {
      setIsExporting(false);
    }
  };

  const getBulkActionLabel = () => {
    switch (bulkAction) {
      case 'revisar': return 'Marcar como Revisada';
      case 'lancar': return 'Lançar no Othello';
      case 'marcar_pago': return 'Marcar como Pago';
      default: return '';
    }
  };

  const rightActions = (
    <div className="flex gap-2">
      {selectedIds.size > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="bg-[#ffc800] text-black hover:bg-[#ffdc50]">
              Ações ({selectedIds.size})
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-[#1a1a1a] border-[rgba(255,255,255,0.1)]">
            <DropdownMenuItem onClick={() => setBulkAction('revisar')} className="cursor-pointer">
              <Eye className="h-4 w-4 mr-2" />
              Marcar como Revisada
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setBulkAction('lancar')} className="cursor-pointer">
              <Send className="h-4 w-4 mr-2" />
              Lançar no Othello
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-[rgba(255,255,255,0.1)]" />
            <DropdownMenuItem onClick={() => setBulkAction('marcar_pago')} className="cursor-pointer text-green-400">
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Marcar como Pago
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <Button 
        variant="outline" 
        className="bg-[rgba(0,0,0,0.7)] border-[rgba(255,255,255,0.25)] text-[#aaaaaa] hover:text-white hover:bg-[rgba(0,0,0,0.9)]"
        onClick={handleExport}
        disabled={isExporting || filteredInvoices.length === 0}
      >
        {isExporting ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <FileSpreadsheet className="h-4 w-4 mr-2" />
        )}
        Exportar
      </Button>
    </div>
  );

  const customCards = (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        title="TOTAL PRÉ-FATURAS"
        value={stats.total}
        subtitle="Containers com demurrage"
        icon={<FileText className="h-6 w-6" />}
        variant="default"
        isActive={quickFilter === "all"}
        onClick={() => handleQuickFilterChange("all")}
      />
      <KpiCard
        title="AGUARDANDO REVISÃO"
        value={stats.calculated}
        subtitle="Calculadas pendentes"
        icon={<Clock className="h-6 w-6" />}
        variant="warning"
        isActive={quickFilter === "waiting"}
        onClick={() => handleQuickFilterChange("waiting")}
      />
      <KpiCard
        title="TOTAL USD"
        value={formatCurrency(stats.totalUsd)}
        subtitle="Valor consolidado"
        icon={<DollarSign className="h-6 w-6" />}
        variant="info"
        isActive={quickFilter === "total_usd"}
        onClick={() => handleQuickFilterChange("total_usd")}
      />
      <KpiCard
        title="PENDENTE"
        value={formatCurrency(stats.pendingUsd)}
        subtitle="Aguardando pagamento"
        icon={<AlertTriangle className="h-6 w-6" />}
        variant="critical"
        isActive={quickFilter === "pending"}
        onClick={() => handleQuickFilterChange("pending")}
      />
    </div>
  );

  return (
    <DemurrageLayout customCards={customCards} loading={isLoading} rightActions={rightActions}>
      <div className="space-y-4">
        {/* Inner Nav */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="all">Todas ({stats.total})</TabsTrigger>
            <TabsTrigger value="calculated">Pendentes ({stats.calculated})</TabsTrigger>
            <TabsTrigger value="reviewed">Revisadas ({stats.reviewed})</TabsTrigger>
            <TabsTrigger value="sent_to_otelo">Lançadas ({stats.sent})</TabsTrigger>
            <TabsTrigger value="finalized">Finalizadas ({stats.finalized})</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Content */}
        <Card className="bg-[rgba(5,6,18,0.85)] border-[rgba(255,255,255,0.1)]">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-foreground text-base">
                  <FileText className="h-5 w-5 text-[#ffc800]" />
                  Pré-Faturas
                </CardTitle>
                <CardDescription>{filteredInvoices.length} encontrada(s)</CardDescription>
              </div>
              {selectedIds.size > 0 && (
                <Badge variant="outline" className="text-[#ffc800] border-[#ffc800]/30">
                  {selectedIds.size} selecionado(s)
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!filteredInvoices.length ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhuma pré-fatura encontrada</p>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow className="border-[rgba(255,255,255,0.1)]">
                      <TableHead className="w-[50px]">
                        <Checkbox 
                          checked={selectedIds.size === paginatedInvoices.length && paginatedInvoices.length > 0}
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                      <TableHead>Container</TableHead>
                      <TableHead>MBL</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Armador</TableHead>
                      <TableHead className="text-center">Dias Exc.</TableHead>
                      <TableHead className="text-right">Total USD</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedInvoices.map((container) => (
                      <TableRow 
                        key={container.id} 
                        className={`border-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,200,0,0.05)] ${
                          selectedIds.has(container.id) ? 'bg-[rgba(255,200,0,0.08)]' : ''
                        }`}
                      >
                        <TableCell>
                          <Checkbox 
                            checked={selectedIds.has(container.id)}
                            onCheckedChange={() => toggleSelect(container.id)}
                          />
                        </TableCell>
                        <TableCell className="font-mono font-medium">{container.numero}</TableCell>
                        <TableCell className="font-mono text-sm">{container.mbl}</TableCell>
                        <TableCell>{container.cliente || '-'}</TableCell>
                        <TableCell>{container.armador || '-'}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={container.excedente_dias > 0 ? "destructive" : "outline"}>
                            {container.excedente_dias}d
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold text-[#ffc800]">
                          {formatCurrency(container.expected_cost_usd)}
                        </TableCell>
                        <TableCell>{getWorkflowBadge(container.pre_invoice_status)}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-[#1a1a1a] border-[rgba(255,255,255,0.1)]">
                              <DropdownMenuItem 
                                onClick={() => handleSingleAction(container, 'REVISADO')}
                                className="cursor-pointer"
                                disabled={container.pre_invoice_status === 'REVISADO'}
                              >
                                <Eye className="h-4 w-4 mr-2" />
                                Marcar como Revisada
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => handleSingleAction(container, 'ENVIADO')}
                                className="cursor-pointer"
                                disabled={container.pre_invoice_status === 'ENVIADO'}
                              >
                                <Send className="h-4 w-4 mr-2" />
                                Lançar no Othello
                              </DropdownMenuItem>
                              <DropdownMenuSeparator className="bg-[rgba(255,255,255,0.1)]" />
                              <DropdownMenuItem 
                                onClick={() => handleSingleAction(container, 'PAGO')}
                                className="cursor-pointer text-green-400"
                                disabled={container.pre_invoice_status === 'PAGO'}
                              >
                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                Marcar como Pago
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <TablePagination 
                  currentPage={currentPage} 
                  totalPages={totalPages} 
                  onPageChange={setCurrentPage} 
                  maxVisiblePages={5} 
                  showFirstLast={false} 
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bulk Action Confirmation Dialog */}
      <AlertDialog open={!!bulkAction} onOpenChange={(open) => !open && setBulkAction(null)}>
        <AlertDialogContent className="bg-[rgba(5,6,18,0.95)] border-[rgba(255,255,255,0.1)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Ação em Lote</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a <strong className="text-white">{getBulkActionLabel()}</strong> para{" "}
              <strong className="text-[#ffc800]">{selectedIds.size}</strong> container(s).
              <br /><br />
              Esta ação atualizará o status de pré-faturamento de todos os containers selecionados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-[rgba(255,255,255,0.2)]">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkAction}
              className="bg-[#ffc800] text-black hover:bg-[#ffdc50]"
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? "Processando..." : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DemurrageLayout>
  );
}
