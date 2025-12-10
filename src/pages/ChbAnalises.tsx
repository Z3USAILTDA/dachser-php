import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Filter, RotateCcw, Upload, Clock, Copy, FileText, Trash2 } from "lucide-react";
import { PageLayout } from "@/components/layout/PageLayout";
import { PageCard, FilterCard, TableCard } from "@/components/layout/PageCard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { format } from "date-fns";

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
  created_at: string;
}

const mockItems: ChbItem[] = [{
  id: 1,
  reference: "CHB-2025-001",
  consignee: "Empresa ABC Ltda",
  status_macro: "pre_alerta_pendente",
  step1_status: "pendente",
  step2_status: "pendente",
  step3_status: "pendente",
  last_run_at: "2025-01-10 14:30",
  created_at: "2025-01-05 10:00"
}, {
  id: 2,
  reference: "CHB-2025-002",
  consignee: "Indústria XYZ S.A.",
  status_macro: "instrucao_pendente",
  step1_status: "aprovado",
  step2_status: "pendente",
  step3_status: "pendente",
  last_run_at: "2025-01-09 10:15",
  created_at: "2025-01-04 09:30"
}, {
  id: 3,
  reference: "CHB-2025-003",
  consignee: "Comércio Delta",
  status_macro: "di_pendente",
  step1_status: "aprovado",
  step2_status: "aprovado",
  step3_status: "pendente",
  last_run_at: "2025-01-08 16:45",
  created_at: "2025-01-03 14:00"
}, {
  id: 4,
  reference: "CHB-2025-004",
  consignee: "Tech Solutions",
  status_macro: "concluida",
  step1_status: "aprovado",
  step2_status: "aprovado",
  step3_status: "aprovado",
  last_run_at: "2025-01-07 09:20",
  created_at: "2025-01-02 11:00"
}, {
  id: 5,
  reference: "CHB-2025-005",
  consignee: "Global Imports",
  status_macro: "pre_alerta_pendente",
  step1_status: "pendente",
  step2_status: "pendente",
  step3_status: "pendente",
  last_run_at: null,
  created_at: "2025-01-06 08:45"
}];

const mockHistory: Record<number, HistoryEntry[]> = {
  1: [],
  2: [{
    id: 1,
    etapa: 1,
    status: "aprovado",
    result_text: "Pré-Alerta conferido. Documentos OK.",
    result_html: "",
    created_at: "2025-01-08 11:30"
  }],
  3: [{
    id: 1,
    etapa: 1,
    status: "aprovado",
    result_text: "Pré-Alerta conferido. Sem divergências.",
    result_html: "",
    created_at: "2025-01-06 14:20"
  }, {
    id: 2,
    etapa: 2,
    status: "aprovado",
    result_text: "Instrução validada. Tokens conferidos.",
    result_html: "",
    created_at: "2025-01-07 10:45"
  }],
  4: [{
    id: 1,
    etapa: 1,
    status: "aprovado",
    result_text: "Pré-Alerta OK.",
    result_html: "",
    created_at: "2025-01-05 09:00"
  }, {
    id: 2,
    etapa: 2,
    status: "aprovado",
    result_text: "Instrução OK.",
    result_html: "",
    created_at: "2025-01-06 11:00"
  }, {
    id: 3,
    etapa: 3,
    status: "aprovado",
    result_text: "DI finalizada com sucesso.",
    result_html: "",
    created_at: "2025-01-07 09:20"
  }],
  5: []
};

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

export default function ChbAnalises() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [items, setItems] = useState<ChbItem[]>(mockItems);
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
    const history = mockHistory[itemId] || [];
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

  const rightContent = (
    <button
      onClick={() => navigate("/chb/cadastro-pre-alerta")}
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
    >
      {/* CARD DE BUSCA + FILTROS */}
      <FilterCard>
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#aaaaaa]" />
            <input
              type="text"
              placeholder="Buscar por referência ou consignee"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-9 w-full pl-10 pr-4 rounded-full border border-[rgba(255,255,255,.14)] bg-[#13141a] text-[#f5f5f5] text-[0.78rem] placeholder:text-[#666] focus:outline-none focus:border-[#ffc800] focus:shadow-[0_0_0_1px_rgba(255,200,0,.8)]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Status Filter */}
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[rgba(0,0,0,.5)] border border-[rgba(255,255,255,.22)]">
                <Filter className="h-3 w-3 text-[#ffc800]" />
                <span className="text-[0.68rem] tracking-[0.1em] uppercase text-[#aaaaaa]">Status</span>
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 w-[200px] rounded-full bg-[#13141a] border border-[rgba(255,255,255,.14)] text-[0.78rem]">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="pre_alerta_pendente">Análise de Pré-Alerta Pendente</SelectItem>
                  <SelectItem value="instrucao_pendente">Análise de Instrução Pendente</SelectItem>
                  <SelectItem value="di_pendente">Análise de Itens de DI Pendente</SelectItem>
                  <SelectItem value="concluida">Concluída</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-[rgba(255,255,255,.05)] border border-[rgba(255,255,255,.25)] text-[#f5f5f5] text-[0.78rem] font-semibold hover:bg-[rgba(255,255,255,.08)] disabled:opacity-50"
            >
              <RotateCcw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              Atualizar
            </button>
          </div>
        </div>
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
            <div className="mt-4 p-3 rounded-xl border border-[rgba(255,255,255,.25)] bg-[rgba(255,255,255,.06)] text-[0.85rem] text-[#aaaaaa]">
              Nenhum processo encontrado.
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
                            <Clock size={14} />
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

      {/* History Modal */}
      <Dialog open={historyModal.open} onOpenChange={(open) => setHistoryModal(prev => ({ ...prev, open }))}>
        <DialogContent className="max-w-lg bg-[rgba(5,6,18,.98)] border border-[rgba(255,255,255,.12)]">
          <DialogHeader>
            <DialogTitle className="text-[#f5f5f5]">Histórico de Análises</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {historyModal.history.length === 0 ? (
              <div className="p-4 text-center text-[#aaaaaa]">
                Nenhuma análise realizada ainda.
              </div>
            ) : (
              historyModal.history.map((entry) => (
                <div key={entry.id} className="p-3 rounded-lg border border-[rgba(255,255,255,.12)] bg-[rgba(255,255,255,.03)]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[0.75rem] text-[#aaaaaa]">
                      Etapa {entry.etapa} • {entry.created_at}
                    </span>
                    <span className={`text-[0.72rem] px-2 py-0.5 rounded-full ${
                      entry.status === 'aprovado' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                    }`}>
                      {entry.status}
                    </span>
                  </div>
                  <div className="text-[0.85rem] text-[#f5f5f5]">{entry.result_text}</div>
                  <button
                    onClick={() => handleCopyResult(entry.result_text)}
                    className="mt-2 inline-flex items-center gap-1 text-[0.72rem] text-[#ffc800] hover:underline"
                  >
                    <Copy size={12} />
                    Copiar resultado
                  </button>
                </div>
              ))
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
    </PageLayout>
  );
}
