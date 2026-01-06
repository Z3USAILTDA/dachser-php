import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DraftStats, TrackingData, CombinedMBLData } from "@/types/draft";
import { TrackingStatusBadge } from "./TrackingStatusBadge";
import { 
  Database, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  XCircle,
  RefreshCw,
  Loader2
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface DraftSyncDashboardProps {
  stats: DraftStats;
  combinedData: CombinedMBLData[];
  onSyncPending: () => Promise<void>;
  isLoading?: boolean;
}

const COLORS = {
  completed: '#22c55e',
  inProgress: '#3b82f6',
  pending: '#eab308',
  error: '#ef4444',
  neverConsulted: '#6b7280'
};

export const DraftSyncDashboard = ({ 
  stats, 
  combinedData,
  onSyncPending,
  isLoading 
}: DraftSyncDashboardProps) => {
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSyncPending = async () => {
    setIsSyncing(true);
    try {
      await onSyncPending();
    } finally {
      setIsSyncing(false);
    }
  };

  const pieData = [
    { name: 'Completed', value: stats.completed, color: COLORS.completed },
    { name: 'In Progress', value: stats.inProgress, color: COLORS.inProgress },
    { name: 'Pending', value: stats.pending, color: COLORS.pending },
    { name: 'Errors', value: stats.error, color: COLORS.error },
    { name: 'Nunca Consultado', value: stats.neverConsulted, color: COLORS.neverConsulted }
  ].filter(item => item.value > 0);

  // Get last 10 consulted MBLs
  const recentConsultations = [...combinedData]
    .filter(item => item.lastConsulted)
    .sort((a, b) => {
      const dateA = a.lastConsulted ? new Date(a.lastConsulted).getTime() : 0;
      const dateB = b.lastConsulted ? new Date(b.lastConsulted).getTime() : 0;
      return dateB - dateA;
    })
    .slice(0, 10);

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return "N/A";
    try {
      return format(parseISO(dateStr), "dd/MM HH:mm", { locale: ptBR });
    } catch {
      return dateStr;
    }
  };

  const pendingCount = stats.pending + stats.neverConsulted;

  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card/50 border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-500/20 rounded-lg">
                <Database className="h-6 w-6 text-blue-400" />
              </div>
              <div>
                <div className="text-2xl font-bold">{stats.total}</div>
                <div className="text-sm text-muted-foreground">Total MBLs</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-green-500/20 rounded-lg">
                <CheckCircle2 className="h-6 w-6 text-green-400" />
              </div>
              <div>
                <div className="text-2xl font-bold">{stats.completed}</div>
                <div className="text-sm text-muted-foreground">Completed</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-yellow-500/20 rounded-lg">
                <Clock className="h-6 w-6 text-yellow-400" />
              </div>
              <div>
                <div className="text-2xl font-bold">{pendingCount}</div>
                <div className="text-sm text-muted-foreground">Pendentes</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-red-500/20 rounded-lg">
                <XCircle className="h-6 w-6 text-red-400" />
              </div>
              <div>
                <div className="text-2xl font-bold">{stats.error}</div>
                <div className="text-sm text-muted-foreground">Erros</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Chart and Recent Consultations */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Pie Chart */}
        <Card className="bg-card/50 border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Distribuição de Status</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.total > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number) => [
                      `${value} (${Math.round((value / stats.total) * 100)}%)`,
                      ''
                    ]}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Legend 
                    verticalAlign="bottom"
                    formatter={(value, entry: any) => (
                      <span className="text-muted-foreground text-sm">
                        {value} ({entry.payload.value})
                      </span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                Nenhum dado disponível
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Consultations */}
        <Card className="bg-card/50 border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Últimas Consultas</CardTitle>
          </CardHeader>
          <CardContent>
            {recentConsultations.length > 0 ? (
              <div className="space-y-2 max-h-[250px] overflow-y-auto">
                {recentConsultations.map((item, index) => (
                  <div 
                    key={index}
                    className="flex items-center justify-between p-2 bg-muted/30 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-[70px]">
                        {formatDate(item.lastConsulted)}
                      </span>
                      <span className="font-mono text-sm truncate max-w-[180px]">
                        {item.mbl_id}
                      </span>
                    </div>
                    <TrackingStatusBadge status={item.status} showIcon={false} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                Nenhuma consulta realizada
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sync Pending Button */}
      <Card className="bg-card/50 border-border">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium">Sincronizar Pendentes</h4>
              <p className="text-sm text-muted-foreground">
                {pendingCount} MBLs aguardando consulta
              </p>
            </div>
            <Button 
              onClick={handleSyncPending}
              disabled={isSyncing || isLoading || pendingCount === 0}
            >
              {isSyncing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Sincronizar Pendentes
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
