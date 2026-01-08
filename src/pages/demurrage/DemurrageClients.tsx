import { useState } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { KpiCard } from "@/components/demurrage/KpiCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Plus, Edit, Bell, BellOff, DollarSign, Package, Search } from "lucide-react";
import { toast } from "sonner";

// Mock data
const mockProfiles = [
  { id: "1", client_name: "CLIENTE ABC", auto_alert_enabled: true, containers: 12, total_demurrage: 4500, exceeded: 2 },
  { id: "2", client_name: "CLIENTE XYZ", auto_alert_enabled: false, containers: 8, total_demurrage: 2200, exceeded: 1 },
  { id: "3", client_name: "CLIENTE 123", auto_alert_enabled: true, containers: 15, total_demurrage: 6800, exceeded: 4 },
  { id: "4", client_name: "CLIENTE DEF", auto_alert_enabled: true, containers: 5, total_demurrage: 950, exceeded: 0 },
];

export default function DemurrageClients() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterReports, setFilterReports] = useState<string>("all");

  const formatCurrency = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(value);

  const filteredProfiles = mockProfiles.filter(p => {
    const matchesSearch = p.client_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterReports === "all" || 
      (filterReports === "reports" && p.auto_alert_enabled) ||
      (filterReports === "no-reports" && !p.auto_alert_enabled);
    return matchesSearch && matchesFilter;
  });

  const kpis = {
    total: mockProfiles.length,
    reportsYes: mockProfiles.filter(p => p.auto_alert_enabled).length,
    reportsNo: mockProfiles.filter(p => !p.auto_alert_enabled).length,
    totalDemurrage: mockProfiles.reduce((sum, p) => sum + p.total_demurrage, 0),
  };

  return (
    <PageLayout 
      title="DACHSER" 
      subtitle="Demurrage / Detention — Clientes"
      pageIcon={Users}
    >
      <div className="space-y-6">
        {/* Actions */}
        <div className="flex justify-end">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Novo Perfil
          </Button>
        </div>

        {/* KPIs */}
        <div className="grid gap-4 md:grid-cols-4">
          <KpiCard
            title="TOTAL PERFIS"
            value={kpis.total}
            subtitle="Clientes cadastrados"
            icon={<Users className="h-6 w-6" />}
            variant="primary"
          />
          <KpiCard
            title="REPORTA DEMURRAGE"
            value={kpis.reportsYes}
            subtitle="Com alertas ativos"
            icon={<Bell className="h-6 w-6" />}
            variant="success"
          />
          <KpiCard
            title="NÃO REPORTA"
            value={kpis.reportsNo}
            subtitle="Sem alertas"
            icon={<BellOff className="h-6 w-6" />}
            variant="default"
          />
          <KpiCard
            title="DEMURRAGE TOTAL"
            value={formatCurrency(kpis.totalDemurrage)}
            subtitle="Valor consolidado"
            icon={<DollarSign className="h-6 w-6" />}
            variant="warning"
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
                    placeholder="Buscar cliente..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-background/50"
                  />
                </div>
              </div>
              <Select value={filterReports} onValueChange={setFilterReports}>
                <SelectTrigger className="w-48 bg-background/50">
                  <SelectValue placeholder="Filtrar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="reports">Reporta Demurrage</SelectItem>
                  <SelectItem value="no-reports">Não Reporta</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]">
          <CardHeader>
            <CardTitle className="text-foreground">Perfis Configurados</CardTitle>
            <CardDescription>{filteredProfiles.length} perfil(is)</CardDescription>
          </CardHeader>
          <CardContent>
            {filteredProfiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mb-4 opacity-50" />
                <p>Nenhum perfil encontrado</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-[rgba(255,255,255,0.1)]">
                    <TableHead>Cliente</TableHead>
                    <TableHead>Reporta</TableHead>
                    <TableHead className="text-center">Containers</TableHead>
                    <TableHead className="text-right">Demurrage</TableHead>
                    <TableHead className="text-center">Excedidos</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProfiles.map((profile) => (
                    <TableRow key={profile.id} className="border-[rgba(255,255,255,0.1)]">
                      <TableCell className="font-medium">{profile.client_name}</TableCell>
                      <TableCell>
                        <Button 
                          size="sm" 
                          variant={profile.auto_alert_enabled ? "default" : "secondary"}
                          className="gap-1"
                        >
                          {profile.auto_alert_enabled ? <Bell className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
                          {profile.auto_alert_enabled ? 'Sim' : 'Não'}
                        </Button>
                      </TableCell>
                      <TableCell className="text-center font-medium">{profile.containers}</TableCell>
                      <TableCell className="text-right font-semibold text-primary">
                        {formatCurrency(profile.total_demurrage)}
                      </TableCell>
                      <TableCell className="text-center">
                        {profile.exceeded ? (
                          <Badge variant="destructive">{profile.exceeded}</Badge>
                        ) : (
                          <Badge variant="outline">0</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost">
                          <Edit className="h-4 w-4" />
                        </Button>
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
