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
          {/* Title Row */}
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-4">
            <div>
              <div className="text-[0.9rem] uppercase tracking-[0.18em] text-[#f5f5f5]">Esteira de análises CHB</div>
              <div className="text-[0.9rem] text-[#aaaaaa] mt-1">Fluxo de 3 etapas: Pré-Alerta → Instrução → DI.</div>
            </div>

            {/* Pending Count + Cadastro */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[rgba(255,255,255,.05)] border border-[rgba(255,255,255,.18)] text-[0.78rem] text-[#aaaaaa]">
                <Clock size={14} />
                Itens pendentes: <strong className="text-[#f5f5f5]">{pendingCount}</strong>
              </div>
              <button 
                onClick={() => navigate("/chb/cadastro-pre-alerta")}
                className="h-9 px-4 rounded-full flex items-center gap-2 bg-[#ffc800] text-[#111] font-bold text-[0.8rem] uppercase tracking-[0.12em] hover:bg-[#ffd940] transition-all"
              >
                <Upload size={14} />
                Cadastro de Pré-Alerta
              </button>
            </div>
          </div>

          {/* Search + Filters Row */}
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
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="h-8 px-3.5 rounded-full flex items-center gap-1.5 bg-[rgba(255,255,255,.05)] border border-[rgba(255,255,255,.25)] text-[#f5f5f5] text-[0.75rem] uppercase tracking-[0.12em] font-bold hover:bg-[rgba(255,255,255,.08)] transition disabled:opacity-50"
                >
                  {isRefreshing ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                  Buscar
                </button>
                <button
                  onClick={handleClearFilters}
                  className="h-8 px-3.5 rounded-full flex items-center gap-1.5 bg-[rgba(255,255,255,.05)] border border-[rgba(255,255,255,.25)] text-[#f5f5f5] text-[0.75rem] uppercase tracking-[0.12em] font-bold hover:bg-[rgba(255,255,255,.08)] transition"
                >
                  <RotateCcw size={14} />
                  Limpar
                </button>
              </div>
            </div>
          </div>

          {/* Table */}
          {filteredItems.length === 0 ? (
            <div className="mt-4 p-3 rounded-xl border border-[rgba(255,255,255,.25)] bg-[rgba(255,255,255,.06)] text-[0.85rem] text-[#aaaaaa]">
              Nenhum processo encontrado.
            </div>
          ) : (
            <div 
              className="mt-4 rounded-xl border border-[rgba(255,255,255,.16)] max-h-[60vh] overflow-auto"
              style={{
                scrollbarWidth: 'thin',
                scrollbarColor: 'rgba(255,255,255,.35) rgba(255,255,255,.10)'
              }}
            >
              <table className="w-full text-[0.82rem]">
                <thead>
                  <tr className="bg-[#14151c] sticky top-0 z-10">
                    <th className="px-3 py-2.5 text-left text-[0.75rem] uppercase tracking-[0.12em] font-medium border-b border-[rgba(255,255,255,.09)]">Referência</th>
                    <th className="px-3 py-2.5 text-left text-[0.75rem] uppercase tracking-[0.12em] font-medium border-b border-[rgba(255,255,255,.09)]">Consignee</th>
                    <th className="px-3 py-2.5 text-left text-[0.75rem] uppercase tracking-[0.12em] font-medium border-b border-[rgba(255,255,255,.09)]">Status</th>
                    <th className="px-3 py-2.5 text-left text-[0.75rem] uppercase tracking-[0.12em] font-medium border-b border-[rgba(255,255,255,.09)]">Etapas</th>
                    <th className="px-3 py-2.5 text-left text-[0.75rem] uppercase tracking-[0.12em] font-medium border-b border-[rgba(255,255,255,.09)]">Submeter</th>
                    <th className="px-3 py-2.5 text-left text-[0.75rem] uppercase tracking-[0.12em] font-medium border-b border-[rgba(255,255,255,.09)]">Histórico</th>
                    <th className="px-3 py-2.5 text-left text-[0.75rem] uppercase tracking-[0.12em] font-medium border-b border-[rgba(255,255,255,.09)]"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item, idx) => (
                    <tr 
                      key={item.id}
                      className={`border-b border-[rgba(255,255,255,.09)] hover:bg-[rgba(255,255,255,.05)] transition-colors ${idx % 2 === 0 ? 'bg-[rgba(0,0,0,.18)]' : 'bg-[rgba(255,255,255,.01)]'}`}
                    >
                      <td className="px-3 py-2.5 whitespace-nowrap">{item.reference || "—"}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{item.consignee || "—"}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[rgba(255,255,255,.14)] bg-[#111] text-[0.8rem] ${getStatusColor(item.status_macro)}`}>
                          {statusLabels[item.status_macro] || item.status_macro}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-[0.78rem] text-[#aaaaaa]">
                        1: {stepStatusLabel(item.step1_status)} · 2: {stepStatusLabel(item.step2_status)} · 3: {stepStatusLabel(item.step3_status)}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <button
                          onClick={() => navigate(`/chb/conferences/${item.id}`)}
                          className="h-8 px-3 rounded-xl flex items-center gap-1.5 bg-[#ffc800] text-[#111] font-bold text-[0.8rem] hover:bg-[#ffd940] transition-all"
                        >
                          <Play size={14} />
                          Analisar
                        </button>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <button
                          onClick={() => handleOpenHistory(item.id)}
                          className="h-8 px-2.5 rounded-xl flex items-center justify-center bg-[rgba(255,255,255,.06)] border border-[rgba(255,255,255,.16)] text-[#f5f5f5] hover:border-[#ffc800] hover:text-[#ffc800] transition-all"
                        >
                          <ClipboardList size={14} />
                        </button>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <button
                          onClick={() => setDeleteDialog({ open: true, itemId: item.id })}
                          className="h-8 px-2.5 rounded-xl flex items-center justify-center bg-transparent border border-[rgba(255,99,71,.55)] text-[#ff4d4f] hover:bg-[rgba(255,99,71,.10)] hover:border-[rgba(255,99,71,.9)] transition-all"
                        >
                          <Trash2 size={14} />
                        </button>
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
