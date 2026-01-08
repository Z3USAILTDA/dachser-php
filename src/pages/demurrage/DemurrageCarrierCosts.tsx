import { useState } from "react";
import { DemurrageLayout } from "@/components/demurrage/DemurrageLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Ship, Plus, Search, AlertTriangle, CheckCircle2, FileSearch, FileSpreadsheet } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Mock data
const mockInvoices = [
  { id: "1", invoice_number: "INV-MSC-001", armador: "MSC", container: "MSCU1234567", cliente: "CLIENTE ABC", days_charged: 5, cost_usd: 750, audit_status: "validated" },
  { id: "2", invoice_number: "INV-HAPAG-002", armador: "HAPAG", container: "HLCU7654321", cliente: "CLIENTE XYZ", days_charged: 8, cost_usd: 1200, audit_status: "discrepancy" },
  { id: "3", invoice_number: "INV-MAERSK-003", armador: "MAERSK", container: "MAEU9876543", cliente: "CLIENTE 123", days_charged: 3, cost_usd: 540, audit_status: "pending" },
  { id: "4", invoice_number: "INV-CMA-004", armador: "CMA CGM", container: "CMAU5678901", cliente: "CLIENTE ABC", days_charged: 6, cost_usd: 900, audit_status: "validated" },
];

// Mock containers for metrics
const mockContainers = [
  { status: "safe" },
  { status: "at_risk" },
  { status: "exceeded" },
  { status: "safe" },
];

export default function DemurrageCarrierCosts() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [quickFilter, setQuickFilter] = useState<"all" | "at_risk" | "exceeded" | "safe">("all");

  const formatCurrency = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

  const getStatusBadge = (status: string) => {
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

  const containerStats = {
    total: mockContainers.length,
    atRisk: mockContainers.filter(c => c.status === 'at_risk').length,
    exceeded: mockContainers.filter(c => c.status === 'exceeded').length,
    safe: mockContainers.filter(c => c.status === 'safe').length,
  };

  const filteredInvoices = mockInvoices.filter(inv => {
    const matchesSearch = 
      searchTerm === "" ||
      inv.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.armador.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.container.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || inv.audit_status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleQuickFilterChange = (filter: "all" | "at_risk" | "exceeded" | "safe") => {
    setQuickFilter(filter);
  };

  const rightActions = (
    <div className="flex gap-2">
      <Button variant="outline" className="bg-[rgba(0,0,0,0.7)] border-[rgba(255,255,255,0.25)] text-[#aaaaaa] hover:text-white hover:bg-[rgba(0,0,0,0.9)]">
        <FileSpreadsheet className="h-4 w-4 mr-2" />
        Exportar
      </Button>
      <Button className="bg-[#ffc800] text-black hover:bg-[#e6b400]">
        <Plus className="h-4 w-4 mr-2" />
        Nova Fatura
      </Button>
    </div>
  );

  return (
    <DemurrageLayout
      metrics={{
        totalContainers: containerStats.total,
        atRisk: containerStats.atRisk,
        exceeded: containerStats.exceeded,
        safe: containerStats.safe,
      }}
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
              <Table>
                <TableHeader>
                  <TableRow className="border-[rgba(255,255,255,0.1)]">
                    <TableHead>Fatura</TableHead>
                    <TableHead>Armador</TableHead>
                    <TableHead>Container</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-center">Dias</TableHead>
                    <TableHead className="text-right">Custo USD</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices.map((invoice) => (
                    <TableRow key={invoice.id} className="border-[rgba(255,255,255,0.1)] cursor-pointer hover:bg-[rgba(255,200,0,0.05)]">
                      <TableCell className="font-mono">{invoice.invoice_number}</TableCell>
                      <TableCell>{invoice.armador}</TableCell>
                      <TableCell className="font-mono">{invoice.container}</TableCell>
                      <TableCell>{invoice.cliente}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline">{invoice.days_charged} dias</Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-[#ffc800]">{formatCurrency(invoice.cost_usd)}</TableCell>
                      <TableCell>{getStatusBadge(invoice.audit_status)}</TableCell>
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
