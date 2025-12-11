import { useState, useMemo, useCallback } from "react";
import { PageLayout } from "@/components/cct/PageLayout";
import { MetricCard } from "@/components/cct/MetricCard";
import { ProcessosTable, MetricFilterType } from "@/components/cct/ProcessosTable";
import { AssignAnalistaDialog } from "@/components/cct/AssignAnalistaDialog";
import { NovoShipmentDialog } from "@/components/cct/NovoShipmentDialog";
import { useProfiles, useProcessosCCT } from "@/hooks/useCCTData";
import { ProcessoCCT } from "@/types/cct";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Database as DatabaseIcon, Plane } from "lucide-react";
import { 
  Package, 
  AlertTriangle, 
  AlertCircle, 
  Clock,
  RefreshCw,
} from "lucide-react";

export default function CCTDashboard() {
  const { data: processos = [], isLoading, refetch, isRefetching, error } = useProcessosCCT();
  const { data: profiles = [] } = useProfiles();
  
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedProcesso, setSelectedProcesso] = useState<ProcessoCCT | null>(null);
  const [metricFilter, setMetricFilter] = useState<MetricFilterType>(null);

  const metrics = useMemo(() => {
    const total = processos.length;
    const emTransito = processos.filter((p) => p.status_atual?.status_cct_oficial === "AGUARDANDO_MANIFESTACAO").length;
    const alerta = processos.filter((p) => p.status_atual?.sla_status === "ALERTA").length;
    const critico = processos.filter((p) => p.status_atual?.sla_status === "CRITICO").length;
    const eventos24h = processos.reduce((acc, p) => {
      const recent = p.eventos.filter((e) => {
        const eventDate = new Date(e.data_hora_evento);
        const now = new Date();
        return now.getTime() - eventDate.getTime() < 24 * 60 * 60 * 1000;
      });
      return acc + recent.length;
    }, 0);
    return { total, emTransito, alerta, critico, eventos24h };
  }, [processos]);

  const handleOpenAssignDialog = useCallback((processo: ProcessoCCT) => {
    setSelectedProcesso(processo);
    setAssignDialogOpen(true);
  }, []);

  const handleMetricClick = (filter: MetricFilterType) => {
    setMetricFilter(prev => prev === filter ? null : filter);
  };

  return (
    <PageLayout
      title="DACHSER"
      subtitle="CRONOS CCT — Monitoramento de Carga Aérea"
      showBack={false}
      headerActions={
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/20 rounded-full border border-primary/30">
            <DatabaseIcon className="h-4 w-4 text-primary" />
            <span className="text-xs text-primary font-medium">Supabase</span>
          </div>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="border-border text-muted-foreground hover:bg-muted/50 rounded-full px-4"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <NovoShipmentDialog />
        </div>
      }
    >
      <div className="space-y-6">
        {error && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 flex items-center gap-2">
            <DatabaseIcon className="h-5 w-5 text-destructive" />
            <span className="text-sm text-destructive">Erro ao conectar: {error.message}</span>
          </div>
        )}
        
        {/* Metric Cards */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {isLoading ? (
            <>
              <Skeleton className="h-28 bg-card/40" />
              <Skeleton className="h-28 bg-card/40" />
              <Skeleton className="h-28 bg-card/40" />
              <Skeleton className="h-28 bg-card/40" />
            </>
          ) : (
            <>
              <MetricCard
                title="Total Monitorados"
                value={metrics.total}
                icon={Package}
                subtitle="Processos ativos"
                onClick={() => handleMetricClick("total")}
                active={metricFilter === "total"}
              />
              <MetricCard
                title="Em Alerta"
                value={metrics.alerta}
                icon={AlertTriangle}
                variant="warning"
                subtitle="Atenção necessária"
                onClick={() => handleMetricClick("alerta")}
                active={metricFilter === "alerta"}
              />
              <MetricCard
                title="Críticos"
                value={metrics.critico}
                icon={AlertCircle}
                variant="critical"
                subtitle="Ação imediata"
                onClick={() => handleMetricClick("critico")}
                active={metricFilter === "critico"}
              />
              <MetricCard
                title="Eventos 24h"
                value={metrics.eventos24h}
                icon={Clock}
                variant="success"
                subtitle="Últimas 24 horas"
                onClick={() => handleMetricClick("eventos24h")}
                active={metricFilter === "eventos24h"}
              />
            </>
          )}
        </div>

        {/* Header with counts */}
        <div className="flex items-center gap-3">
          <Plane className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Monitoramento CCT</h3>
          {metricFilter && (
            <Badge 
              variant="outline" 
              className="bg-primary/10 text-primary border-primary/30 font-mono cursor-pointer"
              onClick={() => setMetricFilter(null)}
            >
              Filtro ativo: {metricFilter === "total" ? "Todos" : metricFilter === "alerta" ? "Em Alerta" : metricFilter === "critico" ? "Críticos" : "Eventos 24h"} ✕
            </Badge>
          )}
          {metrics.emTransito > 0 && !metricFilter && (
            <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30 font-mono">
              {metrics.emTransito} aguardando manifestação
            </Badge>
          )}
        </div>

        {/* Unified Table */}
        {isLoading ? (
          <Skeleton className="h-96 bg-card/40" />
        ) : (
          <ProcessosTable 
            processos={processos}
            onAssignAnalista={handleOpenAssignDialog}
            metricFilter={metricFilter}
          />
        )}
      </div>

      {/* Assign Analyst Dialog */}
      <AssignAnalistaDialog
        open={assignDialogOpen}
        onOpenChange={setAssignDialogOpen}
        processo={selectedProcesso}
      />
    </PageLayout>
  );
}
