import { useState } from "react";
import { DemurrageLayout } from "@/components/demurrage/DemurrageLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { Scale, Plus, CheckCircle, XCircle, Clock, MessageSquare } from "lucide-react";

// Mock data
const mockDisputes = [
  { id: "1", container: "MSCU1234567", cliente: "CLIENTE ABC", armador: "MSC", disputed_amount: 1500, recovered_amount: 0, status: "opened" },
  { id: "2", container: "HLCU7654321", cliente: "CLIENTE XYZ", armador: "HAPAG", disputed_amount: 2200, recovered_amount: 0, status: "negotiating" },
  { id: "3", container: "MAEU9876543", cliente: "CLIENTE 123", armador: "MAERSK", disputed_amount: 800, recovered_amount: 650, status: "won" },
  { id: "4", container: "CMAU5678901", cliente: "CLIENTE ABC", armador: "CMA CGM", disputed_amount: 1200, recovered_amount: 0, status: "lost" },
];

// Mock containers for metrics
const mockContainers = [
  { status: "safe" },
  { status: "at_risk" },
  { status: "exceeded" },
  { status: "safe" },
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
  };

  const containerStats = {
    total: mockContainers.length,
    atRisk: mockContainers.filter(c => c.status === 'at_risk').length,
    exceeded: mockContainers.filter(c => c.status === 'exceeded').length,
    safe: mockContainers.filter(c => c.status === 'safe').length,
  };

  const filteredDisputes = activeTab === 'all' ? mockDisputes : mockDisputes.filter(d => d.status === activeTab);

  const rightActions = (
    <Button className="bg-[#ffc800] text-black hover:bg-[#e6b400]">
      <Plus className="h-4 w-4 mr-2" />
      Abrir Disputa
    </Button>
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
    >
      <div className="space-y-4">
        {/* Inner Nav */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="all">Todas ({stats.total})</TabsTrigger>
            <TabsTrigger value="opened">Abertas ({stats.opened})</TabsTrigger>
            <TabsTrigger value="negotiating">Negociando ({stats.negotiating})</TabsTrigger>
            <TabsTrigger value="won">Ganhas ({stats.won})</TabsTrigger>
            <TabsTrigger value="lost">Perdidas ({stats.lost})</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Content */}
        <Card className="bg-[rgba(5,6,18,0.85)] border-[rgba(255,255,255,0.1)]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-foreground text-base">
              <Scale className="h-5 w-5 text-[#ffc800]" />
              Disputas
            </CardTitle>
            <CardDescription>{filteredDisputes.length} disputa(s)</CardDescription>
          </CardHeader>
          <CardContent>
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
                            <Button size="sm" variant="outline" className="border-[rgba(255,255,255,0.2)] text-xs">
                              Negociar
                            </Button>
                          )}
                          {(dispute.status === 'opened' || dispute.status === 'negotiating') && (
                            <>
                              <Button size="sm" className="bg-green-500/20 text-green-500 hover:bg-green-500/30 h-8 w-8 p-0">
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                              <Button size="sm" className="bg-red-500/20 text-red-500 hover:bg-red-500/30 h-8 w-8 p-0">
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
      </div>
    </DemurrageLayout>
  );
}
