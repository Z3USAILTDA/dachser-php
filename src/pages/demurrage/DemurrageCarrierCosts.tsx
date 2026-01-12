import { useState, useMemo, useEffect } from "react";
import { DemurrageLayout } from "@/components/demurrage/DemurrageLayout";
import { KpiCard } from "@/components/demurrage/KpiCard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Ship, Plus, Search, AlertTriangle, CheckCircle2, FileSearch, FileSpreadsheet, DollarSign, Clock, Calculator, TrendingUp, TrendingDown, Minus, FileWarning, CheckCheck } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TablePagination } from "@/components/layout/TablePagination";
import { useDemurrageData, useUpdateDemurrageContainer } from "@/hooks/useDemurrageData";
import { AuditCostDialog, AuditData } from "@/components/demurrage/AuditCostDialog";
import { BulkAuditDialog } from "@/components/demurrage/BulkAuditDialog";
import { NewInvoiceDialog } from "@/components/demurrage/NewInvoiceDialog";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { exportDiscrepancyReport } from "@/utils/demurrageExcelExport";

type QuickFilter = "all" | "validated" | "discrepancy" | "pending";
const PAGE_SIZE = 15;

export default function DemurrageCarrierCosts() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [auditDialogOpen, setAuditDialogOpen] = useState(false);
  const [bulkAuditDialogOpen, setBulkAuditDialogOpen] = useState(false);
  const [newInvoiceDialogOpen, setNewInvoiceDialogOpen] = useState(false);
  const [selectedContainer, setSelectedContainer] = useState<typeof containers[0] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isSubmittingInvoice, setIsSubmittingInvoice] = useState(false);

  const { data: containers = [], isLoading } = useDemurrageData();
  const updateContainer = useUpdateDemurrageContainer();

  // Filter containers that have carrier invoice data OR have demurrage to audit
  const carrierContainers = useMemo(() => {
    return containers.filter(c => c.armador_invoice_number || c.armador_cost_usd || c.excedente_dias > 0);
  }, [containers]);

  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(value);

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'validated':
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20"><CheckCircle2 className="h-3 w-3 mr-1" /> Validada</Badge>;
      case 'discrepancy':
        return <Badge className="bg-red-500/10 text-red-500 border-red-500/20"><AlertTriangle className="h-3 w-3 mr-1" /> Discrepância</Badge>;
      case 'disputed':
        return <Badge className="bg-orange-500/10 text-orange-500 border-orange-500/20"><AlertTriangle className="h-3 w-3 mr-1" /> Em Disputa</Badge>;
      default:
        return <Badge variant="secondary"><FileSearch className="h-3 w-3 mr-1" /> Pendente</Badge>;
    }
  };

  const getDiffBadge = (container: typeof containers[0]) => {
    const carrierCost = container.armador_cost_usd || 0;
    const calculatedCost = container.expected_cost_usd || 0;
    const diff = carrierCost - calculatedCost;
    
    if (carrierCost === 0) return null;
    
    const tolerance = Math.max(calculatedCost * 0.05, 50);
    if (Math.abs(diff) <= tolerance) {
      return (
        <span className="flex items-center gap-1 text-green-400 text-xs">
          <Minus className="h-3 w-3" /> OK
        </span>
      );
    }
    
    if (diff > 0) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex items-center gap-1 text-red-400 text-xs cursor-help">
                <TrendingUp className="h-3 w-3" /> +{formatCurrency(diff)}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>Cobrança acima do calculado</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex items-center gap-1 text-orange-400 text-xs cursor-help">
              <TrendingDown className="h-3 w-3" /> {formatCurrency(diff)}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>Cobrança abaixo do calculado</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  const stats = useMemo(() => {
    const totalCost = carrierContainers.reduce((sum, c) => sum + (c.armador_cost_usd || 0), 0);
    const totalCalculated = carrierContainers.reduce((sum, c) => sum + (c.expected_cost_usd || 0), 0);
    const validated = carrierContainers.filter(c => c.audit_status === 'validated').reduce((sum, c) => sum + (c.armador_cost_usd || 0), 0);
    const discrepancy = carrierContainers.filter(c => c.audit_status === 'discrepancy' || c.audit_status === 'disputed').reduce((sum, c) => sum + (c.armador_cost_usd || 0), 0);
    const pending = carrierContainers.filter(c => !c.audit_status || c.audit_status === 'pending').reduce((sum, c) => sum + (c.expected_cost_usd || 0), 0);
    
    // Total discrepancy amount (overcharges)
    const totalDiscrepancyAmount = carrierContainers
      .filter(c => c.audit_status === 'discrepancy' || c.audit_status === 'disputed')
      .reduce((sum, c) => sum + Math.max(0, (c.armador_cost_usd || 0) - (c.expected_cost_usd || 0)), 0);

    return { totalCost, totalCalculated, validated, discrepancy, pending, totalDiscrepancyAmount };
  }, [carrierContainers]);

  const filteredInvoices = useMemo(() => {
    return carrierContainers.filter(c => {
      const matchesSearch = 
        searchTerm === "" ||
        (c.armador_invoice_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.armador || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.numero.toLowerCase().includes(searchTerm.toLowerCase());
      
      let matchesQuickFilter = true;
      if (quickFilter === "discrepancy") {
        matchesQuickFilter = c.audit_status === 'discrepancy' || c.audit_status === 'disputed';
      } else if (quickFilter !== "all") {
        matchesQuickFilter = c.audit_status === quickFilter || (!c.audit_status && quickFilter === "pending");
      }
      
      let matchesStatus = true;
      if (statusFilter === "discrepancy") {
        matchesStatus = c.audit_status === 'discrepancy' || c.audit_status === 'disputed';
      } else if (statusFilter !== "all") {
        matchesStatus = c.audit_status === statusFilter || (!c.audit_status && statusFilter === "pending");
      }
      
      return matchesSearch && matchesQuickFilter && matchesStatus;
    });
  }, [carrierContainers, searchTerm, quickFilter, statusFilter]);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, [searchTerm, quickFilter, statusFilter]);

  // Selection handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(filteredInvoices.map(c => c.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (id: number, checked: boolean) => {
    const newSet = new Set(selectedIds);
    if (checked) {
      newSet.add(id);
    } else {
      newSet.delete(id);
    }
    setSelectedIds(newSet);
  };

  const selectedContainers = useMemo(() => {
    return containers.filter(c => selectedIds.has(c.id));
  }, [containers, selectedIds]);

  const handleBulkAuditSuccess = () => {
    setSelectedIds(new Set());
    setBulkAuditDialogOpen(false);
  };

  const totalPages = Math.ceil(filteredInvoices.length / PAGE_SIZE);
  const paginatedInvoices = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredInvoices.slice(start, start + PAGE_SIZE);
  }, [filteredInvoices, currentPage]);

  const handleQuickFilterChange = (filter: QuickFilter) => {
    setQuickFilter(filter);
  };

  const handleOpenAudit = (container: typeof containers[0]) => {
    setSelectedContainer(container);
    setAuditDialogOpen(true);
  };

  const handleAudit = async (containerId: number, auditData: AuditData) => {
    try {
      await updateContainer.mutateAsync({
        containerId,
        updates: {
          armador_invoice_number: auditData.armador_invoice_number,
          armador_cost_usd: auditData.armador_cost_usd,
          armador_days_charged: auditData.armador_days_charged,
          audit_status: auditData.audit_status,
          discrepancy_usd: auditData.discrepancy_usd,
          notes: auditData.audit_notes || null,
          // If opening dispute, also set dispute fields
          ...(auditData.audit_status === 'disputed' && {
            dispute_status: 'open',
            dispute_reason: `Discrepância de ${formatCurrency(auditData.discrepancy_usd)} detectada na auditoria`,
            disputed_amount_usd: Math.abs(auditData.discrepancy_usd),
          }),
        },
      });
      
      const statusMessages = {
        validated: 'Fatura validada com sucesso',
        discrepancy: 'Discrepância registrada',
        disputed: 'Disputa aberta com sucesso',
      };
      
      toast.success(statusMessages[auditData.audit_status]);
      setAuditDialogOpen(false);
      setSelectedContainer(null);
    } catch (error) {
      toast.error('Erro ao processar auditoria');
      console.error(error);
    }
  };

  const handleExportDiscrepancies = () => {
    try {
      const fileName = exportDiscrepancyReport(containers);
      toast.success(`Relatório exportado: ${fileName}`);
    } catch (error) {
      toast.error('Erro ao exportar relatório');
      console.error(error);
    }
  };

  const discrepancyCount = useMemo(() => {
    return containers.filter(c => 
      c.audit_status === 'discrepancy' || 
      c.audit_status === 'disputed' ||
      (c.armador_cost_usd && c.armador_cost_usd > 0 && Math.abs((c.armador_cost_usd || 0) - c.expected_cost_usd) > Math.max(c.expected_cost_usd * 0.05, 50))
    ).length;
  }, [containers]);

  const rightActions = (
    <div className="flex gap-2">
      {selectedIds.size > 0 && (
        <Button 
          variant="outline" 
          onClick={() => setBulkAuditDialogOpen(true)}
          className="bg-[#ffc800]/10 border-[#ffc800]/30 text-[#ffc800] hover:bg-[#ffc800]/20"
        >
          <CheckCheck className="h-4 w-4 mr-2" />
          Auditar Selecionados ({selectedIds.size})
        </Button>
      )}
      <Button 
        variant="outline" 
        onClick={handleExportDiscrepancies}
        disabled={discrepancyCount === 0}
        className="bg-red-500/10 border-red-500/30 text-red-400 hover:text-red-300 hover:bg-red-500/20"
      >
        <FileWarning className="h-4 w-4 mr-2" />
        Exportar Discrepâncias ({discrepancyCount})
      </Button>
      <Button onClick={() => setNewInvoiceDialogOpen(true)} className="bg-[#ffc800] text-black hover:bg-[#e6b400]">
        <Plus className="h-4 w-4 mr-2" />
        Nova Fatura
      </Button>
    </div>
  );

  const customCards = (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        title="TOTAL ARMADOR"
        value={formatCurrency(stats.totalCost)}
        subtitle={`Calculado: ${formatCurrency(stats.totalCalculated)}`}
        icon={<DollarSign className="h-6 w-6" />}
        variant="default"
        isActive={quickFilter === "all"}
        onClick={() => handleQuickFilterChange("all")}
      />
      <KpiCard
        title="VALIDADAS"
        value={formatCurrency(stats.validated)}
        subtitle="Auditoria concluída"
        icon={<CheckCircle2 className="h-6 w-6" />}
        variant="success"
        isActive={quickFilter === "validated"}
        onClick={() => handleQuickFilterChange("validated")}
      />
      <KpiCard
        title="DISCREPÂNCIAS"
        value={formatCurrency(stats.discrepancy)}
        subtitle={`Sobrecobrança: ${formatCurrency(stats.totalDiscrepancyAmount)}`}
        icon={<AlertTriangle className="h-6 w-6" />}
        variant="critical"
        isActive={quickFilter === "discrepancy"}
        onClick={() => handleQuickFilterChange("discrepancy")}
      />
      <KpiCard
        title="PENDENTES"
        value={formatCurrency(stats.pending)}
        subtitle="Aguardando auditoria"
        icon={<Clock className="h-6 w-6" />}
        variant="warning"
        isActive={quickFilter === "pending"}
        onClick={() => handleQuickFilterChange("pending")}
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
        {/* Filters */}
        <Card className="bg-[rgba(5,6,18,0.85)] border-[rgba(255,255,255,0.1)]">
          <CardContent className="pt-4 pb-4">
            <div className="flex gap-4 items-center">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Buscar por fatura, armador ou container..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]"
                  />
                </div>
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-48 bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  <SelectItem value="pending">Pendentes</SelectItem>
                  <SelectItem value="validated">Validadas</SelectItem>
                  <SelectItem value="discrepancy">Discrepâncias</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="bg-[rgba(5,6,18,0.85)] border-[rgba(255,255,255,0.1)]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-foreground text-base">
              <Ship className="h-5 w-5 text-[#ffc800]" />
              Auditoria de Custos de Armadores
            </CardTitle>
            <CardDescription>{filteredInvoices.length} containers para auditoria</CardDescription>
          </CardHeader>
          <CardContent>
            {!filteredInvoices.length ? (
              <div className="text-center py-8 text-muted-foreground">
                <Ship className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum container encontrado</p>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow className="border-[rgba(255,255,255,0.1)]">
                      <TableHead className="w-12">
                        <Checkbox
                          checked={selectedIds.size > 0 && selectedIds.size === filteredInvoices.length}
                          onCheckedChange={handleSelectAll}
                        />
                      </TableHead>
                      <TableHead>Container</TableHead>
                      <TableHead>Armador</TableHead>
                      <TableHead>Fatura</TableHead>
                      <TableHead className="text-center">Dias</TableHead>
                      <TableHead className="text-right">Calculado</TableHead>
                      <TableHead className="text-right">Armador</TableHead>
                      <TableHead className="text-center">Diferença</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-center">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedInvoices.map((container) => (
                      <TableRow key={container.id} className="border-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,200,0,0.05)]">
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(container.id)}
                            onCheckedChange={(checked) => handleSelectOne(container.id, !!checked)}
                          />
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-mono font-medium">{container.numero}</p>
                            <p className="text-xs text-muted-foreground">{container.cliente || '-'}</p>
                          </div>
                        </TableCell>
                        <TableCell>{container.armador || '-'}</TableCell>
                        <TableCell className="font-mono text-sm">{container.armador_invoice_number || '-'}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex flex-col items-center">
                            <Badge variant="outline">{container.armador_days_charged || container.excedente_dias}</Badge>
                            {container.armador_days_charged && container.armador_days_charged !== container.excedente_dias && (
                              <span className="text-xs text-muted-foreground">calc: {container.excedente_dias}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-blue-400">{formatCurrency(container.expected_cost_usd)}</TableCell>
                        <TableCell className="text-right font-semibold text-[#ffc800]">
                          {container.armador_cost_usd ? formatCurrency(container.armador_cost_usd) : '-'}
                        </TableCell>
                        <TableCell className="text-center">{getDiffBadge(container)}</TableCell>
                        <TableCell>{getStatusBadge(container.audit_status)}</TableCell>
                        <TableCell className="text-center">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleOpenAudit(container)}
                            className="h-8 w-8 p-0 hover:bg-[rgba(255,200,0,0.1)]"
                          >
                            <Calculator className="h-4 w-4 text-[#ffc800]" />
                          </Button>
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

      <AuditCostDialog
        open={auditDialogOpen}
        onOpenChange={setAuditDialogOpen}
        container={selectedContainer}
        onAudit={handleAudit}
        isLoading={updateContainer.isPending}
      />

      <BulkAuditDialog
        open={bulkAuditDialogOpen}
        onOpenChange={setBulkAuditDialogOpen}
        containers={selectedContainers}
        onSuccess={handleBulkAuditSuccess}
      />

      <NewInvoiceDialog
        open={newInvoiceDialogOpen}
        onOpenChange={setNewInvoiceDialogOpen}
        containers={containers}
        isLoading={isSubmittingInvoice}
        onSubmit={async (data) => {
          setIsSubmittingInvoice(true);
          try {
            await updateContainer.mutateAsync({
              containerId: data.containerId,
              updates: {
                armador_invoice_number: data.armador_invoice_number,
                armador_cost_usd: data.armador_cost_usd,
                armador_days_charged: data.armador_days_charged,
                notes: data.notes || null,
                audit_status: 'pending',
              },
            });
            toast.success('Fatura registrada com sucesso!');
            setNewInvoiceDialogOpen(false);
          } catch (error) {
            toast.error('Erro ao registrar fatura');
            console.error(error);
          } finally {
            setIsSubmittingInvoice(false);
          }
        }}
      />
    </DemurrageLayout>
  );
}
