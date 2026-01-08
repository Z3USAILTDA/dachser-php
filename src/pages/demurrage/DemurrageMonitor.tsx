import { useState } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { KpiCard } from "@/components/demurrage/KpiCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Activity, 
  Package, 
  AlertTriangle, 
  Search, 
  RefreshCw,
  Clock,
  CheckCircle2,
  Ship,
  TrendingUp,
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
  const [loading, setLoading] = useState(false);

  const handleRefresh = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      toast.success("Dados atualizados");
    }, 1000);
  };

  const filteredContainers = mockContainers.filter(c => {
    const matchesSearch = 
      c.numero.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.master.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.cliente.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === "all" || c.status === filterStatus;
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

  return (
    <PageLayout 
      title="DACHSER" 
      subtitle="Demurrage / Detention — Monitor"
      pageIcon={Activity}
    >
      <div className="space-y-6">
        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleRefresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button variant="outline">
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Exportar
          </Button>
        </div>

        {/* KPIs */}
        <div className="grid gap-4 md:grid-cols-4">
          <KpiCard
            title="TOTAL MONITORADOS"
            value={stats.total}
            subtitle="Containers ativos"
            icon={<Ship className="h-6 w-6" />}
            variant="primary"
          />
          <KpiCard
            title="EM TRÂNSITO"
            value={stats.safe}
            subtitle="Dentro do Free Time"
            icon={<TrendingUp className="h-6 w-6" />}
            variant="success"
          />
          <KpiCard
            title="EM ALERTA"
            value={stats.atRisk}
            subtitle="Próximo ao vencimento"
            icon={<Clock className="h-6 w-6" />}
            variant="warning"
          />
          <KpiCard
            title="EXCEDIDOS"
            value={stats.exceeded}
            subtitle="Free Time expirado"
            icon={<AlertTriangle className="h-6 w-6" />}
            variant="danger"
          />
        </div>

        {/* Filters */}
        <Card className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]">
          <CardContent className="pt-6">
            <div className="flex gap-4 items-center">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Buscar por container, MBL ou cliente..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-background/50"
                  />
                </div>
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-40 bg-background/50">
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
        <Card className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Package className="h-5 w-5 text-primary" />
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
                    <TableRow key={container.id} className="border-[rgba(255,255,255,0.1)] cursor-pointer hover:bg-primary/5">
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
                      <TableCell className="text-right font-semibold text-primary">
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
    </PageLayout>
  );
}
