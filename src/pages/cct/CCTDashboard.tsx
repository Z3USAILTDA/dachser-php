import { useState, useMemo, useCallback, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, LayoutDashboard, BarChart3, AlertTriangle, Bell, Settings, HelpCircle, LogOut, Radio, RefreshCw, Database, Package, AlertCircle, Clock, Plane, List, CheckCircle2, Eye, CheckCircle } from "lucide-react";
import dachserBg from "@/assets/dachser-background.jpg";

// Components
import { MetricCard } from "@/components/cct/MetricCard";
import { ProcessosTable, MetricFilterType } from "@/components/cct/ProcessosTable";
import { AssignAnalistaDialog } from "@/components/cct/AssignAnalistaDialog";
import { NovoShipmentDialog } from "@/components/cct/NovoShipmentDialog";

// Hooks
import { useProfiles, useProcessosCCT, useExcecoes } from "@/hooks/useCCTData";

// Types
import { ProcessoCCT } from "@/types/cct";

// Tab content imports - lazy loaded inline
import AnalyticsContent from "./tabs/AnalyticsTab";
import ExcecoesContent from "./tabs/ExcecoesTab";
import RegrasContent from "./tabs/RegrasTab";
import ConsoleContent from "./tabs/ConsoleTab";

type TabType = "dashboard" | "analytics" | "excecoes" | "regras" | "console";

interface NavTab {
  id: TabType;
  label: string;
  icon: React.ElementType;
}

const navTabs: NavTab[] = [
  { id: "dashboard", label: "Dashboard", icon: List },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "excecoes", label: "Exceções", icon: AlertTriangle },
  { id: "regras", label: "Regras", icon: Bell },
  { id: "console", label: "Console", icon: Settings },
];

