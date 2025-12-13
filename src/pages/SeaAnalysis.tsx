import { useState, useMemo } from "react";
import { RefreshCw, Trash2, Play, FileText, ArrowRightLeft, Download, FolderOpen, Ship } from "lucide-react";
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
import { faTerminal } from "@fortawesome/free-solid-svg-icons";
import { PageLayout } from "@/components/layout/PageLayout";
import { PageCard } from "@/components/layout/PageCard";
import { FilterBar, filterPresets } from "@/components/layout/FilterBar";
import { TablePagination } from "@/components/layout/TablePagination";
import { Clock } from "lucide-react";

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
    let data = [...items];
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      data = data.filter(
        (item) =>
          item.base_file_name?.toLowerCase().includes(q) ||
          item.consignee?.toLowerCase().includes(q) ||
          item.container?.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== "todos") {
      data = data.filter((item) => item.status === statusFilter);
    }
    if (periodFilter !== "todos") {
      const days = parseInt(periodFilter, 10);
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      data = data.filter((item) => {
        const created = new Date(item.created_at).getTime();
        return created >= cutoff;
      });
    }
    return data;
  }, [items, searchTerm, statusFilter, periodFilter]);

  const pendingCount = useMemo(
    () => items.filter((i) => i.status === "pendente").length,
    [items]
  );

  const totalPages = Math.max(1, Math.ceil(filteredData.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedData = filteredData.slice(
    (safeCurrentPage - 1) * PAGE_SIZE,
    safeCurrentPage * PAGE_SIZE
  );


  const getTabValue = () => {
    switch (activeTab) {
      case 'manifest_hbl': return 'manifest';
      case 'hbl_mbl': return 'hbl';
      case 'invoices_hbl': return 'invoices';
      default: return 'manifest';
    }
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

  const handleTabChange = (value: string) => {
    switch (value) {
      case 'manifest': setActiveTab('manifest_hbl'); break;
      case 'hbl': setActiveTab('hbl_mbl'); break;
      case 'invoices': setActiveTab('invoices_hbl'); break;
    }
  };

  const handleNovoProcesso = () => navigate('/maritimo/invoices-draft-hbl');

  const handleCadastro = () => {
    if (activeTab === 'manifest_hbl') navigate("/maritimo/cadastro-manifest");
    else if (activeTab === 'hbl_mbl') navigate("/maritimo/cadastro-hbl");
  };

  const handleSubmit = (id: string) => {
    if (activeTab === 'manifest_hbl') navigate(`/maritimo/submeter-manifest-hbl?itemId=${id}`);
    else if (activeTab === 'hbl_mbl') navigate(`/maritimo/submeter-hbl-mbl?itemId=${id}`);
    else if (activeTab === 'invoices_hbl') navigate(`/maritimo/invoices-draft-hbl?itemId=${id}`);
  };

  const handleHistory = async (id: string) => {
    setSelectedItemId(id);
    await fetchHistory(id);
    setHistoryModalOpen(true);
  };

  const handleDeleteClick = (id: string, name: string) => {
    setItemToDelete({ id, name });
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      await deleteItem(itemToDelete.id);
      toast.success("Item excluído com sucesso");
    } catch (error) {
      toast.error("Erro ao excluir item");
    } finally {
      setDeleteDialogOpen(false);
      setItemToDelete(null);
    }
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

  const rightContent = (
    <>
      {!devAccessLoading && isDevOrAdmin && (
        <button
          type="button"
          onClick={() => navigate("/admin/system-logs")}
          className="w-8 h-8 rounded-full border border-[rgba(255,255,255,.25)] bg-[rgba(0,0,0,.7)] flex items-center justify-center hover:bg-[rgba(0,0,0,.9)] transition"
          title="Logs do sistema"
        >
          <FontAwesomeIcon icon={faTerminal} className="w-4 h-4 text-[#ffc800]" />
        </button>
      )}
    </>
  );

  return (
    <PageLayout title="DACHSER" subtitle="Conferências SEA" rightContent={rightContent} pageIcon={Ship}>
      {/* Card de Filtros */}
      <PageCard>
        <FilterBar
          searchValue={searchTerm}
          onSearchChange={handleSearchChange}
          searchPlaceholder="Buscar por arquivo, consignee ou container"
          filters={[
            filterPresets.status(statusFilter, handleStatusChange),
            filterPresets.period(periodFilter, handlePeriodChange),
          ]}
          showRefresh
          onRefresh={() => refetch()}
          isRefreshing={isLoading}
          rightContent={
            !devAccessLoading && isDevOrAdmin && (
              <button
                onClick={handleReextractMetadata}
                disabled={isReextracting}
                className="h-8 px-4 rounded-full border border-border/50 bg-background/50 text-muted-foreground text-[0.75rem] font-medium flex items-center gap-1.5 hover:bg-background/70 hover:text-foreground transition"
              >
                <ArrowRightLeft className={`w-3.5 h-3.5 ${isReextracting ? 'animate-spin' : ''}`} />
                {isReextracting ? 'Reextraindo...' : 'Reextrair'}
              </button>
            )
          }
        />
      </PageCard>

      {/* Card da Tabela */}
      <PageCard>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <NavTabs activeTab={getTabValue()} onTabChange={handleTabChange} />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[rgba(0,0,0,.5)] border border-[rgba(255,255,255,.22)]">
              <Clock className="h-3.5 w-3.5 text-[#ffc800]" />
              <span className="text-[0.75rem] text-[#aaaaaa]">
                Pendentes: <span className="text-[#ffc800] font-semibold">{pendingCount}</span>
              </span>
            </div>
            {activeTab === 'invoices_hbl' ? (
              <button
                onClick={handleNovoProcesso}
                className="h-8 px-4 rounded-full bg-[#ffc800] text-[#000] text-[0.78rem] font-semibold flex items-center gap-1.5 hover:bg-[#ffdc50] transition shadow-[0_0_20px_rgba(255,200,0,.3)]"
              >
                <Play className="w-4 h-4" />
                Novo Processo
              </button>
            ) : (
              <button
                onClick={handleCadastro}
                className="h-8 px-4 rounded-full bg-[#ffc800] text-[#000] text-[0.78rem] font-semibold flex items-center gap-1.5 hover:bg-[#ffdc50] transition shadow-[0_0_20px_rgba(255,200,0,.3)]"
              >
                <Download className="w-4 h-4" />
                Cadastro de {activeTab === 'manifest_hbl' ? 'Manifest' : 'HBL'}
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-8 h-8 text-[#ffc800] animate-spin" />
          </div>
        ) : filteredData.length === 0 ? (
          <div className="text-center py-12 text-[0.85rem] text-[#aaaaaa]">
            {searchTerm || statusFilter !== "todos"
              ? "Nenhum item encontrado com os filtros aplicados"
              : "Nenhum item cadastrado ainda"}
          </div>
        ) : (
          <>
            <div className="rounded-xl overflow-hidden border border-[rgba(255,255,255,.09)]">
              <table className="w-full">
                <thead>
                  <tr className="bg-[#14151c]">
                    <th className="px-[10px] py-[10px] text-left text-[0.75rem] uppercase tracking-[0.12em] text-[#aaaaaa] font-medium border-b border-[rgba(255,255,255,.09)]">Arquivo</th>
                    <th className="px-[10px] py-[10px] text-left text-[0.75rem] uppercase tracking-[0.12em] text-[#aaaaaa] font-medium border-b border-[rgba(255,255,255,.09)]">Consignee</th>
                    <th className="px-[10px] py-[10px] text-left text-[0.75rem] uppercase tracking-[0.12em] text-[#aaaaaa] font-medium border-b border-[rgba(255,255,255,.09)]">Container</th>
                    <th className="px-[10px] py-[10px] text-left text-[0.75rem] uppercase tracking-[0.12em] text-[#aaaaaa] font-medium border-b border-[rgba(255,255,255,.09)]">Status</th>
                    <th className="px-[10px] py-[10px] text-right text-[0.75rem] uppercase tracking-[0.12em] text-[#aaaaaa] font-medium border-b border-[rgba(255,255,255,.09)]">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedData.map((item) => (
                    <tr key={item.id} className="border-b border-[rgba(255,255,255,.06)] hover:bg-[rgba(255,255,255,.03)] transition-colors">
                      <td className="px-[10px] py-[9px] text-[0.82rem] text-[#f5f5f5]">{item.base_file_name}</td>
                      <td className="px-[10px] py-[9px] text-[0.82rem] text-[#aaaaaa]">{item.consignee || '-'}</td>
                      <td className="px-[10px] py-[9px] text-[0.82rem] text-[#aaaaaa]">{item.container || '-'}</td>
                      <td className="px-[10px] py-[9px]">
                        <BadgeStatus status={item.status} />
                      </td>
                      <td className="px-[10px] py-[9px]">
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => handleSubmit(item.id)}
                            className="h-7 px-3 rounded-full bg-[#ffc800] text-[#000] text-[0.75rem] font-semibold flex items-center gap-1 hover:bg-[#ffdc50] transition"
                          >
                            <Play className="w-3 h-3" />
                            Submeter
                          </button>
                          <button
                            onClick={() => handleHistory(item.id)}
                            className="w-7 h-7 rounded-full border border-[rgba(255,255,255,.2)] bg-transparent text-[#aaaaaa] flex items-center justify-center hover:bg-[rgba(255,255,255,.1)] hover:text-white transition"
                            title="Histórico"
                          >
                            <FileText className="h-3.5 w-3.5" />
                          </button>
                          {!devAccessLoading && isDevOrAdmin && (
                            <button
                              onClick={() => {
                                setSelectedFilesItem({ id: item.id, name: item.base_file_name });
                                setFilesModalOpen(true);
                              }}
                              className="w-7 h-7 rounded-full border border-blue-400/30 bg-transparent text-blue-400 flex items-center justify-center hover:bg-blue-500/10 transition"
                              title="Ver arquivos"
                            >
                              <FolderOpen className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteClick(item.id, item.base_file_name)}
                            className="w-7 h-7 rounded-full border border-rose-400/30 bg-transparent text-rose-400 flex items-center justify-center hover:bg-rose-500/10 transition"
                            title="Excluir"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {filteredData.length > PAGE_SIZE && (
              <TablePagination
                currentPage={safeCurrentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                maxVisiblePages={5}
                showFirstLast={false}
              />
            )}
          </>
        )}
      </PageCard>

      <HistoryModal
        open={historyModalOpen}
        onOpenChange={setHistoryModalOpen}
        analyses={history?.runs.map(run => ({
          id: run.id,
          status: run.status,
          result_text: run.result_text,
          result_html: run.result_html,
          json_result: run.json_result,
          created_at: run.created_at,
          updated_at: run.updated_at,
          created_by: run.created_by,
          files: run.files?.map(f => ({
            id: f.id,
            file_name: f.file_name,
            file_type: f.file_type,
            file_url: f.file_url,
            source: f.source
          }))
        })) || []}
        itemName={history?.item.base_file_name || ''}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent style={{ background: 'rgba(5,6,18,0.95)', border: '1px solid rgba(255,255,255,.12)' }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl text-[#f5f5f5]">Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription className="text-[#aaaaaa]">
              Tem certeza que deseja excluir <strong>{itemToDelete?.name}</strong> permanentemente?
              <br /><br />
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-[rgba(255,255,255,.1)] text-[#f5f5f5] border-[rgba(255,255,255,.2)] hover:bg-[rgba(255,255,255,.2)]">Cancelar</AlertDialogCancel>
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
    </PageLayout>
  );
}