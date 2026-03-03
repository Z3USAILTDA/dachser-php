import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw, Activity, Database, Clock, Hash, Loader2, Bug } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { PageLayout } from "@/components/layout/PageLayout";
import { PageCard } from "@/components/layout/PageCard";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { parseDBDate } from "@/utils/timezone";

const DACHSER_ADMIN_USERS = ["ana.tozzo", "danilo.pedroso", "teste.test3"];

interface FirecrawlStats {
  lastUpdate: string | null;
  totalRecords: number;
  recentInserts: number;
  uniqueAwbs: number;
  minutesSinceUpdate: number;
  status: "healthy" | "warning" | "critical";
  fetchedAt: string;
}

type HealthStatus = "green" | "yellow" | "red";

const mapStatus = (s: string): HealthStatus => {
  if (s === "healthy") return "green";
  if (s === "warning") return "yellow";
  return "red";
};

const healthColors: Record<HealthStatus, { dot: string; text: string; label: string }> = {
  green: { dot: "bg-emerald-500", text: "text-emerald-400", label: "Saudável" },
  yellow: { dot: "bg-amber-500", text: "text-amber-400", label: "Atenção" },
  red: { dot: "bg-red-500", text: "text-red-400", label: "Crítico" },
};

const formatRelativeTime = (date: string | null): string => {
  if (!date) return "Nunca";
  const parsed = parseDBDate(date);
  if (!parsed) return "Nunca";
  return formatDistanceToNow(parsed, { addSuffix: true, locale: ptBR });
};

const formatAbsoluteTime = (date: string | null): string => {
  if (!date) return "";
  const parsed = parseDBDate(date);
  if (!parsed) return "";
  return format(parsed, "dd/MM/yyyy HH:mm", { locale: ptBR });
};

const formatNumber = (num: number): string => num.toLocaleString("pt-BR");

export default function FirecrawlMonitor() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<FirecrawlStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("firecrawl-monitor-stats");
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      setStats(data);
    } catch (err: any) {
      console.error("Error fetching firecrawl stats:", err);
      setError(err.message || "Erro ao buscar estatísticas");
      toast.error("Erro ao buscar estatísticas do Firecrawl");
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchStats();
    setIsRefreshing(false);
    toast.success("Dados atualizados");
  };

  const handleTestAlert = async () => {
    try {
      const { data, error: fnError } = await supabase.functions.invoke("firecrawl-monitor-alert", {
        body: { test: true },
      });
      if (fnError) throw fnError;
      toast.success(`Alerta de teste enviado (action: ${data?.action})`);
    } catch (err: any) {
      toast.error("Erro ao enviar alerta de teste");
    }
  };

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (!storedUser) { navigate("/login"); return; }

    const user = JSON.parse(storedUser);
    if (user.is_admin !== 1 || DACHSER_ADMIN_USERS.includes(user.username)) {
      navigate("/dashboard");
      toast.error("Acesso restrito a administradores Z3US");
      return;
    }

    const loadData = async () => {
      setLoading(true);
      await fetchStats();
      setLoading(false);
    };
    loadData();
  }, [navigate]);

  const health: HealthStatus = stats ? mapStatus(stats.status) : "red";

  const rightContent = (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 border-white/10 bg-white/5 hover:bg-white/10 text-xs"
        onClick={handleTestAlert}
      >
        <Bug className="h-3.5 w-3.5" />
        Testar Alerta
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 border-[#ffc800]/30 bg-[#ffc800]/10 hover:bg-[#ffc800]/20 text-[#ffc800] text-xs"
        onClick={handleRefresh}
        disabled={isRefreshing}
      >
        <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
        Atualizar
      </Button>
    </div>
  );

  return (
    <PageLayout
      title="Monitor Firecrawl"
      subtitle="Monitoramento da tabela t_aereo_ws_firecrawl"
      backTo="/dashboard"
      rightContent={rightContent}
    >
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#ffc800]" />
          <span className="ml-3 text-muted-foreground">Carregando dados...</span>
        </div>
      ) : error ? (
        <PageCard>
          <div className="text-center py-10">
            <p className="text-red-400 text-sm">{error}</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={handleRefresh}>
              Tentar novamente
            </Button>
          </div>
        </PageCard>
      ) : stats ? (
        <div className="space-y-6">
          {/* KPI Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <PageCard className="text-center">
              <Database className="h-5 w-5 mx-auto mb-2 text-[#ffc800]" />
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Total Registros</div>
              <div className="text-2xl font-bold text-white mt-1">{formatNumber(stats.totalRecords)}</div>
            </PageCard>
            <PageCard className="text-center">
              <Activity className="h-5 w-5 mx-auto mb-2 text-emerald-400" />
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Inserções 24h</div>
              <div className="text-2xl font-bold text-emerald-400 mt-1">+{formatNumber(stats.recentInserts)}</div>
            </PageCard>
            <PageCard className="text-center">
              <Hash className="h-5 w-5 mx-auto mb-2 text-blue-400" />
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground">AWBs Únicas 24h</div>
              <div className="text-2xl font-bold text-blue-400 mt-1">{formatNumber(stats.uniqueAwbs)}</div>
            </PageCard>
            <PageCard className="text-center">
              <Clock className="h-5 w-5 mx-auto mb-2 text-amber-400" />
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Status</div>
              <div className={`text-2xl font-bold mt-1 ${healthColors[health].text}`}>
                {healthColors[health].label}
              </div>
            </PageCard>
          </div>

          {/* Main Card */}
          <PageCard className="hover:border-[#ffc800]/50 transition">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-[#ffc800]" />
                <span className="text-lg font-semibold text-white">t_aereo_ws_firecrawl</span>
              </div>
              <div className={`w-3 h-3 rounded-full ${healthColors[health].dot} shadow-lg animate-pulse`} />
            </div>

            <p className="text-[10px] text-muted-foreground mb-4">
              Dados de tracking aéreo coletados via Firecrawl scraper (banco: dados_dachser)
            </p>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="p-3 rounded-lg bg-[#0a0b10] border border-white/10">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Última Atualização</div>
                <div className={`text-sm font-medium mt-1 ${healthColors[health].text}`}>
                  {formatRelativeTime(stats.lastUpdate)}
                </div>
                {stats.lastUpdate && (
                  <div className="text-[10px] text-white/40 mt-0.5">
                    {formatAbsoluteTime(stats.lastUpdate)}
                  </div>
                )}
              </div>
              <div className="p-3 rounded-lg bg-[#0a0b10] border border-white/10">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Total Registros</div>
                <div className="text-xl font-bold text-white mt-1">{formatNumber(stats.totalRecords)}</div>
              </div>
              <div className="p-3 rounded-lg bg-[#0a0b10] border border-white/10">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Inserções 24h</div>
                <div className="text-xl font-bold text-emerald-400 mt-1">+{formatNumber(stats.recentInserts)}</div>
              </div>
              <div className="p-3 rounded-lg bg-[#0a0b10] border border-white/10">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">AWBs Únicas 24h</div>
                <div className="text-xl font-bold text-blue-400 mt-1">{formatNumber(stats.uniqueAwbs)}</div>
              </div>
            </div>

            {/* Alert Info */}
            <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs text-amber-300/80">
              <strong>Alerta automático:</strong> E-mail enviado para devs@z3us.ai, rodrigo@z3us.ai e larissa@z3us.ai quando
              <code className="mx-1 px-1 py-0.5 bg-amber-500/10 rounded text-amber-400">scraped_at</code>
              ultrapassar <strong>2 horas</strong> sem atualização.
            </div>
          </PageCard>
        </div>
      ) : null}
    </PageLayout>
  );
}
