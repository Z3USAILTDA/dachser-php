import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DraftStats, CombinedMBLData } from "@/types/draft";
import { TrackingStatusBadge } from "./TrackingStatusBadge";
import { BookingInfoCard } from "./BookingInfoCard";
import { DraftEventTimeline } from "./DraftEventTimeline";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Database, 
  CheckCircle2, 
  Clock, 
  XCircle,
  RefreshCw,
  Loader2,
  Play,
  Cog,
  Package
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
  processing: '#a855f7',
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
  const [isSyncingMariaDB, setIsSyncingMariaDB] = useState(false);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const [selectedMBL, setSelectedMBL] = useState<CombinedMBLData | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsData, setDetailsData] = useState<any>(null);

  const handleSyncPending = async () => {
    setIsSyncing(true);
    try {
      await onSyncPending();
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncMariaDB = async () => {
    setIsSyncingMariaDB(true);
    try {
      const { data, error } = await supabase.functions.invoke('draft-fetch-mariadb');
      if (error) throw error;
      toast.success(`MariaDB sincronizado: ${data?.count || 0} registros`);
      await onSyncPending();
    } catch (err: any) {
      console.error('Erro ao sincronizar MariaDB:', err);
      toast.error('Erro ao sincronizar MariaDB');
    } finally {
      setIsSyncingMariaDB(false);
    }
  };

  const handleProcessQueue = async () => {
    setIsProcessingQueue(true);
    try {
      toast.info('Iniciando processamento da fila...');
      await handleSyncPending();
      toast.success('Fila processada');
    } catch (err) {
      toast.error('Erro ao processar fila');
    } finally {
      setIsProcessingQueue(false);
    }
  };

  const handleSelectMBL = async (item: CombinedMBLData) => {
    setSelectedMBL(item);
    setDetailsLoading(true);
    setDetailsData(null);

    try {
      const { data, error } = await supabase.functions.invoke('draft-track-hapag-multi', {
        body: { searchType: 'BL', searchValue: item.mbl_id }
      });

      if (error) throw error;
      setDetailsData(data);
    } catch (err) {
      console.error('Erro ao carregar detalhes:', err);
    } finally {
      setDetailsLoading(false);
    }
  };

  const pieData = [
    { name: 'Completed', value: stats.completed, color: COLORS.completed },
    { name: 'In Progress', value: stats.inProgress, color: COLORS.inProgress },
    { name: 'Pending', value: stats.pending, color: COLORS.pending },
    { name: 'Errors', value: stats.error, color: COLORS.error },
    { name: 'Nunca Consultado', value: stats.neverConsulted, color: COLORS.neverConsulted }
  ].filter(item => item.value > 0);

  // Get queue items (pending and never consulted)
  const queueItems = [...combinedData]
    .filter(item => item.status === 'Nunca Consultado' || item.status === 'Pending' || item.status === 'In Progress')
    .slice(0, 100);

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return "Nunca";
    try {
      return format(parseISO(dateStr), "dd/MM HH:mm", { locale: ptBR });
    } catch {
      return dateStr;
    }
  };

  const pendingCount = stats.pending + stats.neverConsulted;
  const processingCount = stats.inProgress;

  return (
    <div className="space-y-6">
      {/* 5 Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="bg-card border-border border-l-4 border-l-[hsl(var(--info))]">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[hsl(var(--info)/0.2)] rounded-lg">
                <Database className="h-5 w-5 text-[hsl(var(--info))]" />
              </div>
              <div>
                <div className="text-xl font-bold">{stats.total}</div>
                <div className="text-xs text-muted-foreground">Total MBLs</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border border-l-4 border-l-[hsl(var(--warning))]">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[hsl(var(--warning)/0.2)] rounded-lg">
                <Clock className="h-5 w-5 text-[hsl(var(--warning))]" />
              </div>
              <div>
                <div className="text-xl font-bold">{pendingCount}</div>
                <div className="text-xs text-muted-foreground">Pendentes</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border border-l-4 border-l-[hsl(var(--primary))]">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[hsl(var(--primary)/0.2)] rounded-lg">
                <Cog className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="text-xl font-bold">{processingCount}</div>
                <div className="text-xs text-muted-foreground">Processando</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border border-l-4 border-l-[hsl(var(--success))]">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[hsl(var(--success)/0.2)] rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-[hsl(var(--success))]" />
              </div>
              <div>
                <div className="text-xl font-bold">{stats.completed}</div>
                <div className="text-xs text-muted-foreground">Concluídos</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border border-l-4 border-l-[hsl(var(--destructive))]">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[hsl(var(--destructive)/0.2)] rounded-lg">
                <XCircle className="h-5 w-5 text-[hsl(var(--destructive))]" />
              </div>
              <div>
                <div className="text-xl font-bold">{stats.error}</div>
                <div className="text-xs text-muted-foreground">Com Erro</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        <Button
          onClick={handleSyncMariaDB}
          disabled={isSyncingMariaDB || isLoading}
          className="bg-[#ffc800] text-black hover:bg-[#ffdc50] shadow-[0_0_20px_rgba(255,200,0,0.3)]"
        >
          {isSyncingMariaDB ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Database className="h-4 w-4 mr-2" />
          )}
          Sincronizar MariaDB
        </Button>

        <Button
          onClick={handleProcessQueue}
          disabled={isProcessingQueue || isLoading || pendingCount === 0}
          variant="outline"
        >
          {isProcessingQueue ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Play className="h-4 w-4 mr-2" />
          )}
          Processar Fila ({pendingCount})
        </Button>

        <Button
          onClick={handleSyncPending}
          disabled={isSyncing || isLoading}
          variant="outline"
        >
          {isSyncing ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Atualizar
        </Button>
      </div>

      {/* Two Column Layout */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left: Queue Table */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Fila de Sincronização</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border border-border rounded-lg overflow-hidden max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">MBL</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold">Última Sync</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queueItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                        Nenhum item na fila
                      </TableCell>
                    </TableRow>
                  ) : (
                    queueItems.map((item) => (
                      <TableRow 
                        key={item.mbl_id} 
                        className={`cursor-pointer hover:bg-muted/30 ${selectedMBL?.mbl_id === item.mbl_id ? 'bg-[rgba(255,200,0,0.1)]' : ''}`}
                        onClick={() => handleSelectMBL(item)}
                      >
                        <TableCell className="font-mono text-sm">{item.mbl_id}</TableCell>
                        <TableCell>
                          <TrackingStatusBadge status={item.status} showIcon={false} />
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {formatDate(item.lastConsulted)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Right: Details Panel */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">
              {selectedMBL ? `Detalhes: ${selectedMBL.mbl_id}` : 'Detalhes do MBL'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedMBL ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Package className="h-12 w-12 mb-3 opacity-50" />
                <p>Selecione um MBL na fila para ver detalhes</p>
              </div>
            ) : detailsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : detailsData?.success ? (
              <div className="space-y-4 max-h-80 overflow-y-auto">
                <BookingInfoCard 
                  bookingInfo={detailsData.bookingInfo}
                  trackingData={selectedMBL.trackingData}
                />
                
                {detailsData.containers?.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-sm mb-2">
                      Containers ({detailsData.containers.length})
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {detailsData.containers.slice(0, 5).map((c: any, i: number) => (
                        <span 
                          key={i}
                          className="px-2 py-1 bg-muted rounded text-xs font-mono"
                        >
                          {c.equipmentReference}
                        </span>
                      ))}
                      {detailsData.containers.length > 5 && (
                        <span className="px-2 py-1 text-xs text-muted-foreground">
                          +{detailsData.containers.length - 5} mais
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {detailsData.events?.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-sm mb-2">
                      Últimos Eventos ({Math.min(detailsData.events.length, 5)})
                    </h4>
                    <DraftEventTimeline events={detailsData.events.slice(0, 5)} />
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>Nenhum detalhe disponível.</p>
                <p className="text-sm">Consulte o MBL primeiro.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
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
    </div>
  );
};