export default function CCTDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>("dashboard");
  
  const storedUser = localStorage.getItem("user");
  const user = storedUser ? JSON.parse(storedUser) : null;
  
  // Dashboard data
  const {
    data: processos = [],
    isLoading,
    refetch,
    isRefetching,
    error
  } = useProcessosCCT();
  
  const { data: profiles = [] } = useProfiles();
  const { data: excecoes = [] } = useExcecoes();
  
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedProcesso, setSelectedProcesso] = useState<ProcessoCCT | null>(null);
  const [metricFilter, setMetricFilter] = useState<MetricFilterType>(null);
  
  const metrics = useMemo(() => {
    const total = processos.length;
    const emTransito = processos.filter(p => p.status_atual?.status_cct_oficial === "AGUARDANDO_MANIFESTACAO").length;
    const alerta = processos.filter(p => p.status_atual?.sla_status === "ALERTA").length;
    const critico = processos.filter(p => p.status_atual?.sla_status === "CRITICO").length;
    const eventos24h = processos.reduce((acc, p) => {
      const recent = p.eventos.filter(e => {
        const eventDate = new Date(e.data_hora_evento);
        const now = new Date();
        return now.getTime() - eventDate.getTime() < 24 * 60 * 60 * 1000;
      });
      return acc + recent.length;
    }, 0);
    return { total, emTransito, alerta, critico, eventos24h };
  }, [processos]);

  const excecoesStats = useMemo(() => ({
    abertas: excecoes.filter(e => e.status_excecao === "ABERTA").length,
    emAnalise: excecoes.filter(e => e.status_excecao === "EM_ANALISE").length,
    resolvidas: excecoes.filter(e => e.status_excecao === "RESOLVIDA").length,
    total: excecoes.length,
  }), [excecoes]);
  
  const handleOpenAssignDialog = useCallback((processo: ProcessoCCT) => {
    setSelectedProcesso(processo);
    setAssignDialogOpen(true);
  }, []);
  
  const handleMetricClick = (filter: MetricFilterType) => {
    setMetricFilter(prev => prev === filter ? null : filter);
  };

  const handleLogout = () => {
    localStorage.removeItem("user");
    navigate("/login");
  };

  const getSubtitle = () => {
    switch (activeTab) {
      case "analytics": return "Analytics CCT — Indicadores e Performance";
      case "excecoes": return "Gestão de Exceções — Monitoramento e Tratativas";
      case "regras": return "Regras de Notificação — Sistema Hermes";
      case "console": return "Console Técnico — Sistema Hermes";
      default: return "Intelligent Logistics — Robô CCT";
    }
  };

  return (
    <div className="min-h-screen relative overflow-x-hidden">
      {/* Background with image and gradient overlay */}
      <div className="fixed inset-0 z-0">
        <div 
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${dachserBg})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div 
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(120deg, rgba(4, 17, 45, 0.92), rgba(26, 93, 173, 0.55))',
          }}
        />
        
        {/* Radial gradient overlay */}
        <div 
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse at 20% 20%, rgba(245, 184, 67, 0.12) 0%, transparent 50%),
              radial-gradient(ellipse at 80% 80%, rgba(245, 184, 67, 0.08) 0%, transparent 50%)
            `
          }}
        />
        
        {/* Animated Lines */}
        <div className="absolute inset-0 opacity-20">
          {[...Array(6)].map((_, i) => (
            <div
              key={`line-${i}`}
              className="absolute h-full w-px bg-gradient-to-b from-primary/70 to-primary/10"
              style={{
                left: `${15 + i * 14}%`,
                transform: `skewX(${-20 + i * 8}deg)`,
              }}
            />
          ))}
        </div>

        {/* Floating Particles */}
        {[...Array(20)].map((_, i) => (
          <div
            key={`particle-${i}`}
            className="absolute w-1 h-1 rounded-full bg-primary/40 animate-float"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 5}s`,
              animationDuration: `${4 + Math.random() * 4}s`,
            }}
          />
        ))}
      </div>

      {/* Top Header Bar */}
      <div className="relative z-10 max-w-[95%] mx-auto px-2 pt-5 pb-4 flex items-center justify-between">
        {/* Left - Back + Header */}
        <div className="flex items-center gap-[18px]">
          <button
            onClick={() => navigate("/dashboard")}
            className="w-8 h-8 rounded-full border border-white/12 bg-[rgba(5,6,18,0.9)] text-white/80 flex items-center justify-center backdrop-blur-sm hover:bg-[rgba(5,6,18,1)] hover:text-white transition-all"
          >
            <ArrowLeft size={16} />
          </button>

          <header>
            <h1 className="text-[1.6rem] tracking-[0.24em] uppercase text-[#f5f5f5]">DACHSER</h1>
            <p className="text-[0.9rem] text-[#aaaaaa] mt-0.5">{getSubtitle()}</p>
            <div className="flex gap-1.5 mt-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#ffc800] shadow-[0_0_10px_rgba(255,200,0,.9)]" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#ffc800] shadow-[0_0_10px_rgba(255,200,0,.9)]" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#ffc800] shadow-[0_0_10px_rgba(255,200,0,.9)]" />
            </div>
          </header>
        </div>

        {/* Right - Actions and user */}
        <div className="flex items-center gap-2.5 text-[0.85rem]">
          <button 
            onClick={() => refetch()} 
            disabled={isRefetching} 
            className="flex items-center gap-2 px-4 py-2 rounded-full border border-[rgba(255,255,255,.25)] bg-[rgba(0,0,0,.7)] text-[#aaaaaa] hover:text-white hover:bg-[rgba(0,0,0,.9)] transition disabled:opacity-50 text-[0.8rem]"
          >
            <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
            Atualizar
          </button>
          
          {activeTab === "dashboard" && <NovoShipmentDialog />}
          
          <button
            onClick={() => navigate("/air/cct/manual")}
            className="w-8 h-8 rounded-full border border-[rgba(255,255,255,.25)] flex items-center justify-center bg-[rgba(0,0,0,.7)] text-[#aaaaaa] hover:text-[#ffc800] hover:bg-[rgba(0,0,0,.9)] transition"
            title="Ajuda"
          >
            <HelpCircle size={16} />
          </button>

          {user && (
            <div className="px-[14px] py-1.5 rounded-full bg-[rgba(0,0,0,.70)] border border-[rgba(255,255,255,.18)] text-[#aaaaaa] max-w-[180px] truncate">
              @{user.username || user.email}
            </div>
          )}

          <div
            className="w-8 h-8 rounded-full border border-[rgba(255,255,255,.25)] flex items-center justify-center bg-[rgba(0,0,0,.7)] text-[#ffc800]"
            title="CRONOS CCT"
          >
            <Radio size={16} />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="relative z-10 max-w-[95%] mx-auto px-2 pb-8">
        <div className="space-y-6">
          {error && (
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-3 flex items-center gap-2">
              <Database className="h-5 w-5 text-rose-400" />
              <span className="text-sm text-rose-400">Erro ao conectar: {error.message}</span>
            </div>
          )}
          
          {/* Metric Cards - Show on Dashboard tab */}
          {activeTab === "dashboard" && (
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
                  <MetricCard title="Total Monitorados" value={metrics.total} icon={Package} subtitle="Processos ativos" onClick={() => handleMetricClick("total")} active={metricFilter === "total"} />
                  <MetricCard title="Em Alerta" value={metrics.alerta} icon={AlertTriangle} variant="warning" subtitle="Atenção necessária" onClick={() => handleMetricClick("alerta")} active={metricFilter === "alerta"} />
                  <MetricCard title="Críticos" value={metrics.critico} icon={AlertCircle} variant="critical" subtitle="Ação imediata" onClick={() => handleMetricClick("critico")} active={metricFilter === "critico"} />
                  <MetricCard title="Eventos 24h" value={metrics.eventos24h} icon={Clock} variant="success" subtitle="Últimas 24 horas" onClick={() => handleMetricClick("eventos24h")} active={metricFilter === "eventos24h"} />
                </>
              )}
            </div>
          )}

          {/* Analytics KPI Cards - Show on Analytics tab */}
          {activeTab === "analytics" && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              {isLoading ? (
                <>
                  <div className="h-28 rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] animate-pulse" />
                  <div className="h-28 rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] animate-pulse" />
                  <div className="h-28 rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] animate-pulse" />
                  <div className="h-28 rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] animate-pulse" />
                  <div className="h-28 rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] animate-pulse" />
                </>
              ) : (
                <>
                  <MetricCard title="Processos Ativos" value={metrics.total} icon={Package} subtitle="Total monitorados" />
                  <MetricCard title="SLA OK" value={`${metrics.total > 0 ? Math.round(((metrics.total - metrics.alerta - metrics.critico) / metrics.total) * 100) : 0}%`} icon={CheckCircle2} variant="success" subtitle="Dentro do prazo" />
                  <MetricCard title="Em Alerta" value={metrics.alerta} icon={AlertTriangle} variant="warning" subtitle="Atenção necessária" />
                  <MetricCard title="Críticos" value={metrics.critico} icon={AlertCircle} variant="critical" subtitle="Ação imediata" />
                  <MetricCard title="Tempo Médio" value="2.3d" icon={Clock} subtitle="Transit time" />
                </>
              )}
            </div>
          )}

          {/* Exceções KPI Cards - Show on Exceções tab */}
          {activeTab === "excecoes" && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard title="Abertas" value={excecoesStats.abertas} icon={AlertTriangle} variant="critical" subtitle="Pendentes de ação" />
              <MetricCard title="Em Análise" value={excecoesStats.emAnalise} icon={Eye} variant="warning" subtitle="Sendo tratadas" />
              <MetricCard title="Resolvidas" value={excecoesStats.resolvidas} icon={CheckCircle} variant="success" subtitle="Concluídas" />
              <MetricCard title="Total" value={excecoesStats.total} icon={AlertCircle} subtitle="Todas exceções" />
            </div>
          )}

          {/* Navigation Tabs - Below cards, above table */}
          <nav className="flex items-center gap-1 px-2 py-1.5 rounded-full bg-[rgba(5,6,18,0.85)] border border-white/10 backdrop-blur-sm w-fit">
            {navTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    flex items-center gap-2 px-4 py-2 rounded-full text-[0.8rem] font-medium transition-all duration-200
                    ${isActive 
                      ? 'bg-[rgba(255,200,0,0.15)] text-[#ffc800] border border-[#ffc800]/40 shadow-[0_0_12px_rgba(255,200,0,0.3)]' 
                      : 'text-[#aaaaaa] hover:text-white hover:bg-white/5'
                    }
                  `}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>

          {/* Tab Content */}
          {activeTab === "dashboard" && (
            <>
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

              {/* Table */}
              {isLoading ? (
                <div className="h-96 rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] animate-pulse" />
              ) : (
                <ProcessosTable processos={processos} onAssignAnalista={handleOpenAssignDialog} metricFilter={metricFilter} />
              )}
            </>
          )}

          {activeTab === "analytics" && <AnalyticsContent processos={processos} isLoading={isLoading} refetch={refetch} isRefetching={isRefetching} />}
          {activeTab === "excecoes" && <ExcecoesContent />}
          {activeTab === "regras" && <RegrasContent />}
          {activeTab === "console" && <ConsoleContent />}
        </div>

        {/* Assign Analyst Dialog */}
        <AssignAnalistaDialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen} processo={selectedProcesso} />
      </main>
    </div>
  );
}
