import { useState, useMemo } from "react";
import { DemurrageLayout } from "@/components/demurrage/DemurrageLayout";
import { KpiCard } from "@/components/demurrage/KpiCard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  TrendingUp,
  Users,
  Ship,
  Calendar,
  Package,
  DollarSign,
  Target,
  Clock,
  Loader2
} from "lucide-react";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, AreaChart, Area, Legend 
} from "recharts";
import { useDemurrageData, useDemurrageStats, useDemurrageClients, useDemurrageArmadores } from "@/hooks/useDemurrageData";

type QuickFilter = "all" | "containers" | "demurrage" | "recovered" | "success" | "avg_days";

export default function DemurrageAnalytics() {
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  
  const { data: containers = [], isLoading: loadingContainers } = useDemurrageData();
  const { data: stats, isLoading: loadingStats } = useDemurrageStats();
  const { data: clientsData = [], isLoading: loadingClients } = useDemurrageClients();
  const { data: armadoresData = [], isLoading: loadingArmadores } = useDemurrageArmadores();

  const isLoading = loadingContainers || loadingStats || loadingClients || loadingArmadores;

  // Calculate KPIs from real data
  const kpis = useMemo(() => {
    const totalContainers = stats?.total || containers.length;
    const totalDemurrage = stats?.totalDemurrageUsd || containers.reduce((sum, c) => sum + (c.expected_cost_usd || 0), 0);
    
    // Calculate recovered from disputes won
    const recovered = containers
      .filter(c => c.dispute_status === 'won')
      .reduce((sum, c) => sum + (c.recovered_amount_usd || 0), 0);
    
    // Calculate success rate
    const disputesWon = containers.filter(c => c.dispute_status === 'won').length;
    const disputesLost = containers.filter(c => c.dispute_status === 'lost').length;
    const totalDisputes = disputesWon + disputesLost;
    const successRate = totalDisputes > 0 ? Math.round((disputesWon / totalDisputes) * 100) : 0;
    
    // Average days exceeded
    const containersWithExcess = containers.filter(c => (c.excedente_dias || 0) > 0);
    const avgDaysExceeded = containersWithExcess.length > 0
      ? (containersWithExcess.reduce((sum, c) => sum + (c.excedente_dias || 0), 0) / containersWithExcess.length).toFixed(1)
      : '0';

    return {
      totalContainers,
      totalDemurrage,
      recovered,
      successRate,
      disputesWon,
      disputesLost,
      avgDaysExceeded
    };
  }, [containers, stats]);

  // Status distribution for pie chart
  const statusDistribution = useMemo(() => {
    const statusCounts = {
      safe: 0,
      at_risk: 0,
      critical: 0,
      exceeded: 0,
      pending: 0
    };
    
    containers.forEach(c => {
      const status = c.risk_status || 'pending';
      if (status in statusCounts) {
        statusCounts[status as keyof typeof statusCounts]++;
      }
    });

    return [
      { name: 'OK', value: statusCounts.safe, color: '#22c55e' },
      { name: 'Risco', value: statusCounts.at_risk, color: '#eab308' },
      { name: 'Crítico', value: statusCounts.critical, color: '#f97316' },
      { name: 'Excedido', value: statusCounts.exceeded, color: '#ef4444' },
      { name: 'Pendente', value: statusCounts.pending, color: '#6b7280' },
    ].filter(s => s.value > 0);
  }, [containers]);

  // Top clients from real data
  const topClients = useMemo(() => {
    return clientsData
      .map(c => ({
        name: c.cliente || 'Sem cliente',
        demurrage: c.total_demurrage || 0
      }))
      .sort((a, b) => b.demurrage - a.demurrage)
      .slice(0, 5);
  }, [clientsData]);

  // Top armadores from real data
  const topArmadores = useMemo(() => {
    // Aggregate demurrage by armador from containers
    const armadorMap = new Map<string, number>();
    containers.forEach(c => {
      if (c.armador) {
        const current = armadorMap.get(c.armador) || 0;
        armadorMap.set(c.armador, current + (c.expected_cost_usd || 0));
      }
    });
    
    return Array.from(armadorMap.entries())
      .map(([name, demurrage]) => ({ name, demurrage }))
      .sort((a, b) => b.demurrage - a.demurrage)
      .slice(0, 5);
  }, [containers]);

  // Monthly trend from containers created_at
  const monthlyTrend = useMemo(() => {
    const monthMap = new Map<string, { demurrage: number; recovered: number }>();
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    
    containers.forEach(c => {
      if (c.created_at) {
        const date = new Date(c.created_at);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth()).padStart(2, '0')}`;
        const monthName = months[date.getMonth()];
        
        const existing = monthMap.get(monthKey) || { demurrage: 0, recovered: 0, month: monthName };
        existing.demurrage += c.expected_cost_usd || 0;
        if (c.dispute_status === 'won') {
          existing.recovered += c.recovered_amount_usd || 0;
        }
        monthMap.set(monthKey, { ...existing, month: monthName } as any);
      }
    });

    // Sort by key and take last 6 months
    return Array.from(monthMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6)
      .map(([key, data]) => ({
        month: (data as any).month || key,
        demurrage: data.demurrage,
        recovered: data.recovered
      }));
  }, [containers]);

  const formatCurrency = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(value);

  const handleQuickFilterChange = (filter: QuickFilter) => {
    setQuickFilter(filter);
  };

  const rightActions = (
    <Badge variant="outline" className="text-sm border-[rgba(255,255,255,0.2)] text-muted-foreground">
      <Calendar className="h-3 w-3 mr-1" />
      Dados em tempo real
    </Badge>
  );

  const customCards = (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      <KpiCard
        title="CONTAINERS"
        value={isLoading ? '...' : kpis.totalContainers}
        subtitle="Total monitorados"
        icon={<Package className="h-6 w-6" />}
        variant="default"
        isActive={quickFilter === "containers"}
        onClick={() => handleQuickFilterChange("containers")}
      />
      <KpiCard
        title="DEMURRAGE TOTAL"
        value={isLoading ? '...' : formatCurrency(kpis.totalDemurrage)}
        subtitle="Valor acumulado"
        icon={<DollarSign className="h-6 w-6" />}
        variant="default"
        isActive={quickFilter === "demurrage"}
        onClick={() => handleQuickFilterChange("demurrage")}
      />
      <KpiCard
        title="RECUPERADO"
        value={isLoading ? '...' : formatCurrency(kpis.recovered)}
        subtitle="Em disputas ganhas"
        icon={<TrendingUp className="h-6 w-6" />}
        variant="success"
        isActive={quickFilter === "recovered"}
        onClick={() => handleQuickFilterChange("recovered")}
      />
      <KpiCard
        title="TAXA SUCESSO"
        value={isLoading ? '...' : `${kpis.successRate}%`}
        subtitle={`${kpis.disputesWon}W / ${kpis.disputesLost}L`}
        icon={<Target className="h-6 w-6" />}
        variant="info"
        isActive={quickFilter === "success"}
        onClick={() => handleQuickFilterChange("success")}
      />
      <KpiCard
        title="MÉDIA DIAS EXC."
        value={isLoading ? '...' : kpis.avgDaysExceeded}
        subtitle="Dias excedidos"
        icon={<Clock className="h-6 w-6" />}
        variant="critical"
        isActive={quickFilter === "avg_days"}
        onClick={() => handleQuickFilterChange("avg_days")}
      />
    </div>
  );

  if (isLoading) {
    return (
      <DemurrageLayout rightActions={rightActions} customCards={customCards}>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#ffc800]" />
        </div>
      </DemurrageLayout>
    );
  }

  return (
    <DemurrageLayout
      rightActions={rightActions}
      customCards={customCards}
    >
      <div className="space-y-4">
        {/* Charts Row 1 */}
        <Card className="bg-[rgba(5,6,18,0.85)] border-[rgba(255,255,255,0.1)]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-foreground text-base">
              <TrendingUp className="h-5 w-5 text-[#ffc800]" />
              Evolução Mensal
            </CardTitle>
            <CardDescription>Demurrage vs Recuperado</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {monthlyTrend.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  Sem dados históricos disponíveis
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlyTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="month" stroke="rgba(255,255,255,0.5)" />
                    <YAxis tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} stroke="rgba(255,255,255,0.5)" />
                    <Tooltip 
                      formatter={(value: number) => formatCurrency(value)} 
                      contentStyle={{ backgroundColor: 'rgba(5,6,18,0.95)', border: '1px solid rgba(255,255,255,0.1)' }}
                      labelStyle={{ color: 'white' }}
                    />
                    <Legend />
                    <Area type="monotone" dataKey="demurrage" name="Demurrage" stroke="#ffc800" fill="#ffc800" fillOpacity={0.3} />
                    <Area type="monotone" dataKey="recovered" name="Recuperado" stroke="#22c55e" fill="#22c55e" fillOpacity={0.3} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Charts Row 2 */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Status Distribution */}
          <Card className="bg-[rgba(5,6,18,0.85)] border-[rgba(255,255,255,0.1)]">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-foreground text-base">
                Status dos Containers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[280px]">
                {statusDistribution.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    Sem containers para exibir
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        {statusDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: 'rgba(5,6,18,0.95)', border: '1px solid rgba(255,255,255,0.1)' }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Top Clients */}
          <Card className="bg-[rgba(5,6,18,0.85)] border-[rgba(255,255,255,0.1)]">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-foreground text-base">
                <Users className="h-5 w-5 text-[#ffc800]" />
                Top Clientes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[280px]">
                {topClients.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    Sem dados de clientes
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topClients} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                      <XAxis type="number" tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} stroke="rgba(255,255,255,0.5)" />
                      <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.5)" />
                      <Tooltip 
                        formatter={(value: number) => formatCurrency(value)}
                        contentStyle={{ backgroundColor: 'rgba(5,6,18,0.95)', border: '1px solid rgba(255,255,255,0.1)' }}
                        labelStyle={{ color: 'white' }}
                      />
                      <Bar dataKey="demurrage" fill="#ffc800" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Top Armadores */}
        <Card className="bg-[rgba(5,6,18,0.85)] border-[rgba(255,255,255,0.1)]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-foreground text-base">
              <Ship className="h-5 w-5 text-[#ffc800]" />
              Top Armadores
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {topArmadores.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  Sem dados de armadores
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topArmadores}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.5)" />
                    <YAxis tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} stroke="rgba(255,255,255,0.5)" />
                    <Tooltip 
                      formatter={(value: number) => formatCurrency(value)}
                      contentStyle={{ backgroundColor: 'rgba(5,6,18,0.95)', border: '1px solid rgba(255,255,255,0.1)' }}
                      labelStyle={{ color: 'white' }}
                    />
                    <Bar dataKey="demurrage" fill="#ffc800" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </DemurrageLayout>
  );
}
