import { useState, useMemo } from "react";
import { Search, RefreshCw, Trash2, Play, Filter, Clock, FileText, ArrowRightLeft, Download, LogOut, FolderOpen, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NavTabs } from "@/components/maritimo/NavTabs";
import { BadgeStatus } from "@/components/maritimo/BadgeStatus";
import { HistoryModal } from "@/components/maritimo/HistoryModal";
import { FilesModal } from "@/components/maritimo/FilesModal";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useMaritimoItems } from "@/hooks/useMaritimoItems";
import { useMaritimoHistory } from "@/hooks/useMaritimoHistory";
import { useDevAccess } from "@/hooks/useDevAccess";
import { useAuth } from "@/hooks/useAuth";
import { maritimoApi } from "@/services/maritimoApi";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTerminal, faArrowLeft } from "@fortawesome/free-solid-svg-icons";
import dachserBackground from "@/assets/dachser-background.jpg";

export default function SeaAnalysis() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isDevOrAdmin, isLoading: devAccessLoading } = useDevAccess();
  const [activeTab, setActiveTab] = useState<'manifest_hbl' | 'hbl_mbl' | 'invoices_hbl'>('manifest_hbl');
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [periodFilter, setPeriodFilter] = useState("todos");
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isReextracting, setIsReextracting] = useState(false);
  const [filesModalOpen, setFilesModalOpen] = useState(false);
  const [selectedFilesItem, setSelectedFilesItem] = useState<{ id: string; name: string } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 5;

  const { items, isLoading, refetch, deleteItem } = useMaritimoItems(activeTab);
  const { history, isLoading: historyLoading, fetchHistory } = useMaritimoHistory();

  const filteredData = useMemo(() => {
    const now = new Date();
    return items.filter(item => {
      const matchesSearch = 
        item.base_file_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.consignee?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.container?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === "todos" || 
        (statusFilter === "pendente" && item.status !== "completed") ||
        (statusFilter === "realizado" && item.status === "completed");
      
      let matchesPeriod = true;
      if (periodFilter !== "todos" && item.created_at) {
        const itemDate = new Date(item.created_at);
        const daysDiff = Math.floor((now.getTime() - itemDate.getTime()) / (1000 * 60 * 60 * 24));
        matchesPeriod = daysDiff <= parseInt(periodFilter);
      }
      
      return matchesSearch && matchesStatus && matchesPeriod;
    });
  }, [items, searchTerm, statusFilter, periodFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredData.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedData = filteredData.slice((safeCurrentPage - 1) * PAGE_SIZE, safeCurrentPage * PAGE_SIZE);

  const getPageNumbers = () => {
    const pages: (number | '...')[] = [];
    const set = new Set([1, 2, totalPages, totalPages - 1, safeCurrentPage - 1, safeCurrentPage, safeCurrentPage + 1]);
    const arr = Array.from(set).filter(n => n >= 1 && n <= totalPages).sort((a, b) => a - b);
    for (let i = 0; i < arr.length; i++) {
      if (i > 0 && arr[i] !== arr[i - 1] + 1) pages.push('...');
      pages.push(arr[i]);
    }
    return pages;
  };

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };
  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    setCurrentPage(1);
  };
  const handlePeriodChange = (value: string) => {
    setPeriodFilter(value);
    setCurrentPage(1);
  };

  const pendingCount = items.filter(item => 
    item.status === "pendente" || item.status === "queued" || item.status === "processing"
  ).length;

  const handleSubmit = (itemId: string) => {
    if (activeTab === 'manifest_hbl') {
      navigate("/maritimo/submeter-manifest-hbl", { state: { itemId } });
    } else if (activeTab === 'hbl_mbl') {
      navigate("/maritimo/submeter-hbl-mbl", { state: { itemId } });
    } else {
      navigate("/maritimo/invoices-draft-hbl", { state: { itemId } });
    }
  };

  const handleHistory = async (itemId: string) => {
    setSelectedItemId(itemId);
    setHistoryModalOpen(true);
    await fetchHistory(itemId);
  };

  const handleDeleteClick = (itemId: string, fileName: string) => {
    setItemToDelete({ id: itemId, name: fileName });
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    await deleteItem(itemToDelete.id);
    setDeleteDialogOpen(false);
    setItemToDelete(null);
  };

  const handleCadastro = () => {
    if (activeTab === 'manifest_hbl') {
      navigate("/maritimo/cadastro-manifest");
    } else if (activeTab === 'hbl_mbl') {
      navigate("/maritimo/cadastro-hbl");
    }
  };

  const getTabValue = () => {
    switch (activeTab) {
      case 'manifest_hbl': return 'manifest';
      case 'hbl_mbl': return 'hbl';
      case 'invoices_hbl': return 'invoices';
      default: return 'manifest';
    }
  };

  const handleTabChange = (value: string) => {
    switch (value) {
      case 'manifest':
        setActiveTab('manifest_hbl');
        break;
      case 'hbl':
        setActiveTab('hbl_mbl');
        break;
      case 'invoices':
        setActiveTab('invoices_hbl');
        break;
    }
  };

  const handleNovoProcesso = () => {
    navigate('/maritimo/invoices-draft-hbl');
  };

  const handleReextractMetadata = async () => {
    setIsReextracting(true);
    try {
      const result = await maritimoApi.reextractMetadata({ forceAll: true });
      toast.success(`${result.processed} item(s) processado(s)`);
      await refetch();
    } catch (error: any) {
      console.error('Reextract error:', error);
      toast.error('Erro ao reextrair metadados');
    } finally {
      setIsReextracting(false);
    }
  };

  return (
    <div className="min-h-screen text-foreground relative overflow-hidden">
      {/* Background with gradient overlays */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage: `
            radial-gradient(circle at 10% 10%, rgba(255,200,0,0.18) 0%, transparent 35%),
            radial-gradient(circle at 90% 90%, rgba(255,200,0,0.12) 0%, transparent 40%),
            linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.82) 100%),
            url(${dachserBackground})
          `,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "saturate(0.8)",
        }}
      />

      {/* Animated background lines */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <svg className="absolute inset-0 w-full h-full opacity-10">
          <defs>
            <linearGradient id="lineGradientSea" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgb(245, 184, 67)" stopOpacity="0" />
              <stop offset="50%" stopColor="rgb(245, 184, 67)" stopOpacity="0.5" />
              <stop offset="100%" stopColor="rgb(245, 184, 67)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[...Array(5)].map((_, i) => (
            <line
              key={i}
              x1={`${i * 25}%`}
              y1="0"
              x2={`${i * 25 + 50}%`}
              y2="100%"
              stroke="url(#lineGradientSea)"
              strokeWidth="1"
              className="animate-pulse"
              style={{ animationDelay: `${i * 0.5}s` }}
            />
          ))}
        </svg>
      </div>

      {/* Floating particles */}
      <div className="pointer-events-none fixed inset-0 z-0">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-primary/30 rounded-full animate-pulse"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`,
              animationDuration: `${2 + Math.random() * 3}s`,
            }}
          />
        ))}
      </div>

      {/* Back Button */}
      <button
        onClick={() => navigate("/dashboard")}
        className="absolute top-6 left-6 z-20 inline-flex items-center gap-2 px-3.5 py-2.5 rounded-full border border-primary/90 bg-primary/15 text-primary no-underline font-bold text-sm backdrop-blur-sm hover:bg-primary/25 transition-colors"
      >
        <FontAwesomeIcon icon={faArrowLeft} />
        Voltar
      </button>

      <div className="relative z-10 min-h-screen">
        <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
          {/* HEADER */}
          <div className="flex items-center justify-between gap-6 pt-14">
            <div className="flex flex-col gap-1">
              <div className="text-[1.7rem] tracking-[0.22em] uppercase text-foreground">DACHSER</div>
              <div className="text-sm text-muted-foreground">Intelligent Logistics – Maritime Analysis</div>
              <div className="flex gap-2 mt-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_10px_hsl(var(--primary)/0.9)]" />
                <span className="w-1.5 h-1.5 rounded-full bg-primary/70" />
                <span className="w-1.5 h-1.5 rounded-full bg-primary/40" />
              </div>
            </div>

            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <div className="px-4 py-1.5 rounded-full bg-background/70 border border-border/30">
                {user?.email ?? "usuário"}
              </div>

              {!devAccessLoading && isDevOrAdmin && (
                <button
                  type="button"
                  onClick={() => navigate("/maritimo/system-logs")}
                  className="w-8 h-8 rounded-full border border-border/30 bg-background/70 flex items-center justify-center hover:bg-background hover:border-primary/80 transition"
                  title="Logs do sistema"
                >
                  <FontAwesomeIcon icon={faTerminal} className="w-4 h-4 text-primary" />
                </button>
              )}

              {!devAccessLoading && isDevOrAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem("user");
                    navigate("/login");
                  }}
                  className="w-8 h-8 rounded-full border border-border/30 bg-background/70 flex items-center justify-center hover:bg-background hover:border-rose-400/80 transition"
                  title="Sair"
                >
                  <LogOut className="w-4 h-4 text-rose-400" />
                </button>
              )}
            </div>
          </div>

          {/* CARD BUSCA + FILTROS */}
          <div 
            className="rounded-2xl"
            style={{
              background: "rgba(5, 6, 18, 0.9)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              boxShadow: "0 18px 40px rgba(0, 0, 0, 0.85)",
            }}
          >
            <div className="pt-5 pb-4 px-6 space-y-4">
              {/* Busca */}
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Buscar por arquivo, consignee ou container"
                  value={searchTerm}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="h-11 w-full pl-11 pr-4 rounded-full border border-border bg-input text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                />
              </div>

              {/* Linha filtros */}
              <div className="flex flex-wrap items-center gap-4 justify-between">
                <div className="flex flex-wrap items-center gap-4">
                  {/* Status */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-background/60 border border-border/30">
                      <Filter className="h-3.5 w-3.5 text-primary" />
                      <span className="text-[10px] tracking-[0.22em] uppercase text-muted-foreground">Status</span>
                    </div>
                    <Select value={statusFilter} onValueChange={handleStatusChange}>
                      <SelectTrigger className="h-9 w-[150px] rounded-full text-xs">
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos</SelectItem>
                        <SelectItem value="pendente">Pendente</SelectItem>
                        <SelectItem value="realizado">Realizado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Period */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-background/60 border border-border/30">
                      <Clock className="h-3.5 w-3.5 text-primary" />
                      <span className="text-[10px] tracking-[0.22em] uppercase text-muted-foreground">Período</span>
                    </div>
                    <Select value={periodFilter} onValueChange={handlePeriodChange}>
                      <SelectTrigger className="h-9 w-[130px] rounded-full text-xs">
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos</SelectItem>
                        <SelectItem value="7">7 dias</SelectItem>
                        <SelectItem value="30">30 dias</SelectItem>
                        <SelectItem value="90">90 dias</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    onClick={refetch}
                    disabled={isLoading}
                    variant="outline"
                    className="h-9 rounded-full text-xs px-4"
                  >
                    <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                    Atualizar
                  </Button>
                  
                  {!devAccessLoading && isDevOrAdmin && (
                    <Button
                      onClick={handleReextractMetadata}
                      disabled={isReextracting}
                      variant="outline"
                      className="h-9 rounded-full text-xs px-4"
                    >
                      <ArrowRightLeft className={`mr-2 h-4 w-4 ${isReextracting ? 'animate-spin' : ''}`} />
                      {isReextracting ? 'Reextraindo...' : 'Reextrair Metadados'}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* CARD HISTÓRICO */}
          <div 
            className="rounded-2xl"
            style={{
              background: "rgba(5, 6, 18, 0.9)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              boxShadow: "0 18px 40px rgba(0, 0, 0, 0.85)",
            }}
          >
            <div className="pt-5 pb-4 px-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                  <NavTabs activeTab={getTabValue()} onTabChange={handleTabChange} />
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 px-4 py-1 rounded-full bg-background/60 border border-border/30">
                    <Clock className="h-4 w-4 text-primary" />
                    <span className="text-xs text-muted-foreground">
                      Pendentes: <span className="text-primary font-semibold">{pendingCount}</span>
                    </span>
                  </div>
                  {activeTab === 'invoices_hbl' ? (
                    <Button
                      onClick={handleNovoProcesso}
                      className="h-10 rounded-full px-5 font-semibold text-sm"
                    >
                      <Play className="mr-2 h-5 w-5" />
                      Novo Processo
                    </Button>
                  ) : (
                    <Button
                      onClick={handleCadastro}
                      className="h-10 rounded-full px-5 font-semibold text-sm"
                    >
                      <Download className="mr-2 h-5 w-5" />
                      Cadastro de {activeTab === 'manifest_hbl' ? 'Manifest' : 'HBL'}
                    </Button>
                  )}
                </div>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="w-8 h-8 text-primary animate-spin" />
                </div>
              ) : filteredData.length === 0 ? (
                <div className="text-center py-12 text-sm text-muted-foreground">
                  {searchTerm || statusFilter !== "todos"
                    ? "Nenhum item encontrado com os filtros aplicados"
                    : "Nenhum item cadastrado ainda"}
                </div>
              ) : (
                <>
                  <div className="rounded-xl border border-border/30 overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border/30 bg-background/40">
                          <th className="text-left py-3 px-4 text-xs uppercase tracking-[0.18em] text-muted-foreground">Arquivo</th>
                          <th className="text-left py-3 px-4 text-xs uppercase tracking-[0.18em] text-muted-foreground">Consignee</th>
                          <th className="text-left py-3 px-4 text-xs uppercase tracking-[0.18em] text-muted-foreground">Container</th>
                          <th className="text-left py-3 px-4 text-xs uppercase tracking-[0.18em] text-muted-foreground">Status</th>
                          <th className="text-right py-3 px-4 text-xs uppercase tracking-[0.18em] text-muted-foreground">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedData.map((item) => (
                          <tr key={item.id} className="border-b border-border/20 hover:bg-white/5 transition-colors">
                            <td className="py-4 px-4">
                              <span className="text-xs text-foreground">{item.base_file_name}</span>
                            </td>
                            <td className="py-4 px-4 text-xs text-foreground">{item.consignee || '-'}</td>
                            <td className="py-4 px-4 text-xs text-foreground">{item.container || '-'}</td>
                            <td className="py-4 px-4">
                              <BadgeStatus status={item.status} />
                            </td>
                            <td className="py-4 px-4">
                              <div className="flex justify-end gap-1.5">
                                <Button
                                  size="sm"
                                  onClick={() => handleSubmit(item.id)}
                                  className="h-8 rounded-full text-xs px-4 font-semibold"
                                >
                                  <Play className="w-3 h-3 mr-1" />
                                  Submeter
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleHistory(item.id)}
                                  className="h-8 w-8 text-muted-foreground hover:bg-white/10"
                                  title="Histórico"
                                >
                                  <FileText className="h-4 w-4" />
                                </Button>
                                {!devAccessLoading && isDevOrAdmin && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                      setSelectedFilesItem({ id: item.id, name: item.base_file_name });
                                      setFilesModalOpen(true);
                                    }}
                                    className="h-8 w-8 text-blue-400 hover:bg-blue-500/10"
                                    title="Ver arquivos"
                                  >
                                    <FolderOpen className="h-4 w-4" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDeleteClick(item.id, item.base_file_name)}
                                  className="h-8 w-8 text-rose-400 hover:bg-rose-500/10"
                                  title="Excluir"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* PAGINATION */}
                  {filteredData.length > PAGE_SIZE && (
                    <div className="mt-4 flex justify-end">
                      <div className="flex flex-wrap gap-1.5 items-center text-xs bg-background/60 rounded-full border border-border/30 px-2 py-1">
                        <button
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          disabled={safeCurrentPage === 1}
                          className="px-2.5 py-1 rounded-full border border-border/30 bg-background/30 text-foreground cursor-pointer text-xs leading-none transition-colors hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                        >
                          <ChevronLeft className="h-3 w-3" />
                          Anterior
                        </button>
                        <span className="px-1 py-0.5 text-muted-foreground text-xs">
                          Página {safeCurrentPage}/{totalPages}
                        </span>
                        {getPageNumbers().map((page, idx) => 
                          page === '...' ? (
                            <span key={`ellipsis-${idx}`} className="text-muted-foreground px-0.5 text-xs">…</span>
                          ) : (
                            <button
                              key={page}
                              onClick={() => setCurrentPage(page)}
                              className={`px-2.5 py-1 rounded-full border text-xs leading-none transition-colors ${
                                page === safeCurrentPage
                                  ? 'border-primary/90 bg-primary/20 text-primary font-bold'
                                  : 'border-border/30 bg-background/30 text-foreground hover:bg-white/10'
                              }`}
                            >
                              {page}
                            </button>
                          )
                        )}
                        <button
                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                          disabled={safeCurrentPage === totalPages}
                          className="px-2.5 py-1 rounded-full border border-border/30 bg-background/30 text-foreground cursor-pointer text-xs leading-none transition-colors hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                        >
                          Próxima
                          <ChevronRight className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <HistoryModal
        open={historyModalOpen}
        onOpenChange={setHistoryModalOpen}
        analyses={history?.runs.map(run => ({
          id: run.id,
          status: run.status,
          progress_step: run.status,
          result_text: run.result_text,
          json_result: run.json_result,
          error_message: run.json_result?.error_message,
          created_at: run.created_at,
          completed_at: run.updated_at,
          files: run.files
        })) || []}
        itemName={history?.item.base_file_name || ''}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-[rgba(5,6,18,0.95)] border border-white/10 text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl">Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Tem certeza que deseja excluir <strong>{itemToDelete?.name}</strong> permanentemente?
              <br /><br />
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/10 text-foreground border-border/30 hover:bg-white/20">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-rose-600 text-white hover:bg-rose-700">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {selectedFilesItem && (
        <FilesModal
          open={filesModalOpen}
          onOpenChange={setFilesModalOpen}
          itemId={selectedFilesItem.id}
          itemName={selectedFilesItem.name}
        />
      )}
    </div>
  );
}
