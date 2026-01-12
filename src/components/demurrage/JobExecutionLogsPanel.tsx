import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Activity, RefreshCw, Loader2, CheckCircle2, XCircle, Clock, 
  Zap, Database, Mail, Calculator, AlertTriangle 
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";

interface EdgeLog {
  id: string;
  timestamp: string;
  event_message: string;
  status_code: number;
  method: string;
  function_id: string;
  execution_time_ms: number;
}

const DEMURRAGE_FUNCTIONS = [
  { id: 'demurrage-daily-monitor', label: 'Monitor Diário', icon: Database },
  { id: 'demurrage-recalc', label: 'Recálculo', icon: Calculator },
  { id: 'demurrage-alert-cron', label: 'Alertas Cron', icon: AlertTriangle },
  { id: 'demurrage-send-alert', label: 'Envio Alertas', icon: Mail },
  { id: 'demurrage-auto-invoice', label: 'Auto Faturamento', icon: Zap },
  { id: 'demurrage-health-check', label: 'Health Check', icon: Activity },
];

export function JobExecutionLogsPanel() {
  const [selectedFunction, setSelectedFunction] = useState<string>("all");
  const [daysBack, setDaysBack] = useState<string>("7");

  const { data: logs = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['demurrage_job_logs', selectedFunction, daysBack],
    queryFn: async () => {
      // Use edge function logs endpoint
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: {
          action: 'demurrage_get_job_logs',
          function_filter: selectedFunction !== "all" ? selectedFunction : null,
          days_back: parseInt(daysBack),
        }
      });
      
      if (error) {
        console.error('Error fetching logs:', error);
        return [];
      }

      return (data?.data || []) as EdgeLog[];
    },
    refetchInterval: 30000,
  });

  const getStatusBadge = (statusCode: number) => {
    if (statusCode >= 200 && statusCode < 300) {
      return (
        <Badge className="bg-green-500/10 text-green-400 border-green-500/20">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          {statusCode}
        </Badge>
      );
    } else if (statusCode >= 400) {
      return (
        <Badge className="bg-red-500/10 text-red-400 border-red-500/20">
          <XCircle className="h-3 w-3 mr-1" />
          {statusCode}
        </Badge>
      );
    }
    return (
      <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20">
        <Clock className="h-3 w-3 mr-1" />
        {statusCode}
      </Badge>
    );
  };

  const getFunctionLabel = (functionId: string) => {
    const func = DEMURRAGE_FUNCTIONS.find(f => f.id === functionId);
    return func?.label || functionId;
  };

  const getFunctionIcon = (functionId: string) => {
    const func = DEMURRAGE_FUNCTIONS.find(f => f.id === functionId);
    const Icon = func?.icon || Zap;
    return <Icon className="h-4 w-4 text-[#ffc800]" />;
  };

  const formatTimestamp = (timestamp: string) => {
    try {
      return format(parseISO(timestamp), "dd/MM HH:mm:ss", { locale: ptBR });
    } catch {
      return timestamp;
    }
  };

  const stats = {
    total: logs.length,
    success: logs.filter(l => l.status_code >= 200 && l.status_code < 300).length,
    errors: logs.filter(l => l.status_code >= 400).length,
    avgTime: logs.length > 0 
      ? Math.round(logs.reduce((sum, l) => sum + (l.execution_time_ms || 0), 0) / logs.length)
      : 0,
  };

  return (
    <Card className="bg-[rgba(5,6,18,0.85)] border-[rgba(255,255,255,0.1)]">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Activity className="h-5 w-5 text-[#ffc800]" />
              Logs de Execução
            </CardTitle>
            <CardDescription>
              Histórico de execuções das funções de demurrage
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="bg-transparent border-[rgba(255,255,255,0.2)]"
          >
            {isRefetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex gap-4">
          <div className="flex-1">
            <Select value={selectedFunction} onValueChange={setSelectedFunction}>
              <SelectTrigger className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]">
                <SelectValue placeholder="Filtrar por função" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as funções</SelectItem>
                {DEMURRAGE_FUNCTIONS.map(func => (
                  <SelectItem key={func.id} value={func.id}>
                    {func.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Select value={daysBack} onValueChange={setDaysBack}>
              <SelectTrigger className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)] w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Último dia</SelectItem>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Stats Summary */}
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-[rgba(255,255,255,0.05)] rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-xl font-bold">{stats.total}</p>
          </div>
          <div className="bg-green-500/10 rounded-lg p-3 text-center">
            <p className="text-xs text-green-400">Sucesso</p>
            <p className="text-xl font-bold text-green-400">{stats.success}</p>
          </div>
          <div className="bg-red-500/10 rounded-lg p-3 text-center">
            <p className="text-xs text-red-400">Erros</p>
            <p className="text-xl font-bold text-red-400">{stats.errors}</p>
          </div>
          <div className="bg-blue-500/10 rounded-lg p-3 text-center">
            <p className="text-xs text-blue-400">Tempo Médio</p>
            <p className="text-xl font-bold text-blue-400">{stats.avgTime}ms</p>
          </div>
        </div>

        {/* Logs Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-[#ffc800]" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nenhum log encontrado</p>
            <p className="text-sm mt-2">Os logs aparecerão aqui quando as funções forem executadas</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px]">
            <Table>
              <TableHeader>
                <TableRow className="border-[rgba(255,255,255,0.1)]">
                  <TableHead className="w-[130px]">Data/Hora</TableHead>
                  <TableHead>Função</TableHead>
                  <TableHead className="w-[80px]">Método</TableHead>
                  <TableHead className="w-[80px]">Status</TableHead>
                  <TableHead className="w-[90px] text-right">Tempo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id} className="border-[rgba(255,255,255,0.1)]">
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {formatTimestamp(log.timestamp)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getFunctionIcon(log.function_id)}
                        <span className="text-sm">{getFunctionLabel(log.function_id)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        {log.method}
                      </Badge>
                    </TableCell>
                    <TableCell>{getStatusBadge(log.status_code)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {log.execution_time_ms}ms
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
