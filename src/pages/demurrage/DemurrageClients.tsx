import { useState, useMemo } from "react";
import { DemurrageLayout } from "@/components/demurrage/DemurrageLayout";
import { KpiCard } from "@/components/demurrage/KpiCard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Plus, Edit, Bell, BellOff, Search, DollarSign, AlertTriangle } from "lucide-react";
import { useDemurrageData } from "@/hooks/useDemurrageData";

type QuickFilter = "all" | "reports" | "no_reports" | "demurrage" | "pending";

interface ClientProfile {
  cliente: string;
  auto_alert_enabled: boolean;
  containers: number;
  total_demurrage: number;
  exceeded: number;
}

export default function DemurrageClients() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterReports, setFilterReports] = useState<string>("all");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");

  const { data: containers = [], isLoading } = useDemurrageData();

  // Group containers by client
  const clientProfiles = useMemo(() => {
    const clientMap = new Map<string, ClientProfile>();

    containers.forEach(c => {
      const clientName = c.cliente || 'SEM CLIENTE';
      
      if (!clientMap.has(clientName)) {
        clientMap.set(clientName, {
          cliente: clientName,
          auto_alert_enabled: c.client_auto_alert,
          containers: 0,
          total_demurrage: 0,
          exceeded: 0,
        });
      }

      const profile = clientMap.get(clientName)!;
      profile.containers += 1;
      profile.total_demurrage += c.expected_cost_usd || 0;
      if (['exceeded', 'critical'].includes(c.risk_status)) {
        profile.exceeded += 1;
      }
    });

    return Array.from(clientMap.values()).sort((a, b) => b.total_demurrage - a.total_demurrage);
  }, [containers]);

  const formatCurrency = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(value);

  const stats = useMemo(() => {
    const total = clientProfiles.length;
    const reportsEnabled = clientProfiles.filter(p => p.auto_alert_enabled).length;
    const noReports = clientProfiles.filter(p => !p.auto_alert_enabled).length;
    const totalDemurrage = clientProfiles.reduce((sum, p) => sum + p.total_demurrage, 0);
    // Count unique clients in containers that don't have a profile yet (approximation)
    const pendingProfiles = 0; // This would need a separate query to determine

    return { total, reportsEnabled, noReports, totalDemurrage, pendingProfiles };
  }, [clientProfiles]);

  const filteredProfiles = useMemo(() => {
    return clientProfiles.filter(p => {
      const matchesSearch = p.cliente.toLowerCase().includes(searchTerm.toLowerCase());
      
      let matchesQuickFilter = true;
      if (quickFilter === "reports") {
        matchesQuickFilter = p.auto_alert_enabled;
      } else if (quickFilter === "no_reports") {
        matchesQuickFilter = !p.auto_alert_enabled;
      }
      
      const matchesFilter = filterReports === "all" || 
        (filterReports === "reports" && p.auto_alert_enabled) ||
        (filterReports === "no-reports" && !p.auto_alert_enabled);
      return matchesSearch && matchesQuickFilter && matchesFilter;
    });
  }, [clientProfiles, searchTerm, quickFilter, filterReports]);

  const handleQuickFilterChange = (filter: QuickFilter) => {
    setQuickFilter(filter);
  };

  const rightActions = (
    <Button className="bg-[#ffc800] text-black hover:bg-[#e6b400]">
      <Plus className="h-4 w-4 mr-2" />
      Novo Perfil
    </Button>
  );

  const customCards = (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      <KpiCard
        title="TOTAL PERFIS"
        value={stats.total}
        subtitle="Clientes com containers"
        icon={<Users className="h-6 w-6" />}
        variant="default"
        isActive={quickFilter === "all"}
        onClick={() => handleQuickFilterChange("all")}
      />
      <KpiCard
        title="REPORTA DEMURRAGE"
        value={stats.reportsEnabled}
        subtitle="Com alertas ativos"
        icon={<Bell className="h-6 w-6" />}
        variant="warning"
        isActive={quickFilter === "reports"}
        onClick={() => handleQuickFilterChange("reports")}
      />
      <KpiCard
        title="NÃO REPORTA"
        value={stats.noReports}
        subtitle="Sem alertas"
        icon={<BellOff className="h-6 w-6" />}
        variant="info"
        isActive={quickFilter === "no_reports"}
        onClick={() => handleQuickFilterChange("no_reports")}
      />
      <KpiCard
        title="DEMURRAGE TOTAL"
        value={formatCurrency(stats.totalDemurrage)}
        subtitle="Valor consolidado"
        icon={<DollarSign className="h-6 w-6" />}
        variant="default"
        isActive={quickFilter === "demurrage"}
        onClick={() => handleQuickFilterChange("demurrage")}
      />
      <KpiCard
        title="SEM PERFIL"
        value={stats.pendingProfiles}
        subtitle="Aguardando cadastro"
        icon={<AlertTriangle className="h-6 w-6" />}
        variant="critical"
        isActive={quickFilter === "pending"}
        onClick={() => handleQuickFilterChange("pending")}
      />
    </div>
  );

  return (
    <DemurrageLayout
      rightActions={rightActions}
      customCards={customCards}
      loading={isLoading}
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
                    placeholder="Buscar cliente..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]"
                  />
                </div>
              </div>
              <Select value={filterReports} onValueChange={setFilterReports}>
                <SelectTrigger className="w-48 bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]">
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
        <Card className="bg-[rgba(5,6,18,0.85)] border-[rgba(255,255,255,0.1)]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-foreground text-base">
              <Users className="h-5 w-5 text-[#ffc800]" />
              Perfis por Cliente
            </CardTitle>
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
                    <TableRow key={profile.cliente} className="border-[rgba(255,255,255,0.1)]">
                      <TableCell className="font-medium">{profile.cliente}</TableCell>
                      <TableCell>
                        <Button 
                          size="sm" 
                          variant={profile.auto_alert_enabled ? "default" : "secondary"}
                          className={profile.auto_alert_enabled 
                            ? "gap-1 bg-green-500/20 text-green-500 hover:bg-green-500/30 border-green-500/30" 
                            : "gap-1 bg-[rgba(255,255,255,0.1)] text-muted-foreground"
                          }
                        >
                          {profile.auto_alert_enabled ? <Bell className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
                          {profile.auto_alert_enabled ? 'Sim' : 'Não'}
                        </Button>
                      </TableCell>
                      <TableCell className="text-center font-medium">{profile.containers}</TableCell>
                      <TableCell className="text-right font-semibold text-[#ffc800]">
                        {formatCurrency(profile.total_demurrage)}
                      </TableCell>
                      <TableCell className="text-center">
                        {profile.exceeded ? (
                          <Badge variant="destructive">{profile.exceeded}</Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">0</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-white">
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
    </DemurrageLayout>
  );
}
