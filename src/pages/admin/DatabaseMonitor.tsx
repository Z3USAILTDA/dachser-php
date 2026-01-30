import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Database, RefreshCw, AlertCircle, Plane, Ship, Server, Loader2, HelpCircle, Hash, Clock, Activity, TrendingUp } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { PageLayout } from "@/components/layout/PageLayout";
import { PageCard } from "@/components/layout/PageCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { parseDBDate } from "@/utils/timezone";
import { cn } from "@/lib/utils";

interface ModalBreakdown {
  lastUpdate: string | null;
  totalRecords: number;
  recentInserts: number;
  breakdown: {
    [key: string]: { lastUpdate: string | null; count: number; recentInserts: number };
  };
}

interface TableStats {
  lastUpdate: string | null;
  totalRecords: number;
  recentInserts: number;
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
  const updateTime = parseDBDate(lastUpdate);
  if (!updateTime) return "red";
  
  const diffMinutes = (now.getTime() - updateTime.getTime()) / (1000 * 60);

  if (diffMinutes <= 5) return "green";
  if (diffMinutes <= 60) return "yellow";
  return "red";
};

const healthColors: Record<HealthStatus, { dot: string; text: string; label: string }> = {
  green: { dot: "bg-emerald-500", text: "text-emerald-400", label: "Saudável" },
  yellow: { dot: "bg-amber-500", text: "text-amber-400", label: "Atenção" },
  red: { dot: "bg-red-500", text: "text-red-400", label: "Crítico" },
};

const appBadgeStyles: Record<string, string> = {
  AIR: "bg-blue-500/15 border-blue-500/50 text-blue-400",
  SEA: "bg-cyan-500/15 border-cyan-500/50 text-cyan-400",
  CCT: "bg-purple-500/15 border-purple-500/50 text-purple-400",
  TRACKING: "bg-emerald-500/15 border-emerald-500/50 text-emerald-400",
  OLIMPO: "bg-amber-500/15 border-amber-500/50 text-amber-400",
  REGUA: "bg-orange-500/15 border-orange-500/50 text-orange-400",
  ESTEIRA: "bg-pink-500/15 border-pink-500/50 text-pink-400",
};

const formatNumber = (num: number): string => {
  return num.toLocaleString("pt-BR");
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

function HealthIndicator({ status }: { status: HealthStatus }) {
  return (
    <div className={`w-3 h-3 rounded-full ${healthColors[status].dot} shadow-lg animate-pulse`} />
  );
}

function AppBadge({ app }: { app: string }) {
  return (
    <Badge 
      variant="outline" 
      className={`text-[9px] font-semibold uppercase tracking-wider ${appBadgeStyles[app] || "bg-muted/50 text-muted-foreground"}`}
    >
      {app}
    </Badge>
  );
}

function TableCard({ 
  tableName, 
  stats,
  description 
}: { 
  tableName: string; 
  stats: TableStats;
  description?: string;
}) {
  const health = getHealthStatus(stats.lastUpdate);

  return (
    <PageCard className="hover:border-[#ffc800]/50 hover:bg-white/[0.02] transition">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-[#ffc800]" />
          <span className="text-base font-semibold text-white">{tableName}</span>
        </div>
        <HealthIndicator status={health} />
      </div>
      
      {description && (
        <p className="text-[10px] text-muted-foreground mb-3">{description}</p>
      )}

      {/* Last Update */}
      <p className="text-[10px] text-muted-foreground mb-3">
        Última inserção: <span className={healthColors[health].text}>{formatRelativeTime(stats.lastUpdate)}</span>
        {stats.lastUpdate && (
          <span className="text-white/40 ml-1">({formatAbsoluteTime(stats.lastUpdate)})</span>
        )}
      </p>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="p-2 rounded-lg bg-[#0a0b10] border border-white/10">
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Registros</div>
          <div className="text-lg font-bold text-white mt-0.5">
            {formatNumber(stats.totalRecords)}
          </div>
        </div>
        <div className="p-2 rounded-lg bg-[#0a0b10] border border-white/10">
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Últimas 24h</div>
          <div className="text-lg font-bold text-emerald-400 mt-0.5">
            +{formatNumber(stats.recentInserts)}
          </div>
        </div>
        <div className="p-2 rounded-lg bg-[#0a0b10] border border-white/10">
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Status</div>
          <div className={`text-lg font-bold mt-0.5 ${healthColors[health].text}`}>
            {healthColors[health].label}
          </div>
        </div>
      </div>

      {/* Applications */}
      <div className="pt-2 border-t border-white/5">
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground mb-2 block">Aplicações</span>
        <div className="flex flex-wrap gap-1.5">
          {stats.applications.map((app) => (
            <AppBadge key={app} app={app} />
          ))}
        </div>
      </div>
    </PageCard>
  );
}

function MasterDataCard({ stats }: { stats: TableStats }) {
  const health = getHealthStatus(stats.lastUpdate);

  return (
    <PageCard className="hover:border-[#ffc800]/50 hover:bg-white/[0.02] transition">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-[#ffc800]" />
          <span className="text-base font-semibold text-white">t_master_dados</span>
        </div>
        <HealthIndicator status={health} />
      </div>

      <p className="text-[10px] text-muted-foreground mb-4">
        Tabela principal de processos operacionais
      </p>

      {/* General Stats */}
      <div className="p-3 rounded-lg bg-[#0a0b10] border border-white/10 mb-4">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Última Atualização</div>
            <div className={`text-sm font-medium ${healthColors[health].text}`}>
              {formatRelativeTime(stats.lastUpdate)}
            </div>
            {stats.lastUpdate && (
              <div className="text-[10px] text-white/40 mt-0.5">
                {formatAbsoluteTime(stats.lastUpdate)}
              </div>
            )}
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Total de Registros</div>
            <div className="text-2xl font-bold text-white">
              {formatNumber(stats.totalRecords)}
            </div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Inseridos (24h)</div>
            <div className="text-2xl font-bold text-emerald-400">
              +{formatNumber(stats.recentInserts)}
            </div>
          </div>
        </div>
      </div>

      {/* Applications */}
      <div className="mb-4">
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground mb-2 block">Aplicações</span>
        <div className="flex flex-wrap gap-1.5">
          {stats.applications.map((app) => (
            <AppBadge key={app} app={app} />
          ))}
        </div>
      </div>

      {/* Modal Breakdown */}
      {stats.byModal && (
        <div className="grid md:grid-cols-2 gap-3">
          {/* AIR Modal */}
          <div className="p-3 rounded-lg border border-blue-500/30 bg-blue-500/5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Plane size={16} className="text-blue-400" />
                <span className="text-sm font-semibold text-blue-400">MODAL AIR</span>
              </div>
              <HealthIndicator status={getHealthStatus(stats.byModal.AIR.lastUpdate)} />
            </div>
            
            <div className="space-y-2">
              {Object.entries(stats.byModal.AIR.breakdown).map(([tipo, data]) => (
                <div key={tipo} className="flex justify-between items-center text-sm">
                  <span className="text-white/60">{tipo}:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">{formatNumber(data.count)}</span>
                    {data.recentInserts > 0 && (
                      <span className="text-[10px] text-emerald-400">+{data.recentInserts}</span>
                    )}
                  </div>
                </div>
              ))}
              <div className="pt-2 border-t border-blue-500/20 flex justify-between items-center">
                <span className="text-[10px] text-white/40">Última:</span>
                <span className="text-[10px] text-blue-400">
                  {formatRelativeTime(stats.byModal.AIR.lastUpdate)}
                </span>
              </div>
            </div>
          </div>

          {/* SEA Modal */}
          <div className="p-3 rounded-lg border border-cyan-500/30 bg-cyan-500/5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Ship size={16} className="text-cyan-400" />
                <span className="text-sm font-semibold text-cyan-400">MODAL SEA</span>
              </div>
              <HealthIndicator status={getHealthStatus(stats.byModal.SEA.lastUpdate)} />
            </div>
            
            <div className="space-y-2">
              {Object.entries(stats.byModal.SEA.breakdown).map(([tipo, data]) => (
                <div key={tipo} className="flex justify-between items-center text-sm">
                  <span className="text-white/60">{tipo}:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">{formatNumber(data.count)}</span>
                    {data.recentInserts > 0 && (
                      <span className="text-[10px] text-emerald-400">+{data.recentInserts}</span>
                    )}
                  </div>
                </div>
              ))}
              <div className="pt-2 border-t border-cyan-500/20 flex justify-between items-center">
                <span className="text-[10px] text-white/40">Última:</span>
                <span className="text-[10px] text-cyan-400">
                  {formatRelativeTime(stats.byModal.SEA.lastUpdate)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageCard>
  );
}

export default function DatabaseMonitor() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DatabaseStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
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
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchStats();
    setIsRefreshing(false);
    toast.success("Dados atualizados");
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

    const loadData = async () => {
      setLoading(true);
      await fetchStats();
      setLoading(false);
    };

    loadData();
  }, [navigate]);

  // Calculate summary metrics
  const totalRecords = stats ? 
    stats.t_master_dados.totalRecords + 
    stats.t_dados_financeiro_nfs.totalRecords + 
    stats.t_dados_financeiro_voucher.totalRecords + 
    stats.tbaixas.totalRecords : 0;

  const healthyTables = stats ? [
    stats.t_master_dados,
    stats.t_dados_financeiro_nfs,
    stats.t_dados_financeiro_voucher,
    stats.tbaixas
  ].filter(t => getHealthStatus(t.lastUpdate) === "green").length : 0;

  const warningTables = stats ? [
    stats.t_master_dados,
    stats.t_dados_financeiro_nfs,
    stats.t_dados_financeiro_voucher,
    stats.tbaixas
  ].filter(t => getHealthStatus(t.lastUpdate) === "yellow").length : 0;

  const criticalTables = stats ? [
    stats.t_master_dados,
    stats.t_dados_financeiro_nfs,
    stats.t_dados_financeiro_voucher,
    stats.tbaixas
  ].filter(t => getHealthStatus(t.lastUpdate) === "red").length : 0;

  const rightContent = (
    <div className="flex items-center gap-2.5">
      <Button
        onClick={handleRefresh}
        disabled={isRefreshing || loading}
        className="bg-[#ffc800] hover:bg-[#e6b400] text-black rounded-full px-4 h-8 text-xs font-semibold"
      >
        {isRefreshing ? (
          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
        ) : (
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
        )}
        Atualizar
      </Button>
      <button
        onClick={() => navigate("/admin/manual")}
        className="w-8 h-8 rounded-full border border-white/25 flex items-center justify-center bg-black/70 text-gray-400 hover:text-[#ffc800] transition-colors"
        title="Manual do usuário"
      >
        <HelpCircle className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <PageLayout 
      title="DACHSER" 
      subtitle="Monitoramento de Dados" 
      pageIcon={Database} 
      backTo="/dashboard"
      rightContent={rightContent}
    >
      {/* Summary Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="p-3 rounded-xl bg-[#0a0b10] border border-white/10">
          <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground flex items-center gap-1.5">
            <Hash className="w-3 h-3 text-blue-400" />
            Total Registros
          </div>
          <div className="text-xl font-bold mt-1">
            {loading ? "..." : formatNumber(totalRecords)}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-[#0a0b10] border border-white/10">
          <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground flex items-center gap-1.5">
            <Activity className="w-3 h-3 text-emerald-400" />
            Tabelas Saudáveis
          </div>
          <div className="text-xl font-bold text-emerald-400 mt-1">
            {loading ? "..." : healthyTables}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-[#0a0b10] border border-white/10">
          <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-amber-400" />
            Em Atenção
          </div>
          <div className="text-xl font-bold text-amber-400 mt-1">
            {loading ? "..." : warningTables}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-[#0a0b10] border border-white/10">
          <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground flex items-center gap-1.5">
            <AlertCircle className="w-3 h-3 text-red-400" />
            Crítico
          </div>
          <div className="text-xl font-bold text-red-400 mt-1">
            {loading ? "..." : criticalTables}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-[#0a0b10] border border-white/10">
          <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground flex items-center gap-1.5">
            <Server className="w-3 h-3 text-[#ffc800]" />
            Tabelas Monitoradas
          </div>
          <div className="text-xl font-bold mt-1">
            {loading ? "..." : "4"}
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-[#ffc800] animate-spin" />
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <PageCard className="border-red-500/30">
          <div className="flex items-center gap-4 text-red-400">
            <AlertCircle size={24} />
            <div className="flex-1">
              <h3 className="font-semibold">Erro ao carregar dados</h3>
              <p className="text-sm text-white/60">{error}</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleRefresh} className="border-red-500/30 hover:bg-red-500/10">
              Tentar novamente
            </Button>
          </div>
        </PageCard>
      )}

      {/* Empty State */}
      {!loading && !error && !stats && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Server className="w-12 h-12 text-white/30 mb-4" />
          <p className="text-white/60 text-lg font-medium">Nenhum dado disponível</p>
          <p className="text-white/40 text-sm mt-2 max-w-md">
            Não foi possível carregar as estatísticas do banco de dados.
          </p>
        </div>
      )}

      {/* Data Display */}
      {!loading && stats && (
        <div className="space-y-5 animate-fade-in">
          {/* t_master_dados - Full Width */}
          <MasterDataCard stats={stats.t_master_dados} />

          {/* Financial Tables - Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            <TableCard
              tableName="t_dados_financeiro_nfs"
              stats={stats.t_dados_financeiro_nfs}
              description="Dados de notas fiscais para régua de cobrança"
            />
            <TableCard
              tableName="t_dados_financeiro_voucher"
              stats={stats.t_dados_financeiro_voucher}
              description="Dados de vouchers para esteira de pagamentos"
            />
            <TableCard
              tableName="tbaixas"
              stats={stats.tbaixas}
              description="Comprovantes de pagamento"
            />
          </div>

          {/* Footer info */}
          <div className="flex items-center justify-center gap-2 py-4 text-white/40 text-[11px]">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Atualizado {formatRelativeTime(stats.fetchedAt)}</span>
          </div>
        </div>
      )}
    </PageLayout>
  );
}
