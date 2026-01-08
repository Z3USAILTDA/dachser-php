import { useState } from "react";
import { DemurrageLayout } from "@/components/demurrage/DemurrageLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Plus, Edit, Bell, BellOff, Search } from "lucide-react";

// Mock data
const mockProfiles = [
  { id: "1", client_name: "CLIENTE ABC", auto_alert_enabled: true, containers: 12, total_demurrage: 4500, exceeded: 2 },
  { id: "2", client_name: "CLIENTE XYZ", auto_alert_enabled: false, containers: 8, total_demurrage: 2200, exceeded: 1 },
  { id: "3", client_name: "CLIENTE 123", auto_alert_enabled: true, containers: 15, total_demurrage: 6800, exceeded: 4 },
  { id: "4", client_name: "CLIENTE DEF", auto_alert_enabled: true, containers: 5, total_demurrage: 950, exceeded: 0 },
];

// Mock containers for metrics
const mockContainers = [
  { status: "safe" },
  { status: "at_risk" },
  { status: "exceeded" },
  { status: "safe" },
];

export default function DemurrageClients() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterReports, setFilterReports] = useState<string>("all");
  const [quickFilter, setQuickFilter] = useState<"all" | "at_risk" | "exceeded" | "safe">("all");

  const formatCurrency = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(value);

  const filteredProfiles = mockProfiles.filter(p => {
    const matchesSearch = p.client_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterReports === "all" || 
      (filterReports === "reports" && p.auto_alert_enabled) ||
      (filterReports === "no-reports" && !p.auto_alert_enabled);
    return matchesSearch && matchesFilter;
  });

  const containerStats = {
    total: mockContainers.length,
    atRisk: mockContainers.filter(c => c.status === 'at_risk').length,
    exceeded: mockContainers.filter(c => c.status === 'exceeded').length,
    safe: mockContainers.filter(c => c.status === 'safe').length,
  };

  const handleQuickFilterChange = (filter: "all" | "at_risk" | "exceeded" | "safe") => {
    setQuickFilter(filter);
  };

  const rightActions = (
    <Button className="bg-[#ffc800] text-black hover:bg-[#e6b400]">
      <Plus className="h-4 w-4 mr-2" />
      Novo Perfil
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
              Perfis Configurados
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
                    <TableRow key={profile.id} className="border-[rgba(255,255,255,0.1)]">
                      <TableCell className="font-medium">{profile.client_name}</TableCell>
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
