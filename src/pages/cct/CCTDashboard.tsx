import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { PageLayout } from "@/components/cct/PageLayout";
import { MetricCard } from "@/components/cct/MetricCard";
import { ProcessosTable, MetricFilterType } from "@/components/cct/ProcessosTable";
import { AssignAnalistaDialog } from "@/components/cct/AssignAnalistaDialog";
import { NovoShipmentDialog } from "@/components/cct/NovoShipmentDialog";
import { useProfiles, useProcessosCCT } from "@/hooks/useCCTData";
import { ProcessoCCT } from "@/types/cct";
import { BookOpen, Plane, Package, AlertTriangle, AlertCircle, Clock, RefreshCw, Database } from "lucide-react";

export default function CCTDashboard() {
  const navigate = useNavigate();
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
      showBack={true}
      headerActions={
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => navigate('/air/cct/manual')}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[rgba(255,200,0,0.15)] border border-[#ffc800]/40 hover:bg-[rgba(255,200,0,0.25)] transition"
          >
            <BookOpen className="h-4 w-4 text-[#ffc800]" />
            <span className="text-xs text-[#ffc800] font-medium">Manual</span>
          </button>
          
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="flex items-center gap-2 px-4 py-2 rounded-full border border-[rgba(255,255,255,.25)] bg-[rgba(0,0,0,.7)] text-[#aaaaaa] hover:text-white hover:bg-[rgba(0,0,0,.9)] transition disabled:opacity-50 text-[0.8rem]"
          >
            <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
            Atualizar
          </button>
          <NovoShipmentDialog />
        </div>
      }
    >
      <div className="space-y-6">
        {error && (
          <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-3 flex items-center gap-2">
            <Database className="h-5 w-5 text-rose-400" />
            <span className="text-sm text-rose-400">Erro ao conectar: {error.message}</span>
          </div>
        )}
        
        {/* Metric Cards */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {isLoading ? (
            <>
              <div className="h-28 rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] animate-pulse" />
              <div className="h-28 rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] animate-pulse" />
              <div className="h-28 rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] animate-pulse" />
              <div className="h-28 rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] animate-pulse" />
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
          <Plane className="h-5 w-5 text-[#ffc800]" />
          <h3 className="text-lg font-semibold text-white">Monitoramento CCT</h3>
          {metricFilter && (
            <span 
              className="px-3 py-1 rounded-full bg-[rgba(255,200,0,0.15)] text-[#ffc800] border border-[#ffc800]/40 text-[0.75rem] font-mono cursor-pointer hover:bg-[rgba(255,200,0,0.25)] transition"
              onClick={() => setMetricFilter(null)}
            >
              Filtro ativo: {metricFilter === "total" ? "Todos" : metricFilter === "alerta" ? "Em Alerta" : metricFilter === "critico" ? "Críticos" : "Eventos 24h"} ✕
            </span>
          )}
          {metrics.emTransito > 0 && !metricFilter && (
            <span className="px-3 py-1 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/40 text-[0.75rem] font-mono">
              {metrics.emTransito} aguardando manifestação
            </span>
          )}
        </div>

        {/* Unified Table */}
        {isLoading ? (
          <div className="h-96 rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] animate-pulse" />
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
