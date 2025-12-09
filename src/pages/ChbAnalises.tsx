import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Search, Filter, RotateCcw, Upload, Play, ClipboardList, Trash2, Clock, Copy, Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import dachserBg from "@/assets/dachser-background.jpg";

interface ChbItem {
  id: number;
  reference: string;
  consignee: string;
  status_macro: 'pre_alerta_pendente' | 'instrucao_pendente' | 'di_pendente' | 'concluida';
  step1_status: string;
  step2_status: string;
  step3_status: string;
  last_run_at: string | null;
}

interface HistoryEntry {
  id: number;
  etapa: number;
  status: string;
  result_text: string;
  result_html: string;
  created_at: string;
}

const mockItems: ChbItem[] = [
  { id: 1, reference: "CHB-2025-001", consignee: "Empresa ABC Ltda", status_macro: "pre_alerta_pendente", step1_status: "pendente", step2_status: "pendente", step3_status: "pendente", last_run_at: "2025-01-10 14:30" },
  { id: 2, reference: "CHB-2025-002", consignee: "Indústria XYZ S.A.", status_macro: "instrucao_pendente", step1_status: "aprovado", step2_status: "pendente", step3_status: "pendente", last_run_at: "2025-01-09 10:15" },
  { id: 3, reference: "CHB-2025-003", consignee: "Comércio Delta", status_macro: "di_pendente", step1_status: "aprovado", step2_status: "aprovado", step3_status: "pendente", last_run_at: "2025-01-08 16:45" },
  { id: 4, reference: "CHB-2025-004", consignee: "Tech Solutions", status_macro: "concluida", step1_status: "aprovado", step2_status: "aprovado", step3_status: "aprovado", last_run_at: "2025-01-07 09:20" },
  { id: 5, reference: "CHB-2025-005", consignee: "Global Imports", status_macro: "pre_alerta_pendente", step1_status: "pendente", step2_status: "pendente", step3_status: "pendente", last_run_at: null },
];

const mockHistory: Record<number, HistoryEntry[]> = {
  1: [],
  2: [
    { id: 1, etapa: 1, status: "aprovado", result_text: "Pré-Alerta conferido. Documentos OK.", result_html: "", created_at: "2025-01-08 11:30" }
  ],
  3: [
    { id: 1, etapa: 1, status: "aprovado", result_text: "Pré-Alerta conferido. Sem divergências.", result_html: "", created_at: "2025-01-06 14:20" },
    { id: 2, etapa: 2, status: "aprovado", result_text: "Instrução validada. Tokens conferidos.", result_html: "", created_at: "2025-01-07 10:45" }
  ],
  4: [
    { id: 1, etapa: 1, status: "aprovado", result_text: "Pré-Alerta OK.", result_html: "", created_at: "2025-01-05 09:00" },
    { id: 2, etapa: 2, status: "aprovado", result_text: "Instrução OK.", result_html: "", created_at: "2025-01-06 11:00" },
    { id: 3, etapa: 3, status: "aprovado", result_text: "DI finalizada com sucesso.", result_html: "", created_at: "2025-01-07 09:20" }
  ],
  5: []
};

const statusLabels: Record<string, string> = {
  pre_alerta_pendente: "Análise de Pré-Alerta Pendente",
  instrucao_pendente: "Análise de Instrução Pendente",
  di_pendente: "Análise de Itens de DI Pendente",
  concluida: "Concluída"
};

const stepStatusLabel = (s: string) => {
  const map: Record<string, string> = { aprovado: "Aprovado", pendente: "Pendente", success: "Sucesso", error: "Erro" };
  return map[s?.toLowerCase()] || s;
};

const getStatusColor = (macro: string) => {
  switch (macro) {
    case "pre_alerta_pendente": return "text-[#f7e38a]";
    case "instrucao_pendente": return "text-[#a8dfff]";
    case "di_pendente": return "text-[#cfa8ff]";
    case "concluida": return "text-[#66d18f]";
    default: return "text-[#aaaaaa]";
  }
};

