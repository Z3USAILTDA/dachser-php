import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, Clock, Copy, ClipboardList, Trash2, FileText, CheckCircle } from "lucide-react";
import { PageLayout } from "@/components/layout/PageLayout";
import { FilterCard, TableCard } from "@/components/layout/PageCard";
import { FilterBar } from "@/components/layout/FilterBar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format } from "date-fns";
import { Filter as FilterIcon } from "lucide-react";

interface ChbItem {
  id: number;
  reference: string;
  consignee: string;
  status_macro: 'pre_alerta_pendente' | 'instrucao_pendente' | 'di_pendente' | 'concluida';
  step1_status: string;
  step2_status: string;
  step3_status: string;
  last_run_at: string | null;
  created_at: string | null;
}

interface HistoryEntry {
  id: number;
  etapa: number;
  status: string;
  result_text: string;
  result_html: string;
  user: string;
  created_at: string;
}

const statusLabels: Record<string, string> = {
  pre_alerta_pendente: "Análise de Pré-Alerta Pendente",
  instrucao_pendente: "Análise de Instrução Pendente",
  di_pendente: "Análise de Itens de DI Pendente",
  concluida: "Concluída"
};

const stepStatusLabel = (s: string) => {
  const map: Record<string, string> = {
    aprovado: "Aprovado",
    pendente: "Pendente",
    success: "Sucesso",
    error: "Erro"
  };
  return map[s?.toLowerCase()] || s;
};

const getStatusColor = (macro: string) => {
  switch (macro) {
    case "pre_alerta_pendente":
      return "text-[#f7e38a]";
    case "instrucao_pendente":
      return "text-[#a8dfff]";
    case "di_pendente":
      return "text-[#cfa8ff]";
    case "concluida":
      return "text-[#66d18f]";
    default:
      return "text-[#aaaaaa]";
  }
};

const stepNames: Record<number, string> = {
  1: 'Pré-Alerta',
  2: 'Instrução',
  3: 'DI/Fechamento',
};

export default function ChbAnalises() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [items, setItems] = useState<ChbItem[]>([]);
  const [historyModal, setHistoryModal] = useState<{
    open: boolean;
    itemId: number | null;
    history: HistoryEntry[];
  }>({
    open: false,
    itemId: null,
    history: []
  });
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    itemId: number | null;
  }>({
    open: false,
    itemId: null
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [novoProcessoModal, setNovoProcessoModal] = useState(false);
  const [novoProcessoForm, setNovoProcessoForm] = useState({
    reference: '',
    consignee: ''
  });

  const pendingCount = items.filter(i => i.status_macro !== "concluida").length;

  const filteredItems = items.filter(item => {
    const matchesSearch = search === "" || item.reference.toLowerCase().includes(search.toLowerCase()) || item.consignee.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "todos" || item.status_macro === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
      toast.success("Dados atualizados");
    }, 800);
  };

  const handleOpenHistory = (itemId: number) => {
    // TODO: Fetch real history from API
    const history: HistoryEntry[] = [];
    setHistoryModal({
      open: true,
      itemId,
      history
    });
  };

  const handleCopyResult = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Resultado copiado!");
  };

  const handleDelete = (itemId: number) => {
    setItems(prev => prev.filter(i => i.id !== itemId));
    setDeleteDialog({
      open: false,
      itemId: null
    });
    toast.success("Item removido com sucesso");
  };

  const handleCreateNovoProcesso = () => {
    if (!novoProcessoForm.reference.trim() || !novoProcessoForm.consignee.trim()) {
      toast.error("Preencha todos os campos");
      return;
    }

    const newId = Date.now();
    const newItem: ChbItem = {
      id: newId,
      reference: novoProcessoForm.reference,
      consignee: novoProcessoForm.consignee,
      status_macro: 'pre_alerta_pendente',
      step1_status: 'pendente',
      step2_status: 'pendente',
      step3_status: 'pendente',
      last_run_at: null,
      created_at: format(new Date(), "yyyy-MM-dd HH:mm")
    };

    setItems(prev => [newItem, ...prev]);
    setNovoProcessoModal(false);
    setNovoProcessoForm({ reference: '', consignee: '' });
    toast.success("Processo criado com sucesso!");
    
    // Navigate to the new process
    navigate(`/chb/conferences/${newId}`);
  };

  const rightContent = (
    <button
      onClick={() => setNovoProcessoModal(true)}
      className="h-8 rounded-full px-4 flex items-center gap-1.5 bg-[#ffc800] text-black font-semibold text-[0.78rem] shadow-[0_0_22px_rgba(255,200,0,.6)] hover:bg-[#f5b843]"
    >
      <Upload className="h-4 w-4" />
      Novo Processo
    </button>
  );

  return (
    <PageLayout
      title="DACHSER"
      subtitle="Desembaraço — Esteira de Análises (CHB)"
      rightContent={rightContent}
      pageIcon={ClipboardList}
      backTo="/dashboard"
    >
      {/* CARD DE BUSCA + FILTROS */}
      <FilterCard>
        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Buscar por referência ou consignee"
          filters={[
            {
              id: "status",
              label: "Status",
              icon: FilterIcon,
              value: statusFilter,
              onChange: setStatusFilter,
              options: [
                { value: "todos", label: "Todos" },
                { value: "pre_alerta_pendente", label: "Análise de Pré-Alerta Pendente" },
                { value: "instrucao_pendente", label: "Análise de Instrução Pendente" },
                { value: "di_pendente", label: "Análise de Itens de DI Pendente" },
                { value: "concluida", label: "Concluída" },
              ],
              width: "200px",
            },
          ]}
          showRefresh
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
        />
      </FilterCard>

      {/* CARD DA TABELA */}
      <TableCard>
        <div className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-[0.86rem] tracking-[0.18em] uppercase text-[#f5f5f5]">RESUMO DE ANÁLISES</div>
              <div className="text-[0.76rem] text-[#aaaaaa] mt-1">
                Fluxo de 3 etapas: Pré-Alerta → Instrução → DI
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-[rgba(255,255,255,.06)] border border-[rgba(255,255,255,.20)] text-[0.75rem]">
                <Clock size={12} className="text-[#ffc800]" />
                <span>Pendentes: <strong className="text-[#f5f5f5]">{pendingCount}</strong></span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-[rgba(255,255,255,.06)] border border-[rgba(255,255,255,.20)] text-[0.75rem]">
                <span className="w-[7px] h-[7px] rounded-full bg-[#ffc800]" />
                <span>{filteredItems.length} registros</span>
              </div>
            </div>
          </div>

          {filteredItems.length === 0 ? (
            <div className="mt-4 p-6 rounded-xl border border-[rgba(255,255,255,.25)] bg-[rgba(255,255,255,.06)] text-center">
              <ClipboardList size={40} className="mx-auto mb-3 text-[#aaaaaa]" />
              <p className="text-[0.85rem] text-[#aaaaaa]">Nenhum processo encontrado.</p>
              <p className="text-[0.75rem] text-[#777] mt-1">Clique em "Novo Processo" para começar.</p>
            </div>
          ) : (
            <div
              className="mt-1.5 max-h-[52vh] overflow-auto rounded-xl border border-[rgba(255,255,255,.16)]"
              style={{
                scrollbarWidth: 'thin',
                scrollbarColor: 'rgba(255,255,255,.35) rgba(255,255,255,.10)'
              }}
            >
              <table className="w-full text-[0.82rem]">
                <thead>
                  <tr className="bg-[#14151c]">
                    <th className="px-[10px] py-[10px] text-left text-[0.75rem] uppercase tracking-[0.12em] text-[#aaaaaa] font-medium sticky top-0 bg-[#14151c] z-[5] border-b border-[rgba(255,255,255,.09)]">Referência</th>
                    <th className="px-[10px] py-[10px] text-left text-[0.75rem] uppercase tracking-[0.12em] text-[#aaaaaa] font-medium sticky top-0 bg-[#14151c] z-[5] border-b border-[rgba(255,255,255,.09)]">Consignee</th>
                    <th className="px-[10px] py-[10px] text-left text-[0.75rem] uppercase tracking-[0.12em] text-[#aaaaaa] font-medium sticky top-0 bg-[#14151c] z-[5] border-b border-[rgba(255,255,255,.09)]">Status</th>
                    <th className="px-[10px] py-[10px] text-left text-[0.75rem] uppercase tracking-[0.12em] text-[#aaaaaa] font-medium sticky top-0 bg-[#14151c] z-[5] border-b border-[rgba(255,255,255,.09)]">Etapas</th>
                    <th className="px-[10px] py-[10px] text-left text-[0.75rem] uppercase tracking-[0.12em] text-[#aaaaaa] font-medium sticky top-0 bg-[#14151c] z-[5] border-b border-[rgba(255,255,255,.09)]">Submeter</th>
                    <th className="px-[10px] py-[10px] text-left text-[0.75rem] uppercase tracking-[0.12em] text-[#aaaaaa] font-medium sticky top-0 bg-[#14151c] z-[5] border-b border-[rgba(255,255,255,.09)]">Data</th>
                    <th className="px-[10px] py-[10px] text-right text-[0.75rem] uppercase tracking-[0.12em] text-[#aaaaaa] font-medium sticky top-0 bg-[#14151c] z-[5] border-b border-[rgba(255,255,255,.09)]">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map(item => (
                    <tr key={item.id} className="border-b border-[rgba(255,255,255,.09)] hover:bg-[rgba(255,255,255,.05)] transition-colors">
                      <td className="px-[10px] py-[9px] whitespace-nowrap font-mono">{item.reference || "—"}</td>
                      <td className="px-[10px] py-[9px] whitespace-nowrap">{item.consignee || "—"}</td>
                      <td className="px-[10px] py-[9px] whitespace-nowrap">
                        <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[rgba(255,255,255,.14)] bg-[#111] text-[0.8rem] ${getStatusColor(item.status_macro)}`}>
                          {statusLabels[item.status_macro] || item.status_macro}
                        </span>
                      </td>
                      <td className="px-[10px] py-[9px] whitespace-nowrap text-[0.78rem] text-[#aaaaaa]">
                        1: {stepStatusLabel(item.step1_status)} · 2: {stepStatusLabel(item.step2_status)} · 3: {stepStatusLabel(item.step3_status)}
                      </td>
                      <td className="px-[10px] py-[9px] whitespace-nowrap">
                        <button
                          onClick={() => navigate(`/chb/conferences/${item.id}`)}
                          className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-[#ffc800] text-black font-semibold text-[0.72rem] hover:bg-[#f5b843]"
                        >
                          <FileText size={12} />
                          Analisar
                        </button>
                      </td>
                      <td className="px-[10px] py-[9px] whitespace-nowrap text-[#aaaaaa]">
                        {item.created_at ? format(new Date(item.created_at), "dd/MM/yyyy HH:mm") : "—"}
                      </td>
                      <td className="px-[10px] py-[9px] whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenHistory(item.id)}
                            className="w-7 h-7 rounded-full border border-[rgba(255,255,255,.25)] flex items-center justify-center text-[#aaaaaa] hover:text-white hover:border-[rgba(255,255,255,.45)] transition-colors"
                            title="Ver histórico"
                          >
                            <CheckCircle size={14} />
                          </button>
                          <button
                            onClick={() => setDeleteDialog({ open: true, itemId: item.id })}
                            className="w-7 h-7 rounded-full border border-[rgba(255,255,255,.25)] flex items-center justify-center text-[#ff6666] hover:text-[#ff4444] hover:border-[#ff4444] transition-colors"
                            title="Excluir"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </TableCard>

      {/* Novo Processo Modal */}
      <Dialog open={novoProcessoModal} onOpenChange={setNovoProcessoModal}>
        <DialogContent className="max-w-md bg-[rgba(5,6,18,.98)] border border-[rgba(255,255,255,.12)]">
          <DialogHeader>
            <DialogTitle className="text-[#f5f5f5]">Novo Processo CHB</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label className="text-[#aaaaaa]">Referência</Label>
              <Input
                placeholder="Ex: CHB-2025-001"
                value={novoProcessoForm.reference}
                onChange={(e) => setNovoProcessoForm(prev => ({ ...prev, reference: e.target.value }))}
                className="bg-[rgba(255,255,255,.05)] border-[rgba(255,255,255,.15)] text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[#aaaaaa]">Consignee</Label>
              <Input
                placeholder="Nome do consignatário"
                value={novoProcessoForm.consignee}
                onChange={(e) => setNovoProcessoForm(prev => ({ ...prev, consignee: e.target.value }))}
                className="bg-[rgba(255,255,255,.05)] border-[rgba(255,255,255,.15)] text-white"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setNovoProcessoModal(false)}
                className="h-8 px-4 rounded-full border border-[rgba(255,255,255,.25)] text-[#aaaaaa] text-[0.78rem] hover:bg-[rgba(255,255,255,.05)]"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateNovoProcesso}
                className="h-8 px-4 rounded-full bg-[#ffc800] text-black font-semibold text-[0.78rem] hover:bg-[#f5b843]"
              >
                Criar Processo
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* History Modal */}
      <Dialog open={historyModal.open} onOpenChange={(open) => setHistoryModal(prev => ({ ...prev, open }))}>
        <DialogContent className="max-w-2xl bg-[rgba(5,6,18,.98)] border border-[rgba(255,255,255,.12)]">
          <DialogHeader>
            <DialogTitle className="text-[#f5f5f5]">Histórico de Análises</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {historyModal.history.length === 0 ? (
              <div className="p-6 text-center text-[#aaaaaa]">
                <CheckCircle size={40} className="mx-auto mb-3 text-[#555]" />
                <p>Nenhuma análise aprovada ainda.</p>
                <p className="text-[0.75rem] text-[#777] mt-1">Execute análises na página de conferência para ver o histórico.</p>
              </div>
            ) : (
              <div className="relative">
                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-white/10" />
                
                {historyModal.history.map((entry) => (
                  <div key={entry.id} className="relative pl-10 mb-4">
                    <div className="absolute left-2 top-2 w-3 h-3 rounded-full bg-amber-500 border-2 border-black flex items-center justify-center">
                      <CheckCircle className="w-1.5 h-1.5 text-black" />
                    </div>
                    
                    <div className="p-3 rounded-lg border border-[rgba(255,255,255,.12)] bg-[rgba(255,255,255,.03)]">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[0.65rem] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium">
                          {stepNames[entry.etapa] || `Etapa ${entry.etapa}`}
                        </span>
                        <span className="text-[0.72rem] text-[#aaaaaa]">
                          {entry.created_at}
                        </span>
                        <span className="text-[0.72rem] text-amber-500">
                          {entry.user}
                        </span>
                        <span className={`ml-auto text-[0.72rem] px-2 py-0.5 rounded-full ${
                          entry.status === 'aprovado' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                        }`}>
                          {entry.status}
                        </span>
                      </div>
                      
                      {/* Render HTML content if available */}
                      {entry.result_html ? (
                        <div 
                          className="text-[0.85rem] text-[#f5f5f5] chb-analysis-content bg-black/20 p-3 rounded border border-white/5"
                          dangerouslySetInnerHTML={{ __html: entry.result_html }}
                        />
                      ) : (
                        <div className="text-[0.85rem] text-[#f5f5f5]">{entry.result_text}</div>
                      )}
                      
                      <button
                        onClick={() => handleCopyResult(entry.result_text || entry.result_html)}
                        className="mt-2 inline-flex items-center gap-1 text-[0.72rem] text-[#ffc800] hover:underline"
                      >
                        <Copy size={12} />
                        Copiar resultado
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog(prev => ({ ...prev, open }))}>
        <AlertDialogContent className="bg-[rgba(5,6,18,.98)] border border-[rgba(255,255,255,.12)]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#f5f5f5]">Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription className="text-[#aaaaaa]">
              Tem certeza que deseja excluir este processo? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-[rgba(255,255,255,.25)] text-[#aaaaaa] hover:bg-[rgba(255,255,255,.05)]">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteDialog.itemId && handleDelete(deleteDialog.itemId)}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* CSS for analysis table styling */}
      <style>{`
        .chb-analysis-content table {
          width: 100%;
          border-collapse: collapse;
          margin: 0.5rem 0;
          font-size: 0.8rem;
        }
        .chb-analysis-content thead {
          background: rgba(255, 255, 255, 0.05);
        }
        .chb-analysis-content th,
        .chb-analysis-content td {
          padding: 0.5rem 0.75rem;
          text-align: left;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .chb-analysis-content th {
          font-weight: 600;
          color: rgba(255, 255, 255, 0.9);
        }
        .chb-analysis-content td {
          color: rgba(255, 255, 255, 0.7);
        }
        .chb-analysis-content p {
          margin: 0.5rem 0;
          color: rgba(255, 255, 255, 0.8);
        }
        .chb-analysis-content ul {
          margin: 0.5rem 0;
          padding-left: 1.5rem;
        }
        .chb-analysis-content li {
          margin: 0.25rem 0;
          color: rgba(255, 255, 255, 0.7);
        }
      `}</style>
    </PageLayout>
  );
}
