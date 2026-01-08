import { PageLayout } from "@/components/layout/PageLayout";
import { KpiCard } from "@/components/demurrage/KpiCard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  BarChart3, 
  DollarSign, 
  Package, 
  TrendingUp,
  TrendingDown,
  Users,
  Ship,
  Target,
  Calendar
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

export default function DemurrageAnalytics() {
  const formatCurrency = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(value);

  return (
    <PageLayout 
      title="DACHSER" 
      subtitle="Demurrage / Detention — Analytics"
      pageIcon={BarChart3}
    >
      <div className="space-y-6">
        {/* Period Badge */}
        <div className="flex justify-end">
          <Badge variant="outline" className="text-sm">
            <Calendar className="h-3 w-3 mr-1" />
            Últimos 6 meses
          </Badge>
        </div>

        {/* KPIs */}
        <div className="grid gap-4 md:grid-cols-5">
          <KpiCard
            title="CONTAINERS"
            value={156}
            subtitle="Total monitorados"
            icon={<Package className="h-6 w-6" />}
            variant="primary"
          />
          <KpiCard
            title="DEMURRAGE TOTAL"
            value={formatCurrency(98800)}
            subtitle="Valor acumulado"
            icon={<DollarSign className="h-6 w-6" />}
            variant="warning"
          />
          <KpiCard
            title="RECUPERADO"
            value={formatCurrency(27900)}
            subtitle="Em disputas ganhas"
            icon={<TrendingUp className="h-6 w-6" />}
            variant="success"
          />
          <KpiCard
            title="TAXA SUCESSO"
            value="68%"
            subtitle="17W / 8L"
            icon={<Target className="h-6 w-6" />}
            variant="info"
          />
          <KpiCard
            title="MÉDIA DIAS EXC."
            value="4.2"
            subtitle="Dias excedidos"
            icon={<TrendingDown className="h-6 w-6" />}
            variant="danger"
          />
        </div>

        {/* Charts Row 1 */}
        <Card className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <TrendingUp className="h-5 w-5 text-primary" />
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
                    contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)' }}
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
        <div className="grid gap-6 md:grid-cols-2">
          {/* Status Distribution */}
          <Card className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Package className="h-5 w-5 text-primary" />
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
                    <Tooltip contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Top Clients */}
          <Card className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Users className="h-5 w-5 text-primary" />
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
                      contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)' }}
                    />
                    <Bar dataKey="demurrage" fill="#ffc800" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Top Armadores */}
        <Card className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Ship className="h-5 w-5 text-primary" />
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
                    contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)' }}
                  />
                  <Bar dataKey="demurrage" fill="#ffc800" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
