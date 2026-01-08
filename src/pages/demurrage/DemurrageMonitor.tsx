import { useState } from "react";
import { DemurrageLayout } from "@/components/demurrage/DemurrageLayout";
import { KpiCard } from "@/components/demurrage/KpiCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

// Mock data for demonstration
const mockContainers = [
  { id: "1", numero: "MSCU1234567", master: "MEDUGRU123456", cliente: "CLIENTE ABC", armador: "MSC", tipo: "40HC", status: "at_risk", diasRestantes: 2, demurrage: 450 },
  { id: "2", numero: "HLCU7654321", master: "HLCUGRU789012", cliente: "CLIENTE XYZ", armador: "HAPAG", tipo: "20DV", status: "safe", diasRestantes: 8, demurrage: 0 },
  { id: "3", numero: "MAEU9876543", master: "MAEUPAR345678", cliente: "CLIENTE 123", armador: "MAERSK", tipo: "40DV", status: "exceeded", diasRestantes: -3, demurrage: 1200 },
  { id: "4", numero: "CMAU5678901", master: "CMAUGRU901234", cliente: "CLIENTE ABC", armador: "CMA CGM", tipo: "40HC", status: "safe", diasRestantes: 5, demurrage: 0 },
];

type QuickFilter = "all" | "in_transit" | "at_risk" | "delivered";

export default function DemurrageMonitor() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [loading, setLoading] = useState(false);
  const [isRefetching, setIsRefetching] = useState(false);

  const handleRefresh = () => {
    setIsRefetching(true);
    setTimeout(() => {
      setIsRefetching(false);
      toast.success("Dados atualizados");
    }, 1000);
  };

  const handleQuickFilterChange = (filter: QuickFilter) => {
    setQuickFilter(filter);
  };

  const filteredContainers = mockContainers.filter(c => {
    const matchesSearch = 
      c.numero.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.master.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.cliente.toLowerCase().includes(searchTerm.toLowerCase());
    
    let matchesQuickFilter = true;
    if (quickFilter === "in_transit") {
      matchesQuickFilter = c.status === "at_risk" || c.status === "critical";
    } else if (quickFilter === "at_risk") {
      matchesQuickFilter = c.status === "exceeded" || c.status === "critical";
    } else if (quickFilter === "delivered") {
      matchesQuickFilter = c.status === "safe";
    }
    
    const matchesStatus = filterStatus === "all" || c.status === filterStatus;
    
    return matchesSearch && matchesQuickFilter && matchesStatus;
  });

  const stats = {
    total: mockContainers.length,
    inTransit: 0, // CRG, DEP, TSP, ARR, DCH
    atRisk: mockContainers.filter(c => c.status === 'exceeded' || c.status === 'critical').length, // DELAYED, HOLD, CANCELLED
    delivered: mockContainers.filter(c => c.status === 'safe').length, // GOD, DLV (Gate-out, Entrega)
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
        value={202}
        subtitle="Containers ativos"
        icon={<Ship className="h-6 w-6" />}
        variant="default"
        isActive={quickFilter === "all"}
        onClick={() => handleQuickFilterChange("all")}
      />
      <KpiCard
        title="EM TRÂNSITO"
        value={0}
        subtitle="CRG, DEP, TSP, ARR, DCH"
        icon={<TrendingUp className="h-6 w-6" />}
        variant="info"
        isActive={quickFilter === "in_transit"}
        onClick={() => handleQuickFilterChange("in_transit")}
      />
      <KpiCard
        title="EM ALERTA"
        value={10}
        subtitle="DELAYED, HOLD, CANCELLED"
        icon={<AlertTriangle className="h-6 w-6" />}
        variant="critical"
        isActive={quickFilter === "at_risk"}
        onClick={() => handleQuickFilterChange("at_risk")}
      />
      <KpiCard
        title="ENTREGUES"
        value={192}
        subtitle="GOD, DLV (Gate-out, Entrega)"
        icon={<CheckCircle2 className="h-6 w-6" />}
        variant="success"
        isActive={quickFilter === "delivered"}
        onClick={() => handleQuickFilterChange("delivered")}
      />
    </div>
  );

  return (
    <DemurrageLayout
      loading={loading}
      onRefresh={handleRefresh}
      isRefetching={isRefetching}
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
                  {filteredContainers.map((container) => (
                    <TableRow key={container.id} className="border-[rgba(255,255,255,0.1)] cursor-pointer hover:bg-[rgba(255,200,0,0.05)]">
                      <TableCell className="font-mono font-medium">{container.numero}</TableCell>
                      <TableCell className="font-mono text-sm">{container.master}</TableCell>
                      <TableCell>{container.cliente}</TableCell>
                      <TableCell>{container.armador}</TableCell>
                      <TableCell><Badge variant="outline">{container.tipo}</Badge></TableCell>
                      <TableCell className="text-center">
                        <Badge variant={container.diasRestantes <= 0 ? "destructive" : container.diasRestantes <= 2 ? "secondary" : "outline"}>
                          {container.diasRestantes}d
                        </Badge>
                      </TableCell>
                      <TableCell>{getRiskBadge(container.status)}</TableCell>
                      <TableCell className="text-right font-semibold text-[#ffc800]">
                        {container.demurrage > 0 ? formatCurrency(container.demurrage) : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DemurrageLayout>
  );
}
