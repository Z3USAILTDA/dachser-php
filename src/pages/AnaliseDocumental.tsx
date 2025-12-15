import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FileSearch, Play, Trash2, FileText, RefreshCw, Clock } from "lucide-react";
import { useUsageLog } from "@/hooks/useUsageLog";
import { useAuth } from "@/hooks/useAuth";
import { PageLayout } from "@/components/layout/PageLayout";
import { PageCard } from "@/components/layout/PageCard";
import { FilterBar, filterPresets } from "@/components/layout/FilterBar";
import { TablePagination } from "@/components/layout/TablePagination";
import { BadgeStatus } from "@/components/maritimo/BadgeStatus";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { format } from "date-fns";

// Mock data for now - will be replaced with MariaDB integration later
interface AnaliseProcess {
  id: string;
  pdf_name: string;
  excel_name: string;
  status: "pendente" | "realizado" | "erro";
  success_count: number;
  warning_count: number;
  error_count: number;
  created_at: string;
  created_by?: string;
}
const AnaliseDocumental = () => {
  useUsageLog({ endpoint: "/fin/analise-documental" });
  const navigate = useNavigate();
  const {
    user,
    isLoading: authLoading
  } = useAuth();
  const [processes, setProcesses] = useState<AnaliseProcess[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [periodFilter, setPeriodFilter] = useState("todos");
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const PAGE_SIZE = 10;
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/login");
    }
  }, [user, authLoading, navigate]);
  const filteredData = useMemo(() => {
    let data = [...processes];
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      data = data.filter(item => item.pdf_name?.toLowerCase().includes(q) || item.excel_name?.toLowerCase().includes(q) || item.created_by?.toLowerCase().includes(q));
    }
    if (statusFilter !== "todos") {
      data = data.filter(item => item.status === statusFilter);
    }
    if (periodFilter !== "todos") {
      const days = parseInt(periodFilter, 10);
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      data = data.filter(item => {
        const created = new Date(item.created_at).getTime();
        return created >= cutoff;
      });
    }
    return data;
  }, [processes, searchTerm, statusFilter, periodFilter]);
  const pendingCount = useMemo(() => processes.filter(p => p.status === "pendente").length, [processes]);
  const totalPages = Math.max(1, Math.ceil(filteredData.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedData = filteredData.slice((safeCurrentPage - 1) * PAGE_SIZE, safeCurrentPage * PAGE_SIZE);
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
  const handleRefresh = () => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      toast.success("Dados atualizados");
    }, 500);
  };
  const handleNovoProcesso = () => {
    navigate("/fin/analise-documental/comparar");
  };
  const handleViewDetails = (id: string) => {
    // TODO: Navigate to details or open modal
    toast.info(`Visualizar detalhes do processo ${id}`);
  };
  const handleDeleteClick = (id: string, name: string) => {
    setItemToDelete({
      id,
      name
    });
    setDeleteDialogOpen(true);
  };
  const confirmDelete = () => {
    if (!itemToDelete) return;
    setProcesses(prev => prev.filter(p => p.id !== itemToDelete.id));
    toast.success("Processo excluído com sucesso");
    setDeleteDialogOpen(false);
    setItemToDelete(null);
  };
  const getResultBadge = (process: AnaliseProcess) => {
    if (process.status === "pendente") {
      return <span className="text-white/40">-</span>;
    }
    return <div className="flex items-center gap-2">
        {process.success_count > 0 && <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-medium">
            {process.success_count} ✓
          </span>}
        {process.warning_count > 0 && <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-xs font-medium">
            {process.warning_count} ⚠
          </span>}
        {process.error_count > 0 && <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 text-xs font-medium">
            {process.error_count} ✗
          </span>}
      </div>;
  };
  if (authLoading) {
    return <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white/60">Carregando...</div>
      </div>;
  }
  return <PageLayout title="DACHSER" subtitle="Análise Documental" pageIcon={FileSearch} backTo="/dashboard">
      {/* Card de Filtros */}
      <PageCard>
        <FilterBar searchValue={searchTerm} onSearchChange={handleSearchChange} searchPlaceholder="Buscar por arquivo ou usuário" filters={[filterPresets.status(statusFilter, handleStatusChange), filterPresets.period(periodFilter, handlePeriodChange)]} showRefresh onRefresh={handleRefresh} isRefreshing={isLoading} />
      </PageCard>

      {/* Card da Tabela */}
      <PageCard>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white/90">Histórico de Comparações</h2>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[rgba(0,0,0,.5)] border border-[rgba(255,255,255,.22)]">
              <Clock className="h-3.5 w-3.5 text-[#ffc800]" />
              <span className="text-[0.75rem] text-[#aaaaaa]">
                Pendentes: <span className="text-[#ffc800] font-semibold">{pendingCount}</span>
              </span>
            </div>
            <button onClick={handleNovoProcesso} className="h-8 px-4 rounded-full bg-[#ffc800] text-[#000] text-[0.78rem] font-semibold flex items-center gap-1.5 hover:bg-[#ffdc50] transition shadow-[0_0_20px_rgba(255,200,0,.3)]">
              <Play className="w-4 h-4" />
              Novo Processo
            </button>
          </div>
        </div>

        {isLoading ? <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-8 h-8 text-[#ffc800] animate-spin" />
          </div> : filteredData.length === 0 ? <div className="text-center py-12 text-[0.85rem] text-[#aaaaaa]">
            {searchTerm || statusFilter !== "todos" ? "Nenhum item encontrado com os filtros aplicados" : "Nenhuma comparação realizada ainda. Clique em \"Novo Processo\" para começar."}
          </div> : <>
            <div className="rounded-xl overflow-hidden border border-[rgba(255,255,255,.09)]">
              <table className="w-full">
                <thead>
                  <tr className="bg-[#14151c]">
                    <th className="px-[10px] py-[10px] text-left text-[0.75rem] uppercase tracking-[0.12em] text-[#aaaaaa] font-medium border-b border-[rgba(255,255,255,.09)]">
                      PDF
                    </th>
                    <th className="px-[10px] py-[10px] text-left text-[0.75rem] uppercase tracking-[0.12em] text-[#aaaaaa] font-medium border-b border-[rgba(255,255,255,.09)]">
                      Excel
                    </th>
                    <th className="px-[10px] py-[10px] text-left text-[0.75rem] uppercase tracking-[0.12em] text-[#aaaaaa] font-medium border-b border-[rgba(255,255,255,.09)]">
                      Resultado
                    </th>
                    <th className="px-[10px] py-[10px] text-left text-[0.75rem] uppercase tracking-[0.12em] text-[#aaaaaa] font-medium border-b border-[rgba(255,255,255,.09)]">
                      Status
                    </th>
                    <th className="px-[10px] py-[10px] text-left text-[0.75rem] uppercase tracking-[0.12em] text-[#aaaaaa] font-medium border-b border-[rgba(255,255,255,.09)]">
                      Data
                    </th>
                    <th className="px-[10px] py-[10px] text-right text-[0.75rem] uppercase tracking-[0.12em] text-[#aaaaaa] font-medium border-b border-[rgba(255,255,255,.09)]">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedData.map(item => <tr key={item.id} className="border-b border-[rgba(255,255,255,.06)] hover:bg-[rgba(255,255,255,.03)] transition-colors">
                      <td className="px-[10px] py-[9px] text-[0.82rem] text-[#f5f5f5]">
                        {item.pdf_name}
                      </td>
                      <td className="px-[10px] py-[9px] text-[0.82rem] text-[#aaaaaa]">
                        {item.excel_name}
                      </td>
                      <td className="px-[10px] py-[9px]">{getResultBadge(item)}</td>
                      <td className="px-[10px] py-[9px]">
                        <BadgeStatus status={item.status} />
                      </td>
                      <td className="px-[10px] py-[9px] text-[0.82rem] text-[#aaaaaa]">
                        {format(new Date(item.created_at), "dd/MM/yyyy HH:mm")}
                      </td>
                      <td className="px-[10px] py-[9px]">
                        <div className="flex justify-end gap-1.5">
                          <button onClick={() => handleViewDetails(item.id)} className="w-7 h-7 rounded-full border border-[rgba(255,255,255,.2)] bg-transparent text-[#aaaaaa] flex items-center justify-center hover:bg-[rgba(255,255,255,.1)] hover:text-white transition" title="Ver detalhes">
                            <FileText className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => handleDeleteClick(item.id, item.pdf_name)} className="w-7 h-7 rounded-full border border-rose-400/30 bg-transparent text-rose-400 flex items-center justify-center hover:bg-rose-500/10 transition" title="Excluir">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>)}
                </tbody>
              </table>
            </div>

            {filteredData.length > PAGE_SIZE && <TablePagination currentPage={safeCurrentPage} totalPages={totalPages} onPageChange={setCurrentPage} maxVisiblePages={5} showFirstLast={false} />}
          </>}
      </PageCard>

      {/* Footer with legend */}
      

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent style={{
        background: "rgba(5,6,18,0.95)",
        border: "1px solid rgba(255,255,255,.12)"
      }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl text-[#f5f5f5]">Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription className="text-[#aaaaaa]">
              Tem certeza que deseja excluir a comparação de{" "}
              <strong>{itemToDelete?.name}</strong> permanentemente?
              <br />
              <br />
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-[rgba(255,255,255,.1)] text-[#f5f5f5] border-[rgba(255,255,255,.2)] hover:bg-[rgba(255,255,255,.2)]">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-rose-600 text-white hover:bg-rose-700">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageLayout>;
};
export default AnaliseDocumental;