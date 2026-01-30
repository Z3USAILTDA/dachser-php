import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Database, RefreshCw, Clock, Hash, AlertCircle, Plane, Ship } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { PageLayout } from "@/components/layout/PageLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageCard } from "@/components/layout/PageCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

interface ModalBreakdown {
  lastUpdate: string | null;
  totalRecords: number;
  breakdown: {
    [key: string]: { lastUpdate: string | null; count: number };
  };
}

interface TableStats {
  lastUpdate: string | null;
  totalRecords: number;
  applications: string[];
  byModal?: {
    AIR: ModalBreakdown;
    SEA: ModalBreakdown;
  };
}

interface DatabaseStats {
  t_master_dados: TableStats;
  t_dados_financeiro_nfs: TableStats;
  t_dados_financeiro_voucher: TableStats;
  tbaixas: TableStats;
  fetchedAt: string;
}

type HealthStatus = "green" | "yellow" | "red";

const getHealthStatus = (lastUpdate: string | null): HealthStatus => {
  if (!lastUpdate) return "red";

  const now = new Date();
  const updateTime = new Date(lastUpdate);
  const diffMinutes = (now.getTime() - updateTime.getTime()) / (1000 * 60);

  if (diffMinutes <= 5) return "green";
  if (diffMinutes <= 60) return "yellow";
  return "red";
};

const healthColors: Record<HealthStatus, string> = {
  green: "bg-green-500",
  yellow: "bg-yellow-500",
  red: "bg-red-500",
};

const appBadgeStyles: Record<string, string> = {
  AIR: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  SEA: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  CCT: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  TRACKING: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  OLIMPO: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  REGUA: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  ESTEIRA: "bg-pink-500/20 text-pink-400 border-pink-500/30",
};

const formatNumber = (num: number): string => {
  return num.toLocaleString("pt-BR");
};

const formatRelativeTime = (date: string | null): string => {
  if (!date) return "Nunca";
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: ptBR });
};

const formatAbsoluteTime = (date: string | null): string => {
  if (!date) return "";
  return format(new Date(date), "dd/MM/yyyy HH:mm", { locale: ptBR });
};

