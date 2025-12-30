import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Activity, Server, TrendingUp, AlertCircle, RefreshCw, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import dachserBg from "@/assets/dachser-background.jpg";

interface ApiStats {
  api_name: string;
  total_calls: number;
  last_call: string | null;
  avg_response_time_ms: number | null;
  error_count: number;
  success_rate: number;
}

interface ApiUsageLog {
  id: number;
  api_name: string;
  endpoint: string;
  method: string;
  status_code: number;
  response_time_ms: number;
  created_at: string;
  user_email: string | null;
}

// Usuários que NÃO podem ver esta página
const RESTRICTED_USERS = ["ana.tozzo"];

export default function ApiManagement() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [apiStats, setApiStats] = useState<ApiStats[]>([]);
  const [recentLogs, setRecentLogs] = useState<ApiUsageLog[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isRestricted, setIsRestricted] = useState(false);

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      const parsed = JSON.parse(storedUser);
      const adminStatus = parsed.is_admin === 1 || parsed.is_admin === "1" || parsed.is_admin === true;
      const username = parsed.username || parsed.email || "";
      
      // Check if user is restricted
      if (RESTRICTED_USERS.includes(username.toLowerCase())) {
        setIsRestricted(true);
        toast.error("Acesso não autorizado a esta página");
        navigate("/dashboard");
        return;
      }
      
      setIsAdmin(adminStatus);
      if (!adminStatus) {
        toast.error("Acesso não autorizado");
        navigate("/dashboard");
      }
    } else {
      navigate("/");
    }
  }, [navigate]);

  useEffect(() => {
    if (isAdmin && !isRestricted) {
      fetchApiStats();
    }
  }, [isAdmin, isRestricted]);

  const fetchApiStats = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { action: "get_api_stats" },
      });

      if (error) throw error;

      if (data?.success) {
        setApiStats(data.stats || []);
        setRecentLogs(data.recent_logs || []);
      } else {
        throw new Error(data?.error || "Erro ao buscar dados");
      }
    } catch (error) {
      console.error("Error fetching API stats:", error);
      toast.error("Erro ao carregar estatísticas de APIs");
      setApiStats([]);
      setRecentLogs([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchApiStats();
    setIsRefreshing(false);
    toast.success("Dados atualizados");
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleString("pt-BR");
  };

  const getStatusColor = (successRate: number) => {
    if (successRate >= 99) return "bg-green-500/20 text-green-400 border-green-500/30";
    if (successRate >= 95) return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    return "bg-red-500/20 text-red-400 border-red-500/30";
  };

  if (isRestricted) {
    return null;
  }

  return (
    <div
      className="min-h-screen bg-cover bg-center"
      style={{ backgroundImage: `url(${dachserBg})` }}
    >
      <div className="min-h-screen bg-black/70 backdrop-blur-sm p-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate("/dashboard")}
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition"
              >
                <ArrowLeft className="w-5 h-5 text-white" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                  <Server className="w-6 h-6 text-amber-400" />
                  Gerenciamento de APIs
                </h1>
                <p className="text-white/60 text-sm">
                  Monitoramento de chamadas e consumo de APIs externas
                </p>
              </div>
            </div>
            <Button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="bg-amber-500 hover:bg-amber-600 text-black"
            >
              {isRefreshing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Atualizar
            </Button>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <Card className="bg-white/10 border-white/20 backdrop-blur">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-blue-500/20">
                    <Activity className="w-6 h-6 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-white/60 text-sm">Total de Chamadas</p>
                    <p className="text-2xl font-bold text-white">
                      {isLoading ? "..." : apiStats.reduce((sum, api) => sum + api.total_calls, 0).toLocaleString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white/10 border-white/20 backdrop-blur">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-green-500/20">
                    <TrendingUp className="w-6 h-6 text-green-400" />
                  </div>
                  <div>
                    <p className="text-white/60 text-sm">Taxa de Sucesso</p>
                    <p className="text-2xl font-bold text-white">
                      {isLoading ? "..." : (
                        (apiStats.reduce((sum, api) => sum + api.success_rate, 0) / (apiStats.length || 1)).toFixed(1) + "%"
                      )}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white/10 border-white/20 backdrop-blur">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-amber-500/20">
                    <Server className="w-6 h-6 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-white/60 text-sm">APIs Ativas</p>
                    <p className="text-2xl font-bold text-white">
                      {isLoading ? "..." : apiStats.length}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white/10 border-white/20 backdrop-blur">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-red-500/20">
                    <AlertCircle className="w-6 h-6 text-red-400" />
                  </div>
                  <div>
                    <p className="text-white/60 text-sm">Total de Erros</p>
                    <p className="text-2xl font-bold text-white">
                      {isLoading ? "..." : apiStats.reduce((sum, api) => sum + api.error_count, 0).toLocaleString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* API Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {isLoading ? (
              <div className="col-span-full flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
              </div>
            ) : apiStats.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center py-12 text-center">
                <Server className="w-12 h-12 text-white/30 mb-4" />
                <p className="text-white/60 text-lg font-medium">Nenhum dado de API registrado</p>
                <p className="text-white/40 text-sm mt-2 max-w-md">
                  As estatísticas aparecerão aqui conforme as edge functions forem instrumentadas para registrar chamadas de API.
                </p>
              </div>
            ) : (
              apiStats.map((api) => (
                <Card key={api.api_name} className="bg-white/10 border-white/20 backdrop-blur hover:bg-white/15 transition">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg text-white">{api.api_name}</CardTitle>
                      <Badge className={getStatusColor(api.success_rate)}>
                        {api.success_rate?.toFixed(1) || 0}%
                      </Badge>
                    </div>
                    <CardDescription className="text-white/50">
                      Última chamada: {formatDate(api.last_call)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-white/50 text-xs">Total Chamadas</p>
                        <p className="text-xl font-semibold text-white">
                          {(api.total_calls || 0).toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-white/50 text-xs">Tempo Médio</p>
                        <p className="text-xl font-semibold text-white">
                          {api.avg_response_time_ms ? `${api.avg_response_time_ms}ms` : "N/A"}
                        </p>
                      </div>
                      <div>
                        <p className="text-white/50 text-xs">Erros</p>
                        <p className={`text-xl font-semibold ${(api.error_count || 0) > 0 ? "text-red-400" : "text-green-400"}`}>
                          {api.error_count || 0}
                        </p>
                      </div>
                      <div>
                        <p className="text-white/50 text-xs">Sucesso</p>
                        <p className="text-xl font-semibold text-green-400">
                          {((api.total_calls || 0) - (api.error_count || 0)).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          {/* Info Note */}
          <div className="mt-8 p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
            <p className="text-blue-300 text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>
                Os dados exibidos são baseados nos logs de uso do sistema. Para implementar um tracking mais detalhado,
                é necessário adicionar instrumentação nas edge functions que fazem chamadas às APIs externas.
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
