import { useState } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { KpiCard } from "@/components/demurrage/KpiCard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Ship, Plus, Search, AlertTriangle, CheckCircle2, FileSearch, DollarSign, FileSpreadsheet } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

// Mock data
const mockInvoices = [
  { id: "1", invoice_number: "INV-MSC-001", armador: "MSC", container: "MSCU1234567", cliente: "CLIENTE ABC", days_charged: 5, cost_usd: 750, audit_status: "validated" },
  { id: "2", invoice_number: "INV-HAPAG-002", armador: "HAPAG", container: "HLCU7654321", cliente: "CLIENTE XYZ", days_charged: 8, cost_usd: 1200, audit_status: "discrepancy" },
  { id: "3", invoice_number: "INV-MAERSK-003", armador: "MAERSK", container: "MAEU9876543", cliente: "CLIENTE 123", days_charged: 3, cost_usd: 540, audit_status: "pending" },
  { id: "4", invoice_number: "INV-CMA-004", armador: "CMA CGM", container: "CMAU5678901", cliente: "CLIENTE ABC", days_charged: 6, cost_usd: 900, audit_status: "validated" },
];

export default function DemurrageCarrierCosts() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

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

  const totals = mockInvoices.reduce((acc, inv) => ({
    totalCost: acc.totalCost + inv.cost_usd,
    validated: acc.validated + (inv.audit_status === 'validated' ? inv.cost_usd : 0),
    discrepancy: acc.discrepancy + (inv.audit_status === 'discrepancy' ? inv.cost_usd : 0),
    pending: acc.pending + (inv.audit_status === 'pending' ? inv.cost_usd : 0)
  }), { totalCost: 0, validated: 0, discrepancy: 0, pending: 0 });

  const filteredInvoices = mockInvoices.filter(inv => {
    const matchesSearch = 
      searchTerm === "" ||
      inv.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.armador.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.container.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || inv.audit_status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <PageLayout 
      title="DACHSER" 
      subtitle="Demurrage / Detention — Custos Armadores"
      pageIcon={Ship}
    >
      <div className="space-y-6">
        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button variant="outline">
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Exportar Excel
          </Button>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Nova Fatura
          </Button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-4 gap-4">
          <KpiCard
            title="TOTAL CUSTOS"
            value={formatCurrency(totals.totalCost)}
            subtitle="Faturas recebidas"
            icon={<DollarSign className="h-6 w-6" />}
            variant="primary"
          />
          <KpiCard
            title="VALIDADAS"
            value={formatCurrency(totals.validated)}
            subtitle="Auditoria concluída"
            icon={<CheckCircle2 className="h-6 w-6" />}
            variant="success"
          />
          <KpiCard
            title="DISCREPÂNCIAS"
            value={formatCurrency(totals.discrepancy)}
            subtitle="Requer análise"
            icon={<AlertTriangle className="h-6 w-6" />}
            variant="danger"
          />
          <KpiCard
            title="PENDENTES"
            value={formatCurrency(totals.pending)}
            subtitle="Aguardando auditoria"
            icon={<FileSearch className="h-6 w-6" />}
            variant="warning"
          />
        </div>

        {/* Filters */}
        <Card className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]">
          <CardContent className="pt-6">
            <div className="flex gap-4 items-center">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Buscar por fatura, armador ou container..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-background/50"
                  />
                </div>
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-48 bg-background/50">
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
        <Card className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Ship className="h-5 w-5 text-primary" />
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
                    <TableRow key={invoice.id} className="border-[rgba(255,255,255,0.1)]">
                      <TableCell className="font-mono">{invoice.invoice_number}</TableCell>
                      <TableCell>{invoice.armador}</TableCell>
                      <TableCell className="font-mono">{invoice.container}</TableCell>
                      <TableCell>{invoice.cliente}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline">{invoice.days_charged} dias</Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-primary">{formatCurrency(invoice.cost_usd)}</TableCell>
                      <TableCell>{getStatusBadge(invoice.audit_status)}</TableCell>
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
