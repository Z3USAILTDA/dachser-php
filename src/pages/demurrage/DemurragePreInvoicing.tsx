import { useState } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { KpiCard } from "@/components/demurrage/KpiCard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, DollarSign, Clock, CheckCircle2, Send, Eye, AlertTriangle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

// Mock data
const mockInvoices = [
  { id: "1", invoice_number: "DEM-2026-001", client_name: "CLIENTE ABC", bl_number: "MSCU1234567890", total_usd: 2500, workflow_status: "calculated", financial_status: "PENDING", created_at: "2026-01-05" },
  { id: "2", invoice_number: "DEM-2026-002", client_name: "CLIENTE XYZ", bl_number: "HLCU9876543210", total_usd: 1800, workflow_status: "reviewed", financial_status: "PENDING", created_at: "2026-01-04" },
  { id: "3", invoice_number: "DEM-2026-003", client_name: "CLIENTE 123", bl_number: "MAEU5678901234", total_usd: 3200, workflow_status: "sent_to_otelo", financial_status: "INVOICED", created_at: "2026-01-03" },
  { id: "4", invoice_number: "DEM-2026-004", client_name: "CLIENTE ABC", bl_number: "CMAU1357924680", total_usd: 950, workflow_status: "finalized", financial_status: "PAID", created_at: "2026-01-02" },
];

export default function DemurragePreInvoicing() {
  const [activeTab, setActiveTab] = useState("all");

  const formatCurrency = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

  const getWorkflowBadge = (status: string) => {
    switch (status) {
      case 'calculated':
        return <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20"><Clock className="h-3 w-3 mr-1" />Calculada</Badge>;
      case 'reviewed':
        return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20"><Eye className="h-3 w-3 mr-1" />Revisada</Badge>;
      case 'sent_to_otelo':
        return <Badge className="bg-purple-500/10 text-purple-600 border-purple-500/20"><Send className="h-3 w-3 mr-1" />Lançada</Badge>;
      case 'finalized':
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20"><CheckCircle2 className="h-3 w-3 mr-1" />Finalizada</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getFinancialBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <Badge variant="outline" className="text-yellow-600">Pendente</Badge>;
      case 'INVOICED':
        return <Badge variant="outline" className="text-blue-600">Faturada</Badge>;
      case 'PAID':
        return <Badge variant="outline" className="text-green-600">Paga</Badge>;
      case 'OVERDUE':
        return <Badge variant="outline" className="text-red-600">Vencida</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const stats = {
    total: mockInvoices.length,
    calculated: mockInvoices.filter(i => i.workflow_status === 'calculated').length,
    reviewed: mockInvoices.filter(i => i.workflow_status === 'reviewed').length,
    sent: mockInvoices.filter(i => i.workflow_status === 'sent_to_otelo').length,
    finalized: mockInvoices.filter(i => i.workflow_status === 'finalized').length,
    totalUsd: mockInvoices.reduce((acc, inv) => acc + inv.total_usd, 0),
    pendingUsd: mockInvoices.filter(i => i.financial_status === 'PENDING').reduce((acc, inv) => acc + inv.total_usd, 0),
  };

  const filteredInvoices = mockInvoices.filter(inv => {
    if (activeTab === 'all') return true;
    return inv.workflow_status === activeTab;
  });

  return (
    <PageLayout 
      title="DACHSER" 
      subtitle="Demurrage / Detention — Pré-Faturamento"
      pageIcon={FileText}
    >
      <div className="space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            title="TOTAL PRÉ-FATURAS"
            value={stats.total}
            subtitle="Documentos gerados"
            icon={<FileText className="h-6 w-6" />}
            variant="primary"
          />
          <KpiCard
            title="AGUARDANDO REVISÃO"
            value={stats.calculated}
            subtitle="Calculadas pendentes"
            icon={<Clock className="h-6 w-6" />}
            variant="warning"
          />
          <KpiCard
            title="TOTAL USD"
            value={formatCurrency(stats.totalUsd)}
            subtitle="Valor consolidado"
            icon={<DollarSign className="h-6 w-6" />}
            variant="info"
          />
          <KpiCard
            title="PENDENTE"
            value={formatCurrency(stats.pendingUsd)}
            subtitle="Aguardando pagamento"
            icon={<AlertTriangle className="h-6 w-6" />}
            variant="danger"
          />
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-background/50">
            <TabsTrigger value="all">Todas ({stats.total})</TabsTrigger>
            <TabsTrigger value="calculated">Calculadas ({stats.calculated})</TabsTrigger>
            <TabsTrigger value="reviewed">Revisadas ({stats.reviewed})</TabsTrigger>
            <TabsTrigger value="sent_to_otelo">Lançadas ({stats.sent})</TabsTrigger>
            <TabsTrigger value="finalized">Finalizadas ({stats.finalized})</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-4">
            <Card className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]">
              <CardHeader>
                <CardTitle className="text-foreground">Pré-Faturas</CardTitle>
                <CardDescription>{filteredInvoices.length} encontrada(s)</CardDescription>
              </CardHeader>
              <CardContent>
                {!filteredInvoices.length ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Nenhuma pré-fatura encontrada</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-[rgba(255,255,255,0.1)]">
                        <TableHead>Nº Fatura</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>BL</TableHead>
                        <TableHead className="text-right">Total USD</TableHead>
                        <TableHead>Workflow</TableHead>
                        <TableHead>Financeiro</TableHead>
                        <TableHead>Data</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredInvoices.map((inv) => (
                        <TableRow key={inv.id} className="border-[rgba(255,255,255,0.1)] cursor-pointer hover:bg-primary/5">
                          <TableCell className="font-mono font-medium">{inv.invoice_number}</TableCell>
                          <TableCell>{inv.client_name}</TableCell>
                          <TableCell className="font-mono text-sm">{inv.bl_number}</TableCell>
                          <TableCell className="text-right font-semibold text-primary">{formatCurrency(inv.total_usd)}</TableCell>
                          <TableCell>{getWorkflowBadge(inv.workflow_status)}</TableCell>
                          <TableCell>{getFinancialBadge(inv.financial_status)}</TableCell>
                          <TableCell>{inv.created_at}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </PageLayout>
  );
}
