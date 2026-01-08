import { useState, useMemo } from "react";
import { DemurrageLayout } from "@/components/demurrage/DemurrageLayout";
import { KpiCard } from "@/components/demurrage/KpiCard";
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
  TrendingUp
} from "lucide-react";
import { toast } from "sonner";
import { useDemurrageData, useDemurrageStats, useSyncDemurrage, useRecalcDemurrage, type DemurrageContainer } from "@/hooks/useDemurrageData";

type QuickFilter = "all" | "in_transit" | "at_risk" | "delivered";
const PAGE_SIZE = 15;

export default function DemurrageMonitor() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [currentPage, setCurrentPage] = useState(1);

  // Determine filter based on quickFilter
  const getFilters = () => {
    const filters: { search?: string; risk_status?: string; cronos_status?: string } = {};
    
    if (searchTerm) filters.search = searchTerm;
    if (filterStatus !== "all") filters.risk_status = filterStatus;
    
    if (quickFilter === "in_transit") {
      filters.cronos_status = "IN_TRANSIT";
    } else if (quickFilter === "delivered") {
      filters.cronos_status = "GATE_OUT";
    }
    
    return filters;
  };

  const { data: containers = [], isLoading, refetch, isRefetching } = useDemurrageData(getFilters());
  const { data: stats } = useDemurrageStats();
  const syncMutation = useSyncDemurrage();
  const recalcMutation = useRecalcDemurrage();

  // Filter for at_risk on client side (includes multiple statuses)
  const filteredContainers = useMemo(() => {
    return quickFilter === "at_risk"
      ? containers.filter(c => ["at_risk", "critical", "exceeded"].includes(c.risk_status))
      : containers;
  }, [containers, quickFilter]);

  // Reset page when filters change
  const handleQuickFilterChangeWithReset = (filter: QuickFilter) => {
    setQuickFilter(filter);
    setCurrentPage(1);
  };

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

  const rightActions = (
    <Button variant="outline" className="bg-[rgba(0,0,0,0.7)] border-[rgba(255,255,255,0.25)] text-[#aaaaaa] hover:text-white hover:bg-[rgba(0,0,0,0.9)]">
      <FileSpreadsheet className="h-4 w-4 mr-2" />
      Exportar
    </Button>
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
        onClick={() => handleQuickFilterChangeWithReset("all")}
      />
      <KpiCard
        title="EM TRÂNSITO"
        value={stats?.inTransit || 0}
        subtitle="PENDING, IN_TRANSIT, ARRIVED"
        icon={<TrendingUp className="h-6 w-6" />}
        variant="info"
        isActive={quickFilter === "in_transit"}
        onClick={() => handleQuickFilterChangeWithReset("in_transit")}
      />
      <KpiCard
        title="EM ALERTA"
        value={stats?.atRisk || 0}
        subtitle="Risco, Crítico ou Excedido"
        icon={<AlertTriangle className="h-6 w-6" />}
        variant="critical"
        isActive={quickFilter === "at_risk"}
        onClick={() => handleQuickFilterChangeWithReset("at_risk")}
      />
      <KpiCard
        title="ENTREGUES"
        value={stats?.delivered || 0}
        subtitle="GATE_OUT, RETURNED"
        icon={<CheckCircle2 className="h-6 w-6" />}
        variant="success"
        isActive={quickFilter === "delivered"}
        onClick={() => handleQuickFilterChangeWithReset("delivered")}
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
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="safe">OK</SelectItem>
                  <SelectItem value="at_risk">Em Risco</SelectItem>
                  <SelectItem value="critical">Crítico</SelectItem>
                  <SelectItem value="exceeded">Excedido</SelectItem>
                </SelectContent>
              </Select>
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
                      <TableHead className="text-center">Dias Rest.</TableHead>
                      <TableHead>Risco</TableHead>
                      <TableHead className="text-right">Demurrage</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedContainers.map((container) => (
                      <TableRow key={container.id} className="border-[rgba(255,255,255,0.1)] cursor-pointer hover:bg-[rgba(255,200,0,0.05)]">
                        <TableCell className="font-mono font-medium">{container.numero}</TableCell>
                        <TableCell className="font-mono text-sm">{container.mbl}</TableCell>
                        <TableCell>{container.cliente || '-'}</TableCell>
                        <TableCell>{container.armador || '-'}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{container.tipo_conteiner || '-'}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={(container.days_remaining ?? 0) <= 0 ? "destructive" : (container.days_remaining ?? 0) <= 2 ? "secondary" : "outline"}>
                            {container.days_remaining ?? '-'}d
                          </Badge>
                        </TableCell>
                        <TableCell>{getRiskBadge(container.risk_status)}</TableCell>
                        <TableCell className="text-right font-semibold text-[#ffc800]">
                          {container.expected_cost_usd > 0 ? formatCurrency(container.expected_cost_usd) : '-'}
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
    </DemurrageLayout>
  );
}
