import { useState } from "react";
import { DemurrageLayout } from "@/components/demurrage/DemurrageLayout";
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
  FileSpreadsheet
} from "lucide-react";
import { toast } from "sonner";

// Mock data for demonstration
const mockContainers = [
  { id: "1", numero: "MSCU1234567", master: "MEDUGRU123456", cliente: "CLIENTE ABC", armador: "MSC", tipo: "40HC", status: "at_risk", diasRestantes: 2, demurrage: 450 },
  { id: "2", numero: "HLCU7654321", master: "HLCUGRU789012", cliente: "CLIENTE XYZ", armador: "HAPAG", tipo: "20DV", status: "safe", diasRestantes: 8, demurrage: 0 },
  { id: "3", numero: "MAEU9876543", master: "MAEUPAR345678", cliente: "CLIENTE 123", armador: "MAERSK", tipo: "40DV", status: "exceeded", diasRestantes: -3, demurrage: 1200 },
  { id: "4", numero: "CMAU5678901", master: "CMAUGRU901234", cliente: "CLIENTE ABC", armador: "CMA CGM", tipo: "40HC", status: "critical", diasRestantes: 1, demurrage: 300 },
];

export default function DemurrageMonitor() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [quickFilter, setQuickFilter] = useState<"all" | "at_risk" | "exceeded" | "safe">("all");
  const [loading, setLoading] = useState(false);
  const [isRefetching, setIsRefetching] = useState(false);

  const handleRefresh = () => {
    setIsRefetching(true);
    setTimeout(() => {
      setIsRefetching(false);
      toast.success("Dados atualizados");
    }, 1000);
  };

  const handleQuickFilterChange = (filter: "all" | "at_risk" | "exceeded" | "safe") => {
    setQuickFilter(filter);
    // Reset the select filter when using quick filters
    if (filter === "all") {
      setFilterStatus("all");
    } else if (filter === "at_risk") {
      setFilterStatus("at_risk");
    } else if (filter === "exceeded") {
      setFilterStatus("exceeded");
    } else if (filter === "safe") {
      setFilterStatus("safe");
    }
  };

  const filteredContainers = mockContainers.filter(c => {
    const matchesSearch = 
      c.numero.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.master.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.cliente.toLowerCase().includes(searchTerm.toLowerCase());
    
    let matchesStatus = true;
    if (quickFilter === "at_risk") {
      matchesStatus = c.status === "at_risk" || c.status === "critical";
    } else if (quickFilter === "exceeded") {
      matchesStatus = c.status === "exceeded";
    } else if (quickFilter === "safe") {
      matchesStatus = c.status === "safe";
    } else if (filterStatus !== "all") {
      matchesStatus = c.status === filterStatus;
    }
    
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: mockContainers.length,
    atRisk: mockContainers.filter(c => c.status === 'at_risk' || c.status === 'critical').length,
    exceeded: mockContainers.filter(c => c.status === 'exceeded').length,
    safe: mockContainers.filter(c => c.status === 'safe').length,
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

  return (
    <DemurrageLayout
      metrics={{
        totalContainers: stats.total,
        atRisk: stats.atRisk,
        exceeded: stats.exceeded,
        safe: stats.safe,
      }}
      loading={loading}
      onRefresh={handleRefresh}
      isRefetching={isRefetching}
      rightActions={rightActions}
      activeFilter={quickFilter}
      onFilterChange={handleQuickFilterChange}
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
