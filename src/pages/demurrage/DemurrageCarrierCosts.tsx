import { useState, useMemo, useEffect } from "react";
import { DemurrageLayout } from "@/components/demurrage/DemurrageLayout";
import { KpiCard } from "@/components/demurrage/KpiCard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Ship, Plus, Search, AlertTriangle, CheckCircle2, FileSearch, FileSpreadsheet, DollarSign, Clock } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TablePagination } from "@/components/layout/TablePagination";
import { useDemurrageData } from "@/hooks/useDemurrageData";

type QuickFilter = "all" | "validated" | "discrepancy" | "pending";
const PAGE_SIZE = 15;

export default function DemurrageCarrierCosts() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [currentPage, setCurrentPage] = useState(1);

  const { data: containers = [], isLoading } = useDemurrageData();

  // Filter containers that have carrier invoice data
  const carrierContainers = useMemo(() => {
    return containers.filter(c => c.armador_invoice_number || c.armador_cost_usd);
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

  const stats = useMemo(() => {
    const totalCost = carrierContainers.reduce((sum, c) => sum + (c.armador_cost_usd || 0), 0);
    const validated = carrierContainers.filter(c => c.audit_status === 'validated').reduce((sum, c) => sum + (c.armador_cost_usd || 0), 0);
    const discrepancy = carrierContainers.filter(c => c.audit_status === 'discrepancy').reduce((sum, c) => sum + (c.armador_cost_usd || 0), 0);
    const pending = carrierContainers.filter(c => !c.audit_status || c.audit_status === 'pending').reduce((sum, c) => sum + (c.armador_cost_usd || 0), 0);

    return { totalCost, validated, discrepancy, pending };
  }, [carrierContainers]);

  const filteredInvoices = useMemo(() => {
    return carrierContainers.filter(c => {
      const matchesSearch = 
        searchTerm === "" ||
        (c.armador_invoice_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.armador || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.numero.toLowerCase().includes(searchTerm.toLowerCase());
      
      let matchesQuickFilter = true;
      if (quickFilter !== "all") {
        matchesQuickFilter = c.audit_status === quickFilter || (!c.audit_status && quickFilter === "pending");
      }
      
      const matchesStatus = statusFilter === "all" || c.audit_status === statusFilter || (!c.audit_status && statusFilter === "pending");
      return matchesSearch && matchesQuickFilter && matchesStatus;
    });
  }, [carrierContainers, searchTerm, quickFilter, statusFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, quickFilter, statusFilter]);

  const totalPages = Math.ceil(filteredInvoices.length / PAGE_SIZE);
  const paginatedInvoices = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredInvoices.slice(start, start + PAGE_SIZE);
  }, [filteredInvoices, currentPage]);

  const handleQuickFilterChange = (filter: QuickFilter) => {
    setQuickFilter(filter);
  };

  const rightActions = (
    <div className="flex gap-2">
      <Button variant="outline" className="bg-[rgba(0,0,0,0.7)] border-[rgba(255,255,255,0.25)] text-[#aaaaaa] hover:text-white hover:bg-[rgba(0,0,0,0.9)]">
        <FileSpreadsheet className="h-4 w-4 mr-2" />
        Exportar Excel
      </Button>
      <Button className="bg-[#ffc800] text-black hover:bg-[#e6b400]">
        <Plus className="h-4 w-4 mr-2" />
        Nova Fatura
      </Button>
    </div>
  );

  const customCards = (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        title="TOTAL CUSTOS"
        value={formatCurrency(stats.totalCost)}
        subtitle="Faturas recebidas"
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
        subtitle="Requer análise"
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
                  <SelectItem value="disputed">Em Disputa</SelectItem>
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
              Faturas de Armadores
            </CardTitle>
            <CardDescription>{filteredInvoices.length} faturas encontradas</CardDescription>
          </CardHeader>
          <CardContent>
            {!filteredInvoices.length ? (
              <div className="text-center py-8 text-muted-foreground">
                <Ship className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhuma fatura encontrada</p>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow className="border-[rgba(255,255,255,0.1)]">
                      <TableHead>Fatura</TableHead>
                      <TableHead>Armador</TableHead>
                      <TableHead>Container</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead className="text-center">Dias</TableHead>
                      <TableHead className="text-right">Custo USD</TableHead>
                      <TableHead className="text-right">Calculado</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedInvoices.map((container) => (
                      <TableRow key={container.id} className="border-[rgba(255,255,255,0.1)] cursor-pointer hover:bg-[rgba(255,200,0,0.05)]">
                        <TableCell className="font-mono">{container.armador_invoice_number || '-'}</TableCell>
                        <TableCell>{container.armador || '-'}</TableCell>
                        <TableCell className="font-mono">{container.numero}</TableCell>
                        <TableCell>{container.cliente || '-'}</TableCell>
                        <TableCell className="text-center"><Badge variant="outline">{container.armador_days_charged || container.excedente_dias} dias</Badge></TableCell>
                        <TableCell className="text-right font-semibold text-[#ffc800]">{formatCurrency(container.armador_cost_usd || 0)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{formatCurrency(container.expected_cost_usd)}</TableCell>
                        <TableCell>{getStatusBadge(container.audit_status)}</TableCell>
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
