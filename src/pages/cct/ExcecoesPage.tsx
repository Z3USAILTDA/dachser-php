import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { PageLayout } from "@/components/cct/PageLayout";
import { Badge } from "@/components/ui/badge";
import { InnerNavTabs } from "@/components/cct/InnerNavTabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { TablePagination } from "@/components/layout/TablePagination";
import { useExcecoes, useUpdateExcecao } from "@/hooks/useCCTData";
import { 
  AlertTriangle, 
  Search, 
  MoreVertical, 
  CheckCircle, 
  Clock, 
  Eye,
  Loader2,
  RefreshCw,
  AlertCircle,
  Scale,
  Wifi,
  FileQuestion,
  List,
  BarChart3,
} from "lucide-react";
import type { StatusExcecao, TipoExcecao } from "@/types/cct";
import { cn } from "@/lib/utils";

const ITEMS_PER_PAGE = 15;

const TIPO_LABELS: Record<TipoExcecao, string> = {
  HOUSE_NAO_ENCONTRADO: "House não encontrado",
  API_INDISPONIVEL: "API indisponível",
  DIVERGENCIA_DADOS: "Divergência de dados",
  ATRASO_EVENTO: "Atraso de evento",
  CARGA_BLOQUEADA: "Carga bloqueada/congelada",
  SLA_PROXIMO_VENCIMENTO: "SLA próximo do vencimento",
  SLA_VENCIDO: "SLA vencido",
};

const TIPO_ICONS: Record<TipoExcecao, React.ElementType> = {
  HOUSE_NAO_ENCONTRADO: FileQuestion,
  API_INDISPONIVEL: Wifi,
  DIVERGENCIA_DADOS: Scale,
  ATRASO_EVENTO: Clock,
  CARGA_BLOQUEADA: AlertTriangle,
  SLA_PROXIMO_VENCIMENTO: Clock,
  SLA_VENCIDO: AlertCircle,
};

