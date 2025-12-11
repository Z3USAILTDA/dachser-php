import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { PageLayout } from "@/components/cct/PageLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { StatusExcecao, TipoExcecao } from "@/types/cct";
import { cn } from "@/lib/utils";

const TIPO_LABELS: Record<TipoExcecao, string> = {
  HOUSE_NAO_ENCONTRADO: "House não encontrado",
  API_INDISPONIVEL: "API indisponível",
  DIVERGENCIA_DADOS: "Divergência de dados",
  ATRASO_EVENTO: "Atraso de evento",
};

const TIPO_ICONS: Record<TipoExcecao, React.ElementType> = {
  HOUSE_NAO_ENCONTRADO: FileQuestion,
  API_INDISPONIVEL: Wifi,
  DIVERGENCIA_DADOS: Scale,
  ATRASO_EVENTO: Clock,
};

const STATUS_CONFIG: Record<StatusExcecao, { label: string; color: string; icon: React.ElementType }> = {
  ABERTA: { label: "Aberta", color: "bg-destructive/20 text-destructive border-destructive/30", icon: AlertTriangle },
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
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-card/50 border border-border">
          <TabsTrigger value="lista" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <List className="h-4 w-4 mr-2" />
            Lista de Exceções
          </TabsTrigger>
          <TabsTrigger value="analytics" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <BarChart3 className="h-4 w-4 mr-2" />
            Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="lista" className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className={cn(
              "bg-card/50 cursor-pointer transition-all hover:scale-[1.02]",
              filterStatus === "ABERTA" ? "ring-2 ring-destructive" : "border-destructive/20"
            )} onClick={() => setFilterStatus(filterStatus === "ABERTA" ? "all" : "ABERTA")}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 rounded-lg bg-destructive/20">
                  <AlertTriangle className="h-6 w-6 text-destructive" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats.abertas}</p>
                  <p className="text-sm text-muted-foreground">Abertas</p>
                </div>
              </CardContent>
            </Card>
            
            <Card className={cn(
              "bg-card/50 cursor-pointer transition-all hover:scale-[1.02]",
              filterStatus === "EM_ANALISE" ? "ring-2 ring-yellow-500" : "border-yellow-500/20"
            )} onClick={() => setFilterStatus(filterStatus === "EM_ANALISE" ? "all" : "EM_ANALISE")}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 rounded-lg bg-yellow-500/20">
                  <Eye className="h-6 w-6 text-yellow-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats.emAnalise}</p>
                  <p className="text-sm text-muted-foreground">Em Análise</p>
                </div>
              </CardContent>
            </Card>
            
            <Card className={cn(
              "bg-card/50 cursor-pointer transition-all hover:scale-[1.02]",
              filterStatus === "RESOLVIDA" ? "ring-2 ring-emerald-500" : "border-emerald-500/20"
            )} onClick={() => setFilterStatus(filterStatus === "RESOLVIDA" ? "all" : "RESOLVIDA")}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 rounded-lg bg-emerald-500/20">
                  <CheckCircle className="h-6 w-6 text-emerald-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats.resolvidas}</p>
                  <p className="text-sm text-muted-foreground">Resolvidas</p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border-border">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 rounded-lg bg-muted">
                  <AlertCircle className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats.total}</p>
                  <p className="text-sm text-muted-foreground">Total</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card className="bg-card/50 border-border">
            <CardContent className="p-4">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por house, master ou descrição..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-background/50"
                  />
                </div>
                
                <Select value={filterTipo} onValueChange={setFilterTipo}>
                  <SelectTrigger className="w-full md:w-[200px] bg-background/50">
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os tipos</SelectItem>
                    <SelectItem value="HOUSE_NAO_ENCONTRADO">House não encontrado</SelectItem>
                    <SelectItem value="API_INDISPONIVEL">API indisponível</SelectItem>
                    <SelectItem value="DIVERGENCIA_DADOS">Divergência de dados</SelectItem>
                    <SelectItem value="ATRASO_EVENTO">Atraso de evento</SelectItem>
                  </SelectContent>
                </Select>
                
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-full md:w-[180px] bg-background/50">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os status</SelectItem>
                    <SelectItem value="ABERTA">Aberta</SelectItem>
                    <SelectItem value="EM_ANALISE">Em Análise</SelectItem>
                    <SelectItem value="RESOLVIDA">Resolvida</SelectItem>
                  </SelectContent>
                </Select>
                
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => refetch()}
                  disabled={isLoading}
                >
                  <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Table */}
          <Card className="bg-card/50 border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-primary" />
                Exceções ({filteredExcecoes.length} de {stats.total})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : filteredExcecoes.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhuma exceção encontrada</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-border">
                      <TableHead className="text-muted-foreground">House / Master</TableHead>
                      <TableHead className="text-muted-foreground">Tipo</TableHead>
                      <TableHead className="text-muted-foreground">Descrição</TableHead>
                      <TableHead className="text-muted-foreground">Status</TableHead>
                      <TableHead className="text-muted-foreground text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredExcecoes.map((exc, index) => {
                      const statusConfig = STATUS_CONFIG[exc.status_excecao];
                      const StatusIcon = statusConfig.icon;
                      const TipoIcon = TIPO_ICONS[exc.tipo_excecao] || AlertTriangle;
                      
                      return (
                        <TableRow 
                          key={exc.id}
                          className={cn("border-border", index % 2 === 0 ? "bg-muted/5" : "bg-transparent")}
                        >
                          <TableCell>
                            <div>
                              <p className="font-medium text-foreground font-mono">{exc.shipments?.house || "-"}</p>
                              <p className="text-xs text-muted-foreground">{exc.shipments?.master || "-"}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                              <TipoIcon className="h-3 w-3 mr-1" />
                              {TIPO_LABELS[exc.tipo_excecao]}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[250px]">
                            <p className="text-sm text-muted-foreground truncate">{exc.descricao}</p>
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
                                <Button variant="ghost" size="sm">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="bg-card border-border">
                                {exc.status_excecao === "ABERTA" && (
                                  <DropdownMenuItem onClick={() => handleStatusChange(exc.id, "EM_ANALISE")}>
                                    <Eye className="h-4 w-4 mr-2" />
                                    Iniciar Análise
                                  </DropdownMenuItem>
                                )}
                                {exc.status_excecao !== "RESOLVIDA" && (
                                  <DropdownMenuItem onClick={() => handleStatusChange(exc.id, "RESOLVIDA")}>
                                    <CheckCircle className="h-4 w-4 mr-2" />
                                    Resolver
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => navigate(`/air/cct/processo/${exc.shipment_id}`)}>
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
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <Card className="bg-card/50 border-border p-10 text-center">
            <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Analytics de exceções em desenvolvimento</p>
          </Card>
        </TabsContent>
      </Tabs>
    </PageLayout>
  );
}
