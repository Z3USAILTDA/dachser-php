import { useState } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { KpiCard } from "@/components/demurrage/KpiCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Scale, Plus, CheckCircle, XCircle, Clock, MessageSquare, DollarSign, TrendingUp } from "lucide-react";
import { toast } from "sonner";

// Mock data
const mockDisputes = [
  { id: "1", container: "MSCU1234567", cliente: "CLIENTE ABC", armador: "MSC", disputed_amount: 1500, recovered_amount: 0, status: "opened" },
  { id: "2", container: "HLCU7654321", cliente: "CLIENTE XYZ", armador: "HAPAG", disputed_amount: 2200, recovered_amount: 0, status: "negotiating" },
  { id: "3", container: "MAEU9876543", cliente: "CLIENTE 123", armador: "MAERSK", disputed_amount: 800, recovered_amount: 650, status: "won" },
  { id: "4", container: "CMAU5678901", cliente: "CLIENTE ABC", armador: "CMA CGM", disputed_amount: 1200, recovered_amount: 0, status: "lost" },
];

export default function DemurrageDisputes() {
  const [activeTab, setActiveTab] = useState("all");

  const formatCurrency = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(value);

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = { opened: 'Aberta', negotiating: 'Em negociação', won: 'Ganha', lost: 'Perdida' };
    return labels[status] || status;
  };

  const getStatusBadge = (status: string) => {
    const Icon = status === 'opened' ? Clock : status === 'negotiating' ? MessageSquare : status === 'won' ? CheckCircle : XCircle;
    const colors: Record<string, string> = {
      opened: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
      negotiating: "bg-blue-500/10 text-blue-500 border-blue-500/20",
      won: "bg-green-500/10 text-green-500 border-green-500/20",
      lost: "bg-red-500/10 text-red-500 border-red-500/20",
    };
    
    return (
      <Badge className={colors[status] || ""}>
        <Icon className="h-3 w-3 mr-1" />
        {getStatusLabel(status)}
      </Badge>
    );
  };

  const stats = {
    total: mockDisputes.length,
    opened: mockDisputes.filter(d => d.status === 'opened').length,
    negotiating: mockDisputes.filter(d => d.status === 'negotiating').length,
    won: mockDisputes.filter(d => d.status === 'won').length,
    lost: mockDisputes.filter(d => d.status === 'lost').length,
    totalDisputed: mockDisputes.reduce((acc, d) => acc + d.disputed_amount, 0),
    totalRecovered: mockDisputes.filter(d => d.status === 'won').reduce((acc, d) => acc + d.recovered_amount, 0),
  };

  const filteredDisputes = activeTab === 'all' ? mockDisputes : mockDisputes.filter(d => d.status === activeTab);

  return (
    <PageLayout 
      title="DACHSER" 
      subtitle="Demurrage / Detention — Disputas"
      pageIcon={Scale}
    >
      <div className="space-y-6">
        {/* Actions */}
        <div className="flex justify-end">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Abrir Disputa
          </Button>
        </div>

        {/* KPIs */}
        <div className="grid gap-4 md:grid-cols-4">
          <KpiCard
            title="TOTAL DISPUTADO"
            value={formatCurrency(stats.totalDisputed)}
            subtitle={`${stats.total} disputa(s)`}
            icon={<DollarSign className="h-6 w-6" />}
            variant="primary"
          />
          <KpiCard
            title="VALOR RECUPERADO"
            value={formatCurrency(stats.totalRecovered)}
            subtitle={`${stats.won} disputa(s) ganha(s)`}
            icon={<TrendingUp className="h-6 w-6" />}
            variant="success"
          />
          <KpiCard
            title="EM ANDAMENTO"
            value={stats.opened + stats.negotiating}
            subtitle="Abertas + Negociando"
            icon={<Clock className="h-6 w-6" />}
            variant="warning"
          />
          <KpiCard
            title="TAXA DE SUCESSO"
            value={`${stats.won + stats.lost > 0 ? ((stats.won / (stats.won + stats.lost)) * 100).toFixed(0) : 0}%`}
            subtitle={`${stats.won}W / ${stats.lost}L`}
            icon={<CheckCircle className="h-6 w-6" />}
            variant="info"
          />
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-background/50">
            <TabsTrigger value="all">Todas ({stats.total})</TabsTrigger>
            <TabsTrigger value="opened">Abertas ({stats.opened})</TabsTrigger>
            <TabsTrigger value="negotiating">Negociando ({stats.negotiating})</TabsTrigger>
            <TabsTrigger value="won">Ganhas ({stats.won})</TabsTrigger>
            <TabsTrigger value="lost">Perdidas ({stats.lost})</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-4">
            <Card className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]">
              <CardContent className="pt-6">
                {filteredDisputes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Scale className="h-12 w-12 mb-4 opacity-50" />
                    <p>Nenhuma disputa encontrada</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-[rgba(255,255,255,0.1)]">
                        <TableHead>Container</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Armador</TableHead>
                        <TableHead className="text-right">Valor Disputado</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Recuperado</TableHead>
                        <TableHead>Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDisputes.map((dispute) => (
                        <TableRow key={dispute.id} className="border-[rgba(255,255,255,0.1)]">
                          <TableCell className="font-mono">{dispute.container}</TableCell>
                          <TableCell>{dispute.cliente}</TableCell>
                          <TableCell>{dispute.armador}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(dispute.disputed_amount)}</TableCell>
                          <TableCell>{getStatusBadge(dispute.status)}</TableCell>
                          <TableCell className="text-right font-medium text-green-500">
                            {dispute.status === 'won' ? formatCurrency(dispute.recovered_amount) : '-'}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {dispute.status === 'opened' && (
                                <Button size="sm" variant="outline">Negociar</Button>
                              )}
                              {(dispute.status === 'opened' || dispute.status === 'negotiating') && (
                                <>
                                  <Button size="sm" variant="default">
                                    <CheckCircle className="h-4 w-4" />
                                  </Button>
                                  <Button size="sm" variant="destructive">
                                    <XCircle className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
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