function HealthIndicator({ status }: { status: HealthStatus }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-3 h-3 rounded-full ${healthColors[status]} shadow-lg animate-pulse`} />
    </div>
  );
}

function AppBadge({ app }: { app: string }) {
  return (
    <Badge 
      variant="outline" 
      className={`text-xs font-medium ${appBadgeStyles[app] || "bg-muted text-muted-foreground"}`}
    >
      {app}
    </Badge>
  );
}

function TableCard({ 
  tableName, 
  stats, 
  icon 
}: { 
  tableName: string; 
  stats: TableStats;
  icon?: React.ReactNode;
}) {
  const health = getHealthStatus(stats.lastUpdate);

  return (
    <PageCard className="h-full">
      <div className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              {icon || <Database size={24} />}
            </div>
            <div>
              <h3 className="font-mono text-lg font-semibold text-foreground">{tableName}</h3>
            </div>
          </div>
          <HealthIndicator status={health} />
        </div>

        {/* Stats */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <Clock size={16} className="text-muted-foreground" />
            <span className="text-muted-foreground">Última Atualização:</span>
            <span className="text-foreground font-medium">
              {formatRelativeTime(stats.lastUpdate)}
            </span>
          </div>
          {stats.lastUpdate && (
            <div className="pl-6 text-xs text-muted-foreground">
              {formatAbsoluteTime(stats.lastUpdate)}
            </div>
          )}

          <div className="flex items-center gap-2 text-sm">
            <Hash size={16} className="text-muted-foreground" />
            <span className="text-muted-foreground">Total de Registros:</span>
            <span className="text-foreground font-semibold">
              {formatNumber(stats.totalRecords)}
            </span>
          </div>
        </div>

        {/* Applications */}
        <div className="pt-2 border-t border-border/30">
          <span className="text-xs text-muted-foreground mb-2 block">Aplicações:</span>
          <div className="flex flex-wrap gap-1.5">
            {stats.applications.map((app) => (
              <AppBadge key={app} app={app} />
            ))}
          </div>
        </div>
      </div>
    </PageCard>
  );
}

function MasterDataCard({ stats }: { stats: TableStats }) {
  const health = getHealthStatus(stats.lastUpdate);

  return (
    <PageCard>
      <div className="p-5 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Database size={24} />
            </div>
            <div>
              <h3 className="font-mono text-lg font-semibold text-foreground">t_master_dados</h3>
              <p className="text-xs text-muted-foreground">Tabela principal de processos</p>
            </div>
          </div>
          <HealthIndicator status={health} />
        </div>

        {/* General Stats */}
        <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-muted/30">
          <div>
            <div className="flex items-center gap-2 text-sm">
              <Clock size={16} className="text-muted-foreground" />
              <span className="text-muted-foreground">Última Atualização Geral:</span>
            </div>
            <div className="mt-1 ml-6">
              <span className="text-foreground font-medium">
                {formatRelativeTime(stats.lastUpdate)}
              </span>
              {stats.lastUpdate && (
                <span className="text-xs text-muted-foreground ml-2">
                  ({formatAbsoluteTime(stats.lastUpdate)})
                </span>
              )}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 text-sm">
              <Hash size={16} className="text-muted-foreground" />
              <span className="text-muted-foreground">Total de Registros:</span>
            </div>
            <div className="mt-1 ml-6">
              <span className="text-2xl font-bold text-foreground">
                {formatNumber(stats.totalRecords)}
              </span>
            </div>
          </div>
        </div>

        {/* Applications */}
        <div>
          <span className="text-xs text-muted-foreground mb-2 block">Aplicações:</span>
          <div className="flex flex-wrap gap-1.5">
            {stats.applications.map((app) => (
              <AppBadge key={app} app={app} />
            ))}
          </div>
        </div>

        {/* Modal Breakdown */}
        {stats.byModal && (
          <div className="grid md:grid-cols-2 gap-4">
            {/* AIR Modal */}
            <div className="p-4 rounded-xl border border-blue-500/30 bg-blue-500/5">
              <div className="flex items-center gap-2 mb-3">
                <Plane size={20} className="text-blue-400" />
                <h4 className="font-semibold text-blue-400">MODAL AIR</h4>
                <HealthIndicator status={getHealthStatus(stats.byModal.AIR.lastUpdate)} />
              </div>
              
              <div className="space-y-2 text-sm">
                {Object.entries(stats.byModal.AIR.breakdown).map(([tipo, data]) => (
                  <div key={tipo} className="flex justify-between items-center">
                    <span className="text-muted-foreground">{tipo}:</span>
                    <span className="font-semibold text-foreground">{formatNumber(data.count)}</span>
                  </div>
                ))}
                <div className="pt-2 border-t border-blue-500/20">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-xs">Última:</span>
                    <span className="text-xs text-blue-400">
                      {formatRelativeTime(stats.byModal.AIR.lastUpdate)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* SEA Modal */}
            <div className="p-4 rounded-xl border border-cyan-500/30 bg-cyan-500/5">
              <div className="flex items-center gap-2 mb-3">
                <Ship size={20} className="text-cyan-400" />
                <h4 className="font-semibold text-cyan-400">MODAL SEA</h4>
                <HealthIndicator status={getHealthStatus(stats.byModal.SEA.lastUpdate)} />
              </div>
              
              <div className="space-y-2 text-sm">
                {Object.entries(stats.byModal.SEA.breakdown).map(([tipo, data]) => (
                  <div key={tipo} className="flex justify-between items-center">
                    <span className="text-muted-foreground">{tipo}:</span>
                    <span className="font-semibold text-foreground">{formatNumber(data.count)}</span>
                  </div>
                ))}
                <div className="pt-2 border-t border-cyan-500/20">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-xs">Última:</span>
                    <span className="text-xs text-cyan-400">
                      {formatRelativeTime(stats.byModal.SEA.lastUpdate)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageCard>
  );
}

function LoadingState() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-64 w-full rounded-2xl" />
      <div className="grid md:grid-cols-2 gap-6">
        <Skeleton className="h-48 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
      <Skeleton className="h-48 w-full rounded-2xl" />
    </div>
  );
}

export default function DatabaseMonitor() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DatabaseStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("fetch-database-stats");

      if (fnError) {
        throw fnError;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      setStats(data);
    } catch (err: any) {
      console.error("Error fetching database stats:", err);
      setError(err.message || "Erro ao buscar estatísticas");
      toast.error("Erro ao buscar estatísticas do banco de dados");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Check admin access
    const storedUser = localStorage.getItem("user");
    if (!storedUser) {
      navigate("/login");
      return;
    }

    const user = JSON.parse(storedUser);
    if (user.is_admin !== 1) {
      navigate("/dashboard");
      toast.error("Acesso restrito a administradores");
      return;
    }

    fetchStats();
  }, [navigate]);

  return (
    <PageLayout>
      <PageHeader
        title="Monitoramento de Dados"
        subtitle="Estatísticas das tabelas principais do banco dados_dachser"
      />

      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Refresh Button */}
        <div className="flex justify-between items-center">
          <div className="text-sm text-muted-foreground">
            {stats?.fetchedAt && (
              <span>
                Dados obtidos {formatRelativeTime(stats.fetchedAt)}
              </span>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchStats}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Atualizar
          </Button>
        </div>

        {/* Error State */}
        {error && !loading && (
          <PageCard className="border-destructive/50">
            <div className="p-6 flex items-center gap-4 text-destructive">
              <AlertCircle size={24} />
              <div>
                <h3 className="font-semibold">Erro ao carregar dados</h3>
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
              <Button variant="outline" size="sm" onClick={fetchStats} className="ml-auto">
                Tentar novamente
              </Button>
            </div>
          </PageCard>
        )}

        {/* Loading State */}
        {loading && <LoadingState />}

        {/* Data Display */}
        {!loading && stats && (
          <div className="space-y-6">
            {/* t_master_dados - Full Width */}
            <MasterDataCard stats={stats.t_master_dados} />

            {/* Financial Tables - Grid */}
            <div className="grid md:grid-cols-2 gap-6">
              <TableCard
                tableName="t_dados_financeiro_nfs"
                stats={stats.t_dados_financeiro_nfs}
              />
              <TableCard
                tableName="t_dados_financeiro_voucher"
                stats={stats.t_dados_financeiro_voucher}
              />
            </div>

            {/* tbaixas */}
            <div className="max-w-xl">
              <TableCard
                tableName="tbaixas"
                stats={stats.tbaixas}
              />
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
