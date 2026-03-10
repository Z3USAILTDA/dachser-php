import { useState, useMemo, useEffect } from "react";
import { DemurrageLayout } from "@/components/demurrage/DemurrageLayout";
import { KpiCard } from "@/components/demurrage/KpiCard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { 
  FileText, Clock, CheckCircle2, Send, Eye, AlertTriangle, DollarSign,
  MoreHorizontal, FileSpreadsheet, Loader2, RefreshCw, Plus, Edit2, Mail
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
import { 
  useDemurragePreInvoices,
  useUpdatePreInvoice,
  useGeneratePreInvoices,
  type PreInvoice 
} from "@/hooks/useDemurrageData";
import { PreInvoiceDetailsDialog } from "@/components/demurrage/PreInvoiceDetailsDialog";
import { PreInvoiceInfoDialog } from "@/components/demurrage/PreInvoiceInfoDialog";
import { SendTestEmailDialog } from "@/components/demurrage/SendTestEmailDialog";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

type QuickFilter = "all" | "waiting" | "total_usd" | "pending";
type BulkAction = "revisar" | "lancar" | "marcar_pago" | null;
const PAGE_SIZE = 15;

export default function DemurragePreInvoicing() {
  const [activeTab, setActiveTab] = useState("all");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkAction, setBulkAction] = useState<BulkAction>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [infoDialogOpen, setInfoDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<PreInvoice | null>(null);
  const [infoInvoice, setInfoInvoice] = useState<PreInvoice | null>(null);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailInvoice, setEmailInvoice] = useState<PreInvoice | null>(null);
  const [exchangeRates, setExchangeRates] = useState<Record<number, string>>({});

  const { data: preInvoices = [], isLoading, refetch } = useDemurragePreInvoices();
  const updateMutation = useUpdatePreInvoice();
  const generateMutation = useGeneratePreInvoices();

  // Initialize exchange rates from loaded data
  useEffect(() => {
    if (preInvoices.length > 0) {
      const rates: Record<number, string> = {};
      preInvoices.forEach((pi: any) => {
        if (pi.exchange_rate) rates[pi.id] = String(pi.exchange_rate);
      });
      setExchangeRates(prev => ({ ...rates, ...prev }));
    }
  }, [preInvoices]);

  const handleExchangeRateChange = (invoiceId: number, value: string) => {
    setExchangeRates(prev => ({ ...prev, [invoiceId]: value }));
  };

  const handleExchangeRateBlur = async (invoice: PreInvoice) => {
    const rate = exchangeRates[invoice.id];
    const numRate = rate ? parseFloat(rate) : null;
    const currentRate = (invoice as any).exchange_rate || null;
    if (numRate === currentRate) return;
    try {
      await updateMutation.mutateAsync({
        invoiceId: invoice.id,
        updates: { exchange_rate: numRate }
      });
    } catch { /* handled by hook */ }
  };
  
  const handleViewDetails = (invoice: PreInvoice) => {
    setSelectedInvoice(invoice);
    setDetailsDialogOpen(true);
  };

  const formatCurrency = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value || 0);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    try {
      return format(parseISO(dateStr), "dd/MM/yyyy", { locale: ptBR });
    } catch {
      return dateStr;
    }
  };

  const getWorkflowBadge = (status: string) => {
    switch (status) {
      case 'calculated':
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20"><Clock className="h-3 w-3 mr-1" />Calculada</Badge>;
      case 'reviewed':
        return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20"><Eye className="h-3 w-3 mr-1" />Revisada</Badge>;
      case 'sent':
        return <Badge className="bg-purple-500/10 text-purple-500 border-purple-500/20"><Send className="h-3 w-3 mr-1" />Lançada</Badge>;
      case 'invoiced':
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20"><CheckCircle2 className="h-3 w-3 mr-1" />Faturada</Badge>;
      case 'paid':
        return <Badge className="bg-green-600/10 text-green-400 border-green-600/20"><CheckCircle2 className="h-3 w-3 mr-1" />Paga</Badge>;
      default:
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pendente</Badge>;
    }
  };

  const getFinancialBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <Badge variant="outline" className="text-yellow-400 border-yellow-400/30">Pendente</Badge>;
      case 'POSTED':
        return <Badge variant="outline" className="text-blue-400 border-blue-400/30">Lançado</Badge>;
      case 'PAID':
        return <Badge variant="outline" className="text-green-400 border-green-400/30">Pago</Badge>;
      default:
        return <Badge variant="outline">-</Badge>;
    }
  };

  const stats = useMemo(() => {
    const total = preInvoices.length;
    const calculated = preInvoices.filter(p => p.workflow_status === 'calculated' || !p.workflow_status).length;
    const reviewed = preInvoices.filter(p => p.workflow_status === 'reviewed').length;
    const sent = preInvoices.filter(p => p.workflow_status === 'sent').length;
    const finalized = preInvoices.filter(p => ['invoiced', 'paid'].includes(p.workflow_status)).length;
    const totalUsd = preInvoices.reduce((sum, p) => sum + (p.total_usd || 0), 0);
    const pendingUsd = preInvoices
      .filter(p => p.financial_status === 'PENDING')
      .reduce((sum, p) => sum + (p.total_usd || 0), 0);

    return { total, calculated, reviewed, sent, finalized, totalUsd, pendingUsd };
  }, [preInvoices]);

  const filteredInvoices = useMemo(() => {
    if (activeTab === 'all') return preInvoices;
    
    const statusMap: Record<string, string[]> = {
      calculated: ['calculated', ''],
      reviewed: ['reviewed'],
      sent_to_otelo: ['sent'],
      finalized: ['invoiced', 'paid'],
    };
    
    const validStatuses = statusMap[activeTab] || [];
    return preInvoices.filter(p => 
      validStatuses.includes(p.workflow_status) || 
      (activeTab === 'calculated' && !p.workflow_status)
    );
  }, [preInvoices, activeTab]);

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
      setSelectedIds(new Set(paginatedInvoices.map(p => p.id)));
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

  // Generate Pre-Invoices
  const handleGenerateInvoices = async () => {
    setIsGenerating(true);
    try {
      const result = await generateMutation.mutateAsync();
      if (result.success) {
        toast.success(`${result.results?.invoices_created || 0} pré-fatura(s) gerada(s)`);
        refetch();
      } else {
        toast.error(result.error || "Erro ao gerar pré-faturas");
      }
    } catch (error) {
      toast.error("Erro ao gerar pré-faturas");
    } finally {
      setIsGenerating(false);
    }
  };

  // Action handlers
  const handleSingleAction = async (invoice: PreInvoice, newStatus: string) => {
    try {
      await updateMutation.mutateAsync({
        invoiceId: invoice.id,
        updates: { workflow_status: newStatus }
      });
      toast.success(`Pré-fatura ${invoice.invoice_number} atualizada para ${newStatus}`);
    } catch (error) {
      toast.error("Erro ao atualizar status");
    }
  };

  const handleBulkAction = async () => {
    if (!bulkAction || selectedIds.size === 0) return;

    const statusMap: Record<string, string> = {
      revisar: 'reviewed',
      lancar: 'sent',
      marcar_pago: 'paid',
    };

    const newStatus = statusMap[bulkAction];
    const selectedInvoices = filteredInvoices.filter(p => selectedIds.has(p.id));

    try {
      await Promise.all(
        selectedInvoices.map(p => 
          updateMutation.mutateAsync({
            invoiceId: p.id,
            updates: { workflow_status: newStatus }
          })
        )
      );
      toast.success(`${selectedInvoices.length} pré-fatura(s) atualizada(s) para ${newStatus}`);
      setSelectedIds(new Set());
      refetch();
    } catch (error) {
      toast.error("Erro ao atualizar pré-faturas");
    } finally {
      setBulkAction(null);
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
      <Button 
        onClick={handleGenerateInvoices}
        disabled={isGenerating}
        className="bg-[#ffc800] text-black hover:bg-[#ffdc50]"
      >
        {isGenerating ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Plus className="h-4 w-4 mr-2" />
        )}
        Gerar Pré-Faturas
      </Button>
      {selectedIds.size > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="border-[#ffc800]/30 text-[#ffc800]">
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
        onClick={() => refetch()}
        className="bg-[rgba(0,0,0,0.7)] border-[rgba(255,255,255,0.25)] text-[#aaaaaa] hover:text-white hover:bg-[rgba(0,0,0,0.9)]"
      >
        <RefreshCw className="h-4 w-4" />
      </Button>
    </div>
  );

  const customCards = (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        title="TOTAL PRÉ-FATURAS"
        value={stats.total}
        subtitle="Geradas no sistema"
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
                  Pré-Faturas de Demurrage
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
                <p className="text-sm mt-2">Clique em "Gerar Pré-Faturas" para criar novas pré-faturas</p>
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
                      <TableHead>Nº Pré-Fatura</TableHead>
                      <TableHead>MBL</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Navio</TableHead>
                      <TableHead>Data Emissão</TableHead>
                      <TableHead className="text-right">Total USD</TableHead>
                      <TableHead className="text-right w-[110px]">Taxa Conversão</TableHead>
                      <TableHead className="text-right">Total BRL</TableHead>
                      <TableHead>Workflow</TableHead>
                      <TableHead>Status Info</TableHead>
                      <TableHead>MISK</TableHead>
                      <TableHead>Reg. Othello</TableHead>
                      <TableHead>Financeiro</TableHead>
                      <TableHead className="w-[80px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedInvoices.map((invoice) => (
                      <TableRow 
                        key={invoice.id} 
                        className={`border-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,200,0,0.05)] ${
                          selectedIds.has(invoice.id) ? 'bg-[rgba(255,200,0,0.08)]' : ''
                        }`}
                      >
                        <TableCell>
                          <Checkbox 
                            checked={selectedIds.has(invoice.id)}
                            onCheckedChange={() => toggleSelect(invoice.id)}
                          />
                        </TableCell>
                        <TableCell className="font-mono font-medium text-[#ffc800]">
                          {invoice.invoice_number}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{invoice.shipment_mbl || '-'}</TableCell>
                        <TableCell>{invoice.client_name || '-'}</TableCell>
                        <TableCell>{invoice.vessel_name || '-'}</TableCell>
                        <TableCell>{formatDate(invoice.issue_date)}</TableCell>
                        <TableCell className="text-right font-semibold text-[#ffc800]">
                          {formatCurrency(invoice.total_usd)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            step="0.01"
                            value={exchangeRates[invoice.id] ?? ''}
                            onChange={(e) => handleExchangeRateChange(invoice.id, e.target.value)}
                            onBlur={() => handleExchangeRateBlur(invoice)}
                            placeholder="0.00"
                            className="w-[90px] h-7 text-right text-xs bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.15)] px-2"
                          />
                        </TableCell>
                        <TableCell className="text-right font-semibold text-green-400">
                          {(() => {
                            const rate = parseFloat(exchangeRates[invoice.id] || '0');
                            if (!rate) return '-';
                            return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((invoice.total_usd || 0) * rate);
                          })()}
                        </TableCell>
                        <TableCell>{getWorkflowBadge(invoice.workflow_status)}</TableCell>
                        <TableCell className="text-sm">{(invoice as any).status_info || '-'}</TableCell>
                        <TableCell className="font-mono text-sm">{(invoice as any).misk || '-'}</TableCell>
                        <TableCell className="text-sm">{(invoice as any).othello_registro || '-'}</TableCell>
                        <TableCell>{getFinancialBadge(invoice.financial_status)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-[#ffc800]"
                              onClick={() => { setInfoInvoice(invoice); setInfoDialogOpen(true); }}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-blue-400"
                              onClick={() => { setEmailInvoice(invoice); setEmailDialogOpen(true); }}
                              title="Enviar E-mail de Teste"
                            >
                              <Mail className="h-4 w-4" />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="bg-[#1a1a1a] border-[rgba(255,255,255,0.1)]">
                                <DropdownMenuItem 
                                  onClick={() => handleViewDetails(invoice)}
                                  className="cursor-pointer"
                                >
                                  <Eye className="h-4 w-4 mr-2" />
                                  Ver Detalhes
                                </DropdownMenuItem>
                                <DropdownMenuSeparator className="bg-[rgba(255,255,255,0.1)]" />
                                <DropdownMenuItem 
                                  onClick={() => handleSingleAction(invoice, 'reviewed')}
                                  className="cursor-pointer"
                                  disabled={invoice.workflow_status === 'reviewed'}
                                >
                                  <CheckCircle2 className="h-4 w-4 mr-2" />
                                  Marcar como Revisada
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => handleSingleAction(invoice, 'sent')}
                                  className="cursor-pointer"
                                  disabled={invoice.workflow_status === 'sent'}
                                >
                                  <Send className="h-4 w-4 mr-2" />
                                  Lançar no Othello
                                </DropdownMenuItem>
                                <DropdownMenuSeparator className="bg-[rgba(255,255,255,0.1)]" />
                                <DropdownMenuItem 
                                  onClick={() => handleSingleAction(invoice, 'paid')}
                                  className="cursor-pointer text-green-400"
                                  disabled={invoice.workflow_status === 'paid'}
                                >
                                  <CheckCircle2 className="h-4 w-4 mr-2" />
                                  Marcar como Pago
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
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
              <strong className="text-[#ffc800]">{selectedIds.size}</strong> pré-fatura(s).
              <br /><br />
              Esta ação atualizará o status de todas as pré-faturas selecionadas.
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

      {/* Pre-Invoice Details Dialog */}
      <PreInvoiceDetailsDialog
        open={detailsDialogOpen}
        onOpenChange={setDetailsDialogOpen}
        preInvoice={selectedInvoice}
      />

      {/* Pre-Invoice Info Dialog */}
      <PreInvoiceInfoDialog
        open={infoDialogOpen}
        onOpenChange={setInfoDialogOpen}
        preInvoice={infoInvoice}
      />

      {/* Send Test Email Dialog */}
      <SendTestEmailDialog
        open={emailDialogOpen}
        onOpenChange={setEmailDialogOpen}
        preInvoice={emailInvoice}
      />
    </DemurrageLayout>
  );
}
