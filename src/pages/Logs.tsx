// @ts-nocheck
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

// Type assertion to bypass strict typing
const db = supabase as any;
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, RefreshCw, ArrowLeft, Loader2, FileText, CheckCircle, Database, Terminal } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import dachserBg from "@/assets/dachser-background.jpg";
import { TablePagination } from "@/components/layout/TablePagination";

interface LogEntry {
  id: string;
  entity: string;
  action: string;
  entity_id: string;
  user_id: string | null;
  details: string | null;
  created_at: string;
}

interface DashboardStats {
  totalLogs: number;
  todayLogs: number;
  totalChecks: number;
  totalMatrices: number;
}

interface User {
  id: number;
  email: string;
  username: string;
  is_admin: number;
}

const Logs = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalLogs: 0,
    todayLogs: 0,
    totalChecks: 0,
    totalMatrices: 0,
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);
      
      if (parsedUser.is_admin !== 1) {
        toast.error("Acesso negado: apenas administradores podem acessar logs");
        navigate("/dashboard");
        return;
      }
      
      fetchLogs();
      fetchStats();
    } else {
      navigate("/");
    }
    setLoading(false);
  }, [navigate]);

  const fetchLogs = async () => {
    try {
      const { data, error } = await supabase
        .from("log_entry")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error("Error fetching logs:", error);
      toast.error("Erro ao carregar logs");
    }
  };

  const fetchStats = async () => {
    try {
      const { count: totalLogs } = await supabase
        .from("log_entry")
        .select("*", { count: "exact", head: true });

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { count: todayLogs } = await supabase
        .from("log_entry")
        .select("*", { count: "exact", head: true })
        .gte("created_at", today.toISOString());

      const { count: totalChecks } = await supabase
        .from("awb_check")
        .select("*", { count: "exact", head: true });

      const { count: totalMatrices } = await supabase
        .from("rule_matrix")
        .select("*", { count: "exact", head: true });

      setStats({
        totalLogs: totalLogs || 0,
        todayLogs: todayLogs || 0,
        totalChecks: totalChecks || 0,
        totalMatrices: totalMatrices || 0,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  };

  const filteredLogs = logs.filter(log => {
    const matchesSearch =
      log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.entity.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.entity_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.details && log.details.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesAction = actionFilter === "all" || log.action === actionFilter;
    const matchesEntity = entityFilter === "all" || log.entity === entityFilter;

    return matchesSearch && matchesAction && matchesEntity;
  });

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));
  const paginatedLogs = filteredLogs.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, actionFilter, entityFilter]);

  const getActionBadge = (action: string) => {
    const badgeMap: Record<string, { color: string; label: string }> = {
      UPLOAD_MATRIX: { color: "bg-blue-500/20 text-blue-400 border-blue-500/40", label: "Upload Matriz" },
      NEW_VERSION: { color: "bg-purple-500/20 text-purple-400 border-purple-500/40", label: "Nova Versão" },
      RUN_CHECK: { color: "bg-green-500/20 text-green-400 border-green-500/40", label: "Validação" },
      BULK_CHECK: { color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/40", label: "Validação em Lote" },
      EXPORT: { color: "bg-orange-500/20 text-orange-400 border-orange-500/40", label: "Exportação" },
      UPLOAD_AWB: { color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40", label: "Upload AWB" },
      PARSE_AWB: { color: "bg-pink-500/20 text-pink-400 border-pink-500/40", label: "Parse AWB" },
    };

    const badge = badgeMap[action] || { color: "bg-neutral-500/20 text-neutral-400", label: action };
    return <Badge className={badge.color}>{badge.label}</Badge>;
  };

  const getEntityIcon = (entity: string) => {
    switch (entity) {
      case "MATRIX":
        return <Database className="h-4 w-4" />;
      case "CHECK":
        return <CheckCircle className="h-4 w-4" />;
      case "DOCUMENT":
        return <FileText className="h-4 w-4" />;
      default:
        return <Terminal className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen text-white"
      style={{
        background: `linear-gradient(120deg, rgba(4, 17, 45, 0.92), rgba(26, 93, 173, 0.55)), url(${dachserBg}) center/cover no-repeat`,
      }}
    >
      <div className="min-h-screen bg-black/80 backdrop-blur-sm">
        {/* Header */}
        <header className="border-b border-white/10 bg-black/50 backdrop-blur">
          <div className="max-w-6xl mx-auto px-6 py-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate("/air/check")}
                className="w-8 h-8 rounded-full border border-[rgba(255,255,255,.12)] bg-[rgba(5,6,18,0.9)] text-[#aaaaaa] flex items-center justify-center backdrop-blur-sm hover:bg-[rgba(5,6,18,1)] hover:text-white transition-all"
              >
                <ArrowLeft size={16} />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-white">Sistema de Logs</h1>
                <p className="text-sm text-neutral-400">
                  Monitoramento e auditoria de ações do sistema
                </p>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-6 py-6 space-y-6">
          {/* Dashboard Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-black/60 border-white/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-neutral-400">Total de Logs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-white">{stats.totalLogs}</div>
              </CardContent>
            </Card>

            <Card className="bg-black/60 border-white/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-neutral-400">Logs Hoje</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-amber-400">{stats.todayLogs}</div>
              </CardContent>
            </Card>

            <Card className="bg-black/60 border-white/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-neutral-400">Total de Validações</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-emerald-400">{stats.totalChecks}</div>
              </CardContent>
            </Card>

            <Card className="bg-black/60 border-white/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-neutral-400">Matrizes de Regras</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-white">{stats.totalMatrices}</div>
              </CardContent>
            </Card>
          </div>

          {/* Filtros */}
          <Card className="bg-black/60 border-white/10">
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-neutral-400" />
                    <Input
                      placeholder="Buscar nos logs..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className="pl-10 h-11 bg-black/60 border-white/10"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-3 items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-neutral-400">Ação:</span>
                    <Select value={actionFilter} onValueChange={setActionFilter}>
                      <SelectTrigger className="h-11 w-[180px] bg-black/60 border-white/10">
                        <SelectValue placeholder="Todas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        <SelectItem value="UPLOAD_MATRIX">Upload Matriz</SelectItem>
                        <SelectItem value="NEW_VERSION">Nova Versão</SelectItem>
                        <SelectItem value="RUN_CHECK">Validação</SelectItem>
                        <SelectItem value="BULK_CHECK">Validação em Lote</SelectItem>
                        <SelectItem value="EXPORT">Exportação</SelectItem>
                        <SelectItem value="UPLOAD_AWB">Upload AWB</SelectItem>
                        <SelectItem value="PARSE_AWB">Parse AWB</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-sm text-neutral-400">Entidade:</span>
                    <Select value={entityFilter} onValueChange={setEntityFilter}>
                      <SelectTrigger className="h-11 w-[180px] bg-black/60 border-white/10">
                        <SelectValue placeholder="Todas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        <SelectItem value="MATRIX">Matriz</SelectItem>
                        <SelectItem value="CHECK">Validação</SelectItem>
                        <SelectItem value="DOCUMENT">Documento</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    onClick={() => {
                      fetchLogs();
                      fetchStats();
                    }}
                    variant="outline"
                    className="h-11 rounded-full border-white/20 bg-black/60 hover:bg-white/10"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Atualizar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tabela de Logs */}
          <Card className="bg-black/60 border-white/10">
            <CardContent className="pt-6">
              <div className="overflow-x-auto rounded-xl border border-white/8">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-white/10">
                      <TableHead className="text-xs uppercase text-neutral-400">Data/Hora</TableHead>
                      <TableHead className="text-xs uppercase text-neutral-400">Entidade</TableHead>
                      <TableHead className="text-xs uppercase text-neutral-400">Ação</TableHead>
                      <TableHead className="text-xs uppercase text-neutral-400">ID da Entidade</TableHead>
                      <TableHead className="text-xs uppercase text-neutral-400">Detalhes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedLogs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-neutral-400 py-8">
                          Nenhum log encontrado
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedLogs.map(log => (
                        <TableRow key={log.id} className="border-b border-white/5 hover:bg-white/5">
                          <TableCell className="font-mono text-xs whitespace-nowrap">
                            {format(new Date(log.created_at), "dd/MM/yyyy HH:mm:ss")}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getEntityIcon(log.entity)}
                              <span className="text-sm">{log.entity}</span>
                            </div>
                          </TableCell>
                          <TableCell>{getActionBadge(log.action)}</TableCell>
                          <TableCell className="font-mono text-xs text-neutral-400">
                            {log.entity_id.substring(0, 8)}...
                          </TableCell>
                          <TableCell className="max-w-md">
                            <span className="text-sm text-neutral-400 truncate block">
                              {log.details || "—"}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              
              {/* Pagination */}
              <TablePagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
};

export default Logs;
