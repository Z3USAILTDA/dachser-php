import { useState, useMemo, useEffect } from "react";
import { DemurrageLayout } from "@/components/demurrage/DemurrageLayout";
import { KpiCard } from "@/components/demurrage/KpiCard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FileText, Clock, CheckCircle2, Send, Eye, AlertTriangle, DollarSign } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { TablePagination } from "@/components/layout/TablePagination";
import { useDemurrageData, type DemurrageContainer } from "@/hooks/useDemurrageData";

type QuickFilter = "all" | "waiting" | "total_usd" | "pending";
const PAGE_SIZE = 15;

export default function DemurragePreInvoicing() {
  const [activeTab, setActiveTab] = useState("all");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [currentPage, setCurrentPage] = useState(1);

  const { data: containers = [], isLoading } = useDemurrageData();

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
    const reviewed = invoiceableContainers.filter(c => c.pre_invoice_status === 'CALCULADO').length;
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
      reviewed: ['CALCULADO'],
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
    <DemurrageLayout customCards={customCards} loading={isLoading}>
      <div className="space-y-4">
        {/* Inner Nav */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="all">Todas ({stats.total})</TabsTrigger>
            <TabsTrigger value="calculated">Calculadas ({stats.calculated})</TabsTrigger>
            <TabsTrigger value="reviewed">Revisadas ({stats.reviewed})</TabsTrigger>
            <TabsTrigger value="sent_to_otelo">Lançadas ({stats.sent})</TabsTrigger>
            <TabsTrigger value="finalized">Finalizadas ({stats.finalized})</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Content */}
        <Card className="bg-[rgba(5,6,18,0.85)] border-[rgba(255,255,255,0.1)]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-foreground text-base">
              <FileText className="h-5 w-5 text-[#ffc800]" />
              Pré-Faturas
            </CardTitle>
            <CardDescription>{filteredInvoices.length} encontrada(s)</CardDescription>
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
                      <TableHead>Container</TableHead>
                      <TableHead>MBL</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Armador</TableHead>
                      <TableHead className="text-center">Dias Exc.</TableHead>
                      <TableHead className="text-right">Total USD</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedInvoices.map((container) => (
                      <TableRow key={container.id} className="border-[rgba(255,255,255,0.1)] cursor-pointer hover:bg-[rgba(255,200,0,0.05)]">
                        <TableCell className="font-mono font-medium">{container.numero}</TableCell>
                        <TableCell className="font-mono text-sm">{container.mbl}</TableCell>
                        <TableCell>{container.cliente || '-'}</TableCell>
                        <TableCell>{container.armador || '-'}</TableCell>
                        <TableCell className="text-center"><Badge variant={container.excedente_dias > 0 ? "destructive" : "outline"}>{container.excedente_dias}d</Badge></TableCell>
                        <TableCell className="text-right font-semibold text-[#ffc800]">{formatCurrency(container.expected_cost_usd)}</TableCell>
                        <TableCell>{getWorkflowBadge(container.pre_invoice_status)}</TableCell>
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
    </DemurrageLayout>
  );
}
