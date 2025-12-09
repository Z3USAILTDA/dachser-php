import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Search, Filter, RotateCcw, Upload, Play, ClipboardList, Trash2, Clock, X, Copy } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
    case "pre_alerta_pendente": return "text-yellow-300";
    case "instrucao_pendente": return "text-sky-300";
    case "di_pendente": return "text-purple-300";
    case "concluida": return "text-emerald-400";
    default: return "text-muted-foreground";
  }
};

export default function ChbAnalises() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [items, setItems] = useState<ChbItem[]>(mockItems);
  const [historyModal, setHistoryModal] = useState<{ open: boolean; itemId: number | null; history: HistoryEntry[] }>({ open: false, itemId: null, history: [] });
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; itemId: number | null }>({ open: false, itemId: null });

  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const pendingCount = items.filter(i => i.status_macro !== "concluida").length;

  const filteredItems = items.filter(item => {
    const matchesSearch = search === "" || 
      item.reference.toLowerCase().includes(search.toLowerCase()) ||
      item.consignee.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "todos" || item.status_macro === statusFilter;
    return matchesSearch && matchesStatus;
  });

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
    <div className="min-h-screen relative">
      {/* Background */}
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
        {[...Array(15)].map((_, i) => (
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

      {/* Top Left - Back + Brand */}
      <div className="fixed top-[18px] left-[18px] z-50 flex items-center gap-4">
        <button
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-2 px-3.5 py-2.5 rounded-full border border-primary/90 bg-primary/15 text-primary font-bold text-sm backdrop-blur-sm hover:bg-primary/25 transition-all"
        >
          <ArrowLeft size={16} />
          <span>Voltar</span>
        </button>
        
        <div>
          <div className="text-xl font-bold tracking-[0.24em] uppercase text-foreground">DACHSER</div>
          <div className="text-sm text-muted-foreground mt-0.5">Desembaraço — Análises (CHB)</div>
          <div className="flex gap-1.5 mt-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_10px_hsl(var(--primary))]" />
            <span className="w-1.5 h-1.5 rounded-full bg-primary/70" />
            <span className="w-1.5 h-1.5 rounded-full bg-primary/40" />
          </div>
        </div>
      </div>

      {/* Top Right - User */}
      <div className="fixed top-[18px] right-[18px] z-50 flex items-center gap-2.5">
        <div className="px-3.5 py-1.5 rounded-full bg-black/70 border border-white/[0.18] text-sm max-w-[220px] truncate">
          @{user?.username || "usuario.chb"}
        </div>
        <div className="w-8 h-8 rounded-full border border-white/25 flex items-center justify-center bg-black/70 text-primary">
          <ClipboardList size={16} />
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 max-w-[1720px] mx-auto pt-[130px] px-6 pb-12">
        <div 
          className="rounded-2xl border border-white/[0.12] p-4"
          style={{
            background: 'rgba(4, 5, 15, 0.94)',
            boxShadow: '0 18px 40px rgba(0,0,0,0.9)'
          }}
        >
          {/* Header */}
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-4">
            <div>
              <div className="text-sm uppercase tracking-[0.18em] text-foreground">Esteira de análises CHB</div>
              <div className="text-sm text-muted-foreground mt-1">Fluxo de 3 etapas: Pré-Alerta → Instrução → DI.</div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por referência ou consignee"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 w-[240px] h-9 rounded-full bg-[#13141a] border-white/[0.14] text-sm"
                />
              </div>

              {/* Filter Chip */}
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/[0.18] text-xs">
                <Filter size={12} />
                <span>Status</span>
              </div>

              {/* Status Select */}
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[200px] h-9 rounded-full bg-[#13141a] border-white/[0.14] text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="pre_alerta_pendente">Análise de Pré-Alerta Pendente</SelectItem>
                  <SelectItem value="instrucao_pendente">Análise de Instrução Pendente</SelectItem>
                  <SelectItem value="di_pendente">Análise de Itens de DI Pendente</SelectItem>
                  <SelectItem value="concluida">Concluída</SelectItem>
                </SelectContent>
              </Select>

              {/* Buscar Button */}
              <Button variant="outline" size="sm" className="h-9 rounded-full gap-1.5 text-xs uppercase tracking-wider">
                <Search size={14} />
                Buscar
              </Button>

              {/* Limpar Button */}
              <Button variant="outline" size="sm" onClick={handleClearFilters} className="h-9 rounded-full gap-1.5 text-xs uppercase tracking-wider">
                <RotateCcw size={14} />
                Limpar
              </Button>

              {/* Pending Count */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/[0.18] text-xs text-muted-foreground">
                <Clock size={14} />
                Itens pendentes: <strong className="text-foreground">{pendingCount}</strong>
              </div>

              {/* Cadastro Button */}
              <Button 
                onClick={() => navigate("/chb/cadastro-pre-alerta")}
                className="h-9 rounded-full gap-1.5 text-xs uppercase tracking-wider bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Upload size={14} />
                Cadastro de Pré-Alerta
              </Button>
            </div>
          </div>

          {/* Table */}
          {filteredItems.length === 0 ? (
            <div className="mt-4 p-3 rounded-xl border border-white/25 bg-white/[0.06] text-sm text-muted-foreground">
              Nenhum processo encontrado.
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-white/[0.16] max-h-[60vh] overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#14151c] sticky top-0 z-10">
                    <th className="px-3 py-2.5 text-left text-xs uppercase tracking-wider font-medium">Referência</th>
                    <th className="px-3 py-2.5 text-left text-xs uppercase tracking-wider font-medium">Consignee</th>
                    <th className="px-3 py-2.5 text-left text-xs uppercase tracking-wider font-medium">Status</th>
                    <th className="px-3 py-2.5 text-left text-xs uppercase tracking-wider font-medium">Etapas</th>
                    <th className="px-3 py-2.5 text-left text-xs uppercase tracking-wider font-medium">Submeter</th>
                    <th className="px-3 py-2.5 text-left text-xs uppercase tracking-wider font-medium">Histórico</th>
                    <th className="px-3 py-2.5 text-left text-xs uppercase tracking-wider font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item, idx) => (
                    <tr 
                      key={item.id}
                      className={`border-b border-white/[0.09] hover:bg-white/5 transition-colors ${idx % 2 === 0 ? 'bg-black/[0.18]' : 'bg-white/[0.01]'}`}
                    >
                      <td className="px-3 py-2.5 whitespace-nowrap">{item.reference || "—"}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{item.consignee || "—"}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/[0.14] bg-[#111] text-xs ${getStatusColor(item.status_macro)}`}>
                          {statusLabels[item.status_macro] || item.status_macro}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs text-muted-foreground">
                        1: {stepStatusLabel(item.step1_status)} · 2: {stepStatusLabel(item.step2_status)} · 3: {stepStatusLabel(item.step3_status)}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <Button
                          size="sm"
                          onClick={() => navigate(`/chb/conferences/${item.id}`)}
                          className="h-8 rounded-lg gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
                        >
                          <Play size={14} />
                          Analisar
                        </Button>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenHistory(item.id)}
                          className="h-8 rounded-lg border border-white/[0.16] hover:border-primary hover:text-primary"
                        >
                          <ClipboardList size={14} />
                        </Button>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteDialog({ open: true, itemId: item.id })}
                          className="h-8 rounded-lg border border-red-500/50 text-red-500 hover:bg-red-500/10 hover:border-red-500"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* History Modal */}
      <Dialog open={historyModal.open} onOpenChange={(open) => setHistoryModal({ ...historyModal, open })}>
        <DialogContent className="max-w-[900px] max-h-[80vh] overflow-auto bg-[#111] border-white/[0.14]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList size={18} />
              Histórico (apenas aprovados)
            </DialogTitle>
          </DialogHeader>
          
          <div className="mt-4 space-y-3">
            {historyModal.history.length === 0 ? (
              <div className="text-muted-foreground text-sm">Sem histórico aprovado.</div>
            ) : (
              historyModal.history.map((entry) => (
                <div key={entry.id} className="bg-[#0e0e0e] rounded-xl p-3 border border-white/[0.1]">
                  <div className="flex flex-wrap gap-2 mb-2">
                    <Badge variant="outline" className="rounded-full">Etapa {entry.etapa}</Badge>
                    <Badge variant="outline" className="rounded-full capitalize">{entry.status}</Badge>
                    <Badge variant="outline" className="rounded-full">{entry.created_at}</Badge>
                  </div>
                  
                  {entry.result_html ? (
                    <div 
                      className="bg-[#0f0f0f] border border-white/[0.14] rounded-lg p-3 max-h-[200px] overflow-auto text-sm"
                      dangerouslySetInnerHTML={{ __html: entry.result_html }}
                    />
                  ) : entry.result_text ? (
                    <pre className="bg-[#0f0f0f] border border-white/[0.14] rounded-lg p-3 max-h-[200px] overflow-auto text-sm whitespace-pre-wrap">
                      {entry.result_text}
                    </pre>
                  ) : (
                    <div className="text-muted-foreground text-sm">—</div>
                  )}
                  
                  <div className="mt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopyResult(entry.result_text || entry.result_html)}
                      className="h-8 rounded-lg gap-1.5 border border-white/[0.16]"
                    >
                      <Copy size={14} />
                      Copiar
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}>
        <AlertDialogContent className="bg-[#111] border-white/[0.14]">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar remoção</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover este item? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteDialog.itemId && handleDelete(deleteDialog.itemId)}
              className="bg-red-500 hover:bg-red-600"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
