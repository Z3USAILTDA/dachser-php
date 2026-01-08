import { useState } from "react";
import { DemurrageLayout } from "@/components/demurrage/DemurrageLayout";
import { KpiCard } from "@/components/demurrage/KpiCard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  TrendingUp,
  TrendingDown,
  Users,
  Ship,
  Calendar,
  Package,
  DollarSign,
  Target,
  Clock
} from "lucide-react";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, AreaChart, Area, Legend 
} from "recharts";

// Mock data
const monthlyTrend = [
  { month: 'Ago', demurrage: 12500, recovered: 3500 },
  { month: 'Set', demurrage: 15800, recovered: 4200 },
  { month: 'Out', demurrage: 18200, recovered: 5100 },
  { month: 'Nov', demurrage: 14500, recovered: 3800 },
  { month: 'Dez', demurrage: 21000, recovered: 6500 },
  { month: 'Jan', demurrage: 16800, recovered: 4800 },
];

const statusDistribution = [
  { name: 'OK', value: 45, color: '#22c55e' },
  { name: 'Risco', value: 25, color: '#eab308' },
  { name: 'Crítico', value: 15, color: '#f97316' },
  { name: 'Excedido', value: 15, color: '#ef4444' },
];

const topClients = [
  { name: 'CLIENTE ABC', demurrage: 12500 },
  { name: 'CLIENTE XYZ', demurrage: 9800 },
  { name: 'CLIENTE 123', demurrage: 7200 },
  { name: 'CLIENTE DEF', demurrage: 5600 },
  { name: 'CLIENTE GHI', demurrage: 4100 },
];

const topArmadores = [
  { name: 'MSC', demurrage: 18500 },
  { name: 'MAERSK', demurrage: 14200 },
  { name: 'HAPAG', demurrage: 11800 },
  { name: 'CMA CGM', demurrage: 8900 },
  { name: 'ONE', demurrage: 6200 },
];

type QuickFilter = "all" | "containers" | "demurrage" | "recovered" | "success" | "avg_days";

export default function DemurrageAnalytics() {
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");

  const formatCurrency = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(value);

  const handleQuickFilterChange = (filter: QuickFilter) => {
    setQuickFilter(filter);
  };

  const rightActions = (
    <Badge variant="outline" className="text-sm border-[rgba(255,255,255,0.2)] text-muted-foreground">
      <Calendar className="h-3 w-3 mr-1" />
      Últimos 6 meses
    </Badge>
  );

  const customCards = (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      <KpiCard
        title="CONTAINERS"
        value={202}
        subtitle="Total monitorados"
        icon={<Package className="h-6 w-6" />}
        variant="default"
        isActive={quickFilter === "containers"}
        onClick={() => handleQuickFilterChange("containers")}
      />
      <KpiCard
        title="DEMURRAGE TOTAL"
        value="$76,220"
        subtitle="Valor acumulado"
        icon={<DollarSign className="h-6 w-6" />}
        variant="default"
        isActive={quickFilter === "demurrage"}
        onClick={() => handleQuickFilterChange("demurrage")}
      />
      <KpiCard
        title="RECUPERADO"
        value="$7,900"
        subtitle="Em disputas ganhas"
        icon={<TrendingUp className="h-6 w-6" />}
        variant="success"
        isActive={quickFilter === "recovered"}
        onClick={() => handleQuickFilterChange("recovered")}
      />
      <KpiCard
        title="TAXA SUCESSO"
        value="67%"
        subtitle="2W / 1L"
        icon={<Target className="h-6 w-6" />}
        variant="info"
        isActive={quickFilter === "success"}
        onClick={() => handleQuickFilterChange("success")}
      />
      <KpiCard
        title="MÉDIA DIAS EXC."
        value="2.6"
        subtitle="Dias excedidos"
        icon={<Clock className="h-6 w-6" />}
        variant="critical"
        isActive={quickFilter === "avg_days"}
        onClick={() => handleQuickFilterChange("avg_days")}
      />
    </div>
  );

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
            </div>
          </CardContent>
        </Card>
      </div>
    </DemurrageLayout>
  );
}