export default function ChbAnalises() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [items, setItems] = useState<ChbItem[]>(mockItems);
  const [historyModal, setHistoryModal] = useState<{ open: boolean; itemId: number | null; history: HistoryEntry[] }>({ open: false, itemId: null, history: [] });
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; itemId: number | null }>({ open: false, itemId: null });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const pendingCount = items.filter(i => i.status_macro !== "concluida").length;

  const filteredItems = items.filter(item => {
    const matchesSearch = search === "" || 
      item.reference.toLowerCase().includes(search.toLowerCase()) ||
      item.consignee.toLowerCase().includes(search.toLowerCase());
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

  const handleClearFilters = () => {
    setSearch("");
    setStatusFilter("todos");
  };

  const handleOpenHistory = (itemId: number) => {
    const history = mockHistory[itemId] || [];
    setHistoryModal({ open: true, itemId, history });
  };

  const handleCopyResult = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Resultado copiado!");
  };

  const handleDelete = (itemId: number) => {
    setItems(prev => prev.filter(i => i.id !== itemId));
    setDeleteDialog({ open: false, itemId: null });
    toast.success("Item removido com sucesso");
  };

  return (
    <div className="min-h-screen relative overflow-x-hidden">
      {/* Background with image and gradient overlay */}
      <div className="fixed inset-0 z-0">
        <div 
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${dachserBg})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div 
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(120deg, rgba(4, 17, 45, 0.92), rgba(26, 93, 173, 0.55))',
          }}
        />
        
        {/* Radial gradient overlay */}
        <div 
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse at 20% 20%, rgba(245, 184, 67, 0.12) 0%, transparent 50%),
              radial-gradient(ellipse at 80% 80%, rgba(245, 184, 67, 0.08) 0%, transparent 50%)
            `
          }}
        />
        
        {/* Animated Lines */}
        <div className="absolute inset-0 opacity-20">
          {[...Array(6)].map((_, i) => (
            <div
              key={`line-${i}`}
              className="absolute h-full w-px bg-gradient-to-b from-primary/70 to-primary/10"
              style={{
                left: `${15 + i * 14}%`,
                transform: `skewX(${-20 + i * 8}deg)`,
              }}
            />
          ))}
        </div>

        {/* Floating Particles */}
        {[...Array(20)].map((_, i) => (
          <div
            key={`particle-${i}`}
            className="absolute w-1 h-1 rounded-full bg-primary/40 animate-float"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 5}s`,
              animationDuration: `${4 + Math.random() * 4}s`,
            }}
          />
        ))}
      </div>

      {/* Top Header Bar */}
      <div className="relative z-10 max-w-[95%] mx-auto px-2 pt-5 pb-4 flex items-center justify-between">
        {/* Left - Back + Header */}
        <div className="flex items-center gap-[18px]">
          <button
            onClick={() => navigate("/dashboard")}
            className="w-8 h-8 rounded-full border border-white/12 bg-[rgba(5,6,18,0.9)] text-white/80 flex items-center justify-center backdrop-blur-sm hover:bg-[rgba(5,6,18,1)] hover:text-white transition-all"
          >
            <ArrowLeft size={16} />
          </button>

          <header>
            <h1 className="text-[1.6rem] tracking-[0.24em] uppercase text-[#f5f5f5]">DACHSER</h1>
            <p className="text-[0.9rem] text-[#aaaaaa] mt-0.5">
              Desembaraço — Análises (CHB)
            </p>
            <div className="flex gap-1.5 mt-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#ffc800] shadow-[0_0_10px_rgba(255,200,0,.9)]" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#ffc800] shadow-[0_0_10px_rgba(255,200,0,.9)]" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#ffc800] shadow-[0_0_10px_rgba(255,200,0,.9)]" />
            </div>
          </header>
        </div>

        {/* Right - User */}
        <div className="flex items-center gap-2.5 text-[0.85rem]">
          <div className="px-[14px] py-1.5 rounded-full bg-[rgba(0,0,0,.70)] border border-[rgba(255,255,255,.18)] text-[#aaaaaa] max-w-[220px] truncate">
            @{user?.username || user?.email || "usuario.chb"}
          </div>
          <div className="w-8 h-8 rounded-full border border-[rgba(255,255,255,.25)] flex items-center justify-center bg-[rgba(0,0,0,.7)] text-[#ffc800]">
            <ClipboardList size={16} />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="relative z-10 max-w-[95%] mx-auto mb-12 px-2 space-y-[18px]">
        {/* CARD DE BUSCA + FILTROS */}
        <section 
          className="rounded-2xl p-4"
          style={{
            background: 'rgba(5,6,18,.9)',
            border: '1px solid rgba(255,255,255,.12)',
            boxShadow: '0 18px 40px rgba(0,0,0,.85)',
          }}
        >
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

            <div className="flex flex-wrap items-center gap-3 justify-between">
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

              <button 
                onClick={() => navigate("/chb/cadastro-pre-alerta")}
                className="h-8 rounded-full px-4 flex items-center gap-1.5 bg-[#ffc800] text-black font-semibold text-[0.78rem] shadow-[0_0_22px_rgba(255,200,0,.6)] hover:bg-[#f5b843]"
              >
                <Upload className="h-4 w-4" />
                Cadastro de Pré-Alerta
              </button>
            </div>
          </div>
        </section>

        {/* CARD DA TABELA */}
        <section 
          className="rounded-2xl p-[14px_16px_12px]"
          style={{
            background: 'rgba(4,5,15,.94)',
            border: '1px solid rgba(255,255,255,.12)',
            boxShadow: '0 18px 40px rgba(0,0,0,.9)',
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-[0.86rem] tracking-[0.18em] uppercase text-[#f5f5f5]">
                Esteira de análises CHB
              </div>
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
                    <th className="px-[10px] py-[10px] text-left text-[0.75rem] uppercase tracking-[0.12em] text-[#aaaaaa] font-medium sticky top-0 bg-[#14151c] z-[5] border-b border-[rgba(255,255,255,.09)]">Histórico</th>
                    <th className="px-[10px] py-[10px] text-right text-[0.75rem] uppercase tracking-[0.12em] text-[#aaaaaa] font-medium sticky top-0 bg-[#14151c] z-[5] border-b border-[rgba(255,255,255,.09)]">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <tr 
                      key={item.id}
                      className="border-b border-[rgba(255,255,255,.09)] hover:bg-[rgba(255,255,255,.05)] transition-colors"
                    >
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
                          className="h-8 px-3 rounded-xl flex items-center gap-1.5 bg-[#ffc800] text-[#111] font-bold text-[0.8rem] hover:bg-[#ffd940] transition-all"
                        >
                          <Play size={14} />
                          Analisar
                        </button>
                      </td>
                      <td className="px-[10px] py-[9px] whitespace-nowrap">
                        <button
                          onClick={() => handleOpenHistory(item.id)}
                          className="h-8 w-8 rounded-lg flex items-center justify-center text-[#aaaaaa] hover:bg-[rgba(255,255,255,.1)] transition-all"
                        >
                          <ClipboardList size={16} />
                        </button>
                      </td>
                      <td className="px-[10px] py-[9px] whitespace-nowrap text-right">
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => setDeleteDialog({ open: true, itemId: item.id })}
                            className="h-8 w-8 rounded-lg flex items-center justify-center text-[#ff4d4f] hover:bg-[rgba(255,77,79,.12)] transition-all"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {/* History Modal */}
      <Dialog open={historyModal.open} onOpenChange={(open) => setHistoryModal({ ...historyModal, open })}>
        <DialogContent 
          className="max-w-[900px] max-h-[80vh] overflow-auto"
          style={{
            background: '#111',
            border: '1px solid rgba(255,255,255,.14)',
            borderRadius: '12px'
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#f5f5f5]">
              <ClipboardList size={18} />
              Histórico (apenas aprovados)
            </DialogTitle>
          </DialogHeader>
          
          <div className="mt-4 space-y-3">
            {historyModal.history.length === 0 ? (
              <div className="text-[#aaaaaa] text-sm">Sem histórico aprovado.</div>
            ) : (
              historyModal.history.map((entry) => (
                <div 
                  key={entry.id} 
                  className="rounded-xl p-3"
                  style={{
                    background: '#0e0e0e',
                    border: '1px solid rgba(255,255,255,.1)'
                  }}
                >
                  <div className="flex flex-wrap gap-2 mb-2">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[rgba(255,255,255,.05)] border border-[rgba(255,255,255,.18)] text-[0.75rem] text-[#aaaaaa]">
                      Etapa {entry.etapa}
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[rgba(255,255,255,.05)] border border-[rgba(255,255,255,.18)] text-[0.75rem] text-[#aaaaaa] capitalize">
                      {entry.status}
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[rgba(255,255,255,.05)] border border-[rgba(255,255,255,.18)] text-[0.75rem] text-[#aaaaaa]">
                      {entry.created_at}
                    </span>
                  </div>
                  
                  {entry.result_html ? (
                    <div 
                      className="rounded-lg p-3 max-h-[200px] overflow-auto text-sm"
                      style={{
                        background: '#0f0f0f',
                        border: '1px solid rgba(255,255,255,.14)'
                      }}
                      dangerouslySetInnerHTML={{ __html: entry.result_html }}
                    />
                  ) : entry.result_text ? (
                    <pre 
                      className="rounded-lg p-3 max-h-[200px] overflow-auto text-sm whitespace-pre-wrap"
                      style={{
                        background: '#0f0f0f',
                        border: '1px solid rgba(255,255,255,.14)'
                      }}
                    >
                      {entry.result_text}
                    </pre>
                  ) : (
                    <div className="text-[#aaaaaa] text-sm">—</div>
                  )}
                  
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => handleCopyResult(entry.result_text || entry.result_html)}
                      className="h-8 px-3 rounded-xl flex items-center gap-1.5 bg-[rgba(255,255,255,.06)] border border-[rgba(255,255,255,.16)] text-[#f5f5f5] text-[0.8rem] font-bold hover:border-[#ffc800] hover:text-[#ffc800] hover:bg-[rgba(255,255,255,.08)] transition-all"
                    >
                      <Copy size={14} />
                      Copiar
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}>
        <AlertDialogContent 
          style={{
            background: '#111',
            border: '1px solid rgba(255,255,255,.14)'
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#f5f5f5]">Confirmar remoção</AlertDialogTitle>
            <AlertDialogDescription className="text-[#aaaaaa]">
              Tem certeza que deseja remover este item? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl bg-[rgba(255,255,255,.06)] border-[rgba(255,255,255,.16)] hover:bg-[rgba(255,255,255,.1)]">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteDialog.itemId && handleDelete(deleteDialog.itemId)}
              className="rounded-xl bg-[#ff4d4f] hover:bg-[#ff6b6d] border-0"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