const STATUS_CONFIG: Record<StatusExcecao, { label: string; color: string; icon: React.ElementType }> = {
  ABERTA: { label: "Aberta", color: "bg-red-500/20 text-red-400 border-red-500/30", icon: AlertTriangle },
  EM_ANALISE: { label: "Em Análise", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", icon: Eye },
  RESOLVIDA: { label: "Resolvida", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: CheckCircle },
};

export default function ExcecoesPage() {
  const navigate = useNavigate();
  const { data: excecoes = [], isLoading, refetch } = useExcecoes();
  const updateExcecao = useUpdateExcecao();
  
  const [searchTerm, setSearchTerm] = useState("");
  const [filterTipo, setFilterTipo] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [activeTab, setActiveTab] = useState("lista");
  const [currentPage, setCurrentPage] = useState(1);

  const filteredExcecoes = useMemo(() => {
    return excecoes.filter((exc) => {
      const matchesSearch = searchTerm === "" || 
        exc.descricao.toLowerCase().includes(searchTerm.toLowerCase()) ||
        exc.shipments?.house?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        exc.shipments?.master?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesTipo = filterTipo === "all" || exc.tipo_excecao === filterTipo;
      const matchesStatus = filterStatus === "all" || exc.status_excecao === filterStatus;
      
      return matchesSearch && matchesTipo && matchesStatus;
    });
  }, [excecoes, searchTerm, filterTipo, filterStatus]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterTipo, filterStatus]);

  const totalPages = Math.ceil(filteredExcecoes.length / ITEMS_PER_PAGE);
  const paginatedExcecoes = filteredExcecoes.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleStatusChange = (id: string, newStatus: StatusExcecao) => {
    updateExcecao.mutate({ id, status_excecao: newStatus });
  };

  const stats = useMemo(() => {
    return {
      abertas: excecoes.filter(e => e.status_excecao === "ABERTA").length,
      emAnalise: excecoes.filter(e => e.status_excecao === "EM_ANALISE").length,
      resolvidas: excecoes.filter(e => e.status_excecao === "RESOLVIDA").length,
      total: excecoes.length,
    };
  }, [excecoes]);

  return (
    <PageLayout
      title="DACHSER"
      subtitle="Gestão de Exceções — Monitoramento e Tratativas"
      pageIcon={AlertTriangle}
    >
      <div className="space-y-6">
        <InnerNavTabs
          tabs={[
            { id: 'lista', label: 'Lista de Exceções', icon: List },
            { id: 'analytics', label: 'Analytics', icon: BarChart3 }
          ]}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        {activeTab === 'lista' && (
          <div className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div 
              className={cn(
                "rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] p-4 cursor-pointer transition-all hover:scale-[1.02] shadow-[0_18px_40px_rgba(0,0,0,0.85)]",
                filterStatus === "ABERTA" && "ring-2 ring-red-500"
              )} 
              onClick={() => setFilterStatus(filterStatus === "ABERTA" ? "all" : "ABERTA")}
            >
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-red-500/20">
                  <AlertTriangle className="h-6 w-6 text-red-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-[#f5f5f5]">{stats.abertas}</p>
                  <p className="text-sm text-[#aaaaaa]">Abertas</p>
                </div>
              </div>
            </div>
            
            <div 
              className={cn(
                "rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] p-4 cursor-pointer transition-all hover:scale-[1.02] shadow-[0_18px_40px_rgba(0,0,0,0.85)]",
                filterStatus === "EM_ANALISE" && "ring-2 ring-yellow-500"
              )} 
              onClick={() => setFilterStatus(filterStatus === "EM_ANALISE" ? "all" : "EM_ANALISE")}
            >
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-yellow-500/20">
                  <Eye className="h-6 w-6 text-yellow-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-[#f5f5f5]">{stats.emAnalise}</p>
                  <p className="text-sm text-[#aaaaaa]">Em Análise</p>
                </div>
              </div>
            </div>
            
            <div 
              className={cn(
                "rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] p-4 cursor-pointer transition-all hover:scale-[1.02] shadow-[0_18px_40px_rgba(0,0,0,0.85)]",
                filterStatus === "RESOLVIDA" && "ring-2 ring-emerald-500"
              )} 
              onClick={() => setFilterStatus(filterStatus === "RESOLVIDA" ? "all" : "RESOLVIDA")}
            >
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-emerald-500/20">
                  <CheckCircle className="h-6 w-6 text-emerald-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-[#f5f5f5]">{stats.resolvidas}</p>
                  <p className="text-sm text-[#aaaaaa]">Resolvidas</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-[rgba(255,255,255,0.1)]">
                  <AlertCircle className="h-6 w-6 text-[#aaaaaa]" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-[#f5f5f5]">{stats.total}</p>
                  <p className="text-sm text-[#aaaaaa]">Total</p>
                </div>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#aaaaaa]" />
                <Input
                  placeholder="Buscar por house, master ou descrição..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-9 bg-[rgba(0,0,0,0.3)] border-[rgba(255,255,255,0.12)] text-[#f5f5f5] placeholder:text-[#666666]"
                />
              </div>
              
              <Select value={filterTipo} onValueChange={setFilterTipo}>
                <SelectTrigger className="w-full md:w-[200px] h-9 bg-[rgba(0,0,0,0.3)] border-[rgba(255,255,255,0.12)] text-[#f5f5f5]">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent className="bg-[rgba(5,6,18,0.95)] border-[rgba(255,255,255,0.12)]">
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  <SelectItem value="HOUSE_NAO_ENCONTRADO">House não encontrado</SelectItem>
                  <SelectItem value="API_INDISPONIVEL">API indisponível</SelectItem>
                  <SelectItem value="DIVERGENCIA_DADOS">Divergência de dados</SelectItem>
                  <SelectItem value="ATRASO_EVENTO">Atraso de evento</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-full md:w-[180px] h-9 bg-[rgba(0,0,0,0.3)] border-[rgba(255,255,255,0.12)] text-[#f5f5f5]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className="bg-[rgba(5,6,18,0.95)] border-[rgba(255,255,255,0.12)]">
                  <SelectItem value="all">Todos os status</SelectItem>
                  <SelectItem value="ABERTA">Aberta</SelectItem>
                  <SelectItem value="EM_ANALISE">Em Análise</SelectItem>
                  <SelectItem value="RESOLVIDA">Resolvida</SelectItem>
                </SelectContent>
              </Select>
              
              <button 
                onClick={() => refetch()}
                disabled={isLoading}
                className="h-9 w-9 rounded-full border border-[rgba(255,255,255,0.25)] flex items-center justify-center bg-[rgba(0,0,0,0.7)] text-[#aaaaaa] hover:text-[#ffc800] hover:bg-[rgba(0,0,0,0.9)] transition disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] shadow-[0_18px_40px_rgba(0,0,0,0.85)] overflow-hidden">
            <div className="p-4 border-b border-[rgba(255,255,255,0.12)]">
              <h3 className="text-lg font-medium text-[#f5f5f5] flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-[#ffc800]" />
                Exceções ({filteredExcecoes.length} de {stats.total})
              </h3>
            </div>
            
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-[#ffc800]" />
              </div>
            ) : filteredExcecoes.length === 0 ? (
              <div className="text-center py-12 text-[#aaaaaa]">
                <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhuma exceção encontrada</p>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-[rgba(255,255,255,0.12)]">
                      <TableHead className="text-[#aaaaaa]">House / Master</TableHead>
                      <TableHead className="text-[#aaaaaa]">Tipo</TableHead>
                      <TableHead className="text-[#aaaaaa]">Descrição</TableHead>
                      <TableHead className="text-[#aaaaaa]">Status</TableHead>
                      <TableHead className="text-[#aaaaaa] text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedExcecoes.map((exc, index) => {
                      const statusConfig = STATUS_CONFIG[exc.status_excecao];
                      const StatusIcon = statusConfig.icon;
                      const TipoIcon = TIPO_ICONS[exc.tipo_excecao] || AlertTriangle;
                      
                      return (
                        <TableRow 
                          key={exc.id}
                          className={cn(
                            "border-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.03)]",
                            index % 2 === 0 ? "bg-[rgba(255,255,255,0.02)]" : "bg-transparent"
                          )}
                        >
                          <TableCell>
                            <div>
                              <p className="font-medium text-[#f5f5f5] font-mono">{exc.shipments?.house || "-"}</p>
                              <p className="text-xs text-[#aaaaaa]">{exc.shipments?.master || "-"}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="bg-[rgba(255,200,0,0.1)] text-[#ffc800] border-[#ffc800]/30">
                              <TipoIcon className="h-3 w-3 mr-1" />
                              {TIPO_LABELS[exc.tipo_excecao]}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[250px]">
                            <p className="text-sm text-[#aaaaaa] truncate">{exc.descricao}</p>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={statusConfig.color}>
                              <StatusIcon className="h-3 w-3 mr-1" />
                              {statusConfig.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button className="h-8 w-8 rounded-full flex items-center justify-center text-[#aaaaaa] hover:text-[#f5f5f5] hover:bg-[rgba(255,255,255,0.1)] transition">
                                  <MoreVertical className="h-4 w-4" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="bg-[rgba(5,6,18,0.95)] border-[rgba(255,255,255,0.12)]">
                                {exc.status_excecao === "ABERTA" && (
                                  <DropdownMenuItem onClick={() => handleStatusChange(exc.id, "EM_ANALISE")} className="text-[#f5f5f5] focus:bg-[rgba(255,255,255,0.1)]">
                                    <Eye className="h-4 w-4 mr-2" />
                                    Iniciar Análise
                                  </DropdownMenuItem>
                                )}
                                {exc.status_excecao !== "RESOLVIDA" && (
                                  <DropdownMenuItem onClick={() => handleStatusChange(exc.id, "RESOLVIDA")} className="text-[#f5f5f5] focus:bg-[rgba(255,255,255,0.1)]">
                                    <CheckCircle className="h-4 w-4 mr-2" />
                                    Resolver
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => navigate(`/air/cct/processo/${exc.shipment_id}`)} className="text-[#f5f5f5] focus:bg-[rgba(255,255,255,0.1)]">
                                  <Eye className="h-4 w-4 mr-2" />
                                  Ver Processo
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                
                {/* Pagination */}
                <div className="p-4 border-t border-[rgba(255,255,255,0.08)]">
                  <TablePagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                  />
                </div>
              </>
            )}
          </div>
        </div>
        )}

        {activeTab === 'analytics' && (
          <div className="space-y-6">
            <div className="rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] p-10 text-center shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
              <BarChart3 className="h-12 w-12 text-[#aaaaaa] mx-auto mb-4" />
              <p className="text-[#aaaaaa]">Analytics de exceções em desenvolvimento</p>
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
