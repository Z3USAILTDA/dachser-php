import { useState } from "react";
import { DemurrageLayout } from "@/components/demurrage/DemurrageLayout";
import { KpiCard } from "@/components/demurrage/KpiCard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FileText, Clock, CheckCircle2, Send, Eye, AlertTriangle, DollarSign } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

// Mock data
const mockInvoices = [
  { id: "1", invoice_number: "DEM-2026-001", client_name: "CLIENTE ABC", bl_number: "MSCU1234567890", total_usd: 2500, workflow_status: "calculated", financial_status: "PENDING", created_at: "2026-01-05" },
  { id: "2", invoice_number: "DEM-2026-002", client_name: "CLIENTE XYZ", bl_number: "HLCU9876543210", total_usd: 1800, workflow_status: "reviewed", financial_status: "PENDING", created_at: "2026-01-04" },
  { id: "3", invoice_number: "DEM-2026-003", client_name: "CLIENTE 123", bl_number: "MAEU5678901234", total_usd: 3200, workflow_status: "sent_to_otelo", financial_status: "INVOICED", created_at: "2026-01-03" },
  { id: "4", invoice_number: "DEM-2026-004", client_name: "CLIENTE ABC", bl_number: "CMAU1357924680", total_usd: 950, workflow_status: "finalized", financial_status: "PAID", created_at: "2026-01-02" },
  { id: "5", invoice_number: "DEM-2026-005", client_name: "CLIENTE DEF", bl_number: "OOCL4567891234", total_usd: 4200, workflow_status: "calculated", financial_status: "PENDING", created_at: "2026-01-06" },
  { id: "6", invoice_number: "DEM-2026-006", client_name: "CLIENTE GHI", bl_number: "YMLU7891234567", total_usd: 1500, workflow_status: "calculated", financial_status: "PENDING", created_at: "2026-01-07" },
];

type QuickFilter = "all" | "waiting" | "total_usd" | "pending";

export default function DemurragePreInvoicing() {
  const [activeTab, setActiveTab] = useState("all");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");

  const formatCurrency = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

  const getWorkflowBadge = (status: string) => {
    switch (status) {
      case 'calculated':
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20"><Clock className="h-3 w-3 mr-1" />Calculada</Badge>;
      case 'reviewed':
        return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20"><Eye className="h-3 w-3 mr-1" />Revisada</Badge>;
      case 'sent_to_otelo':
        return <Badge className="bg-purple-500/10 text-purple-500 border-purple-500/20"><Send className="h-3 w-3 mr-1" />Lançada</Badge>;
      case 'finalized':
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20"><CheckCircle2 className="h-3 w-3 mr-1" />Finalizada</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getFinancialBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <Badge variant="outline" className="text-yellow-500 border-yellow-500/30">Pendente</Badge>;
      case 'INVOICED':
        return <Badge variant="outline" className="text-blue-500 border-blue-500/30">Faturada</Badge>;
      case 'PAID':
        return <Badge variant="outline" className="text-green-500 border-green-500/30">Paga</Badge>;
      case 'OVERDUE':
        return <Badge variant="outline" className="text-red-500 border-red-500/30">Vencida</Badge>;
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
    totalUsd: mockInvoices.reduce((sum, i) => sum + i.total_usd, 0),
    pendingUsd: mockInvoices.filter(i => i.financial_status === 'PENDING').reduce((sum, i) => sum + i.total_usd, 0),
  };

  const filteredInvoices = mockInvoices.filter(inv => {
    if (activeTab === 'all') return true;
    return inv.workflow_status === activeTab;
  });

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
        value={8}
        subtitle="Documentos gerados"
        icon={<FileText className="h-6 w-6" />}
        variant="default"
        isActive={quickFilter === "all"}
        onClick={() => handleQuickFilterChange("all")}
      />
      <KpiCard
        title="AGUARDANDO REVISÃO"
        value={6}
        subtitle="Calculadas pendentes"
        icon={<Clock className="h-6 w-6" />}
        variant="warning"
        isActive={quickFilter === "waiting"}
        onClick={() => handleQuickFilterChange("waiting")}
      />
      <KpiCard
        title="TOTAL USD"
        value="$90,505.00"
        subtitle="Valor consolidado"
        icon={<DollarSign className="h-6 w-6" />}
        variant="info"
        isActive={quickFilter === "total_usd"}
        onClick={() => handleQuickFilterChange("total_usd")}
      />
      <KpiCard
        title="PENDENTE"
        value="$77,765.00"
        subtitle="Aguardando pagamento"
        icon={<AlertTriangle className="h-6 w-6" />}
        variant="critical"
        isActive={quickFilter === "pending"}
        onClick={() => handleQuickFilterChange("pending")}
      />
    </div>
  );

  return (
    <DemurrageLayout customCards={customCards}>
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
                    <TableRow key={inv.id} className="border-[rgba(255,255,255,0.1)] cursor-pointer hover:bg-[rgba(255,200,0,0.05)]">
                      <TableCell className="font-mono font-medium">{inv.invoice_number}</TableCell>
                      <TableCell>{inv.client_name}</TableCell>
                      <TableCell className="font-mono text-sm">{inv.bl_number}</TableCell>
                      <TableCell className="text-right font-semibold text-[#ffc800]">{formatCurrency(inv.total_usd)}</TableCell>
                      <TableCell>{getWorkflowBadge(inv.workflow_status)}</TableCell>
                      <TableCell>{getFinancialBadge(inv.financial_status)}</TableCell>
                      <TableCell className="text-muted-foreground">{inv.created_at}</TableCell>
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
