import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Flag, Scale, Search, Filter, X, Plus, Check, Trash2, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import dachserBg from "@/assets/dachser-background.jpg";

interface DisputaRow {
  doc_key: string;
  nf: string;
  nd: string;
  cliente: string;
  razao_base: string;
  emissao: string;
  vencimento: string;
  created_at: string;
  responsavel: string;
  valor: number;
  tipo: string;
}

export default function FinanceiroDisputa() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [rows, setRows] = useState<DisputaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [tipoFilter, setTipoFilter] = useState("");

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addNf, setAddNf] = useState("");
  const [addResp, setAddResp] = useState("");
  const [addError, setAddError] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteDocKey, setDeleteDocKey] = useState<string | null>(null);

  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [resolveDocKey, setResolveDocKey] = useState<string | null>(null);

  const username = localStorage.getItem("user_email") || "user";

  useEffect(() => {
    fetchDisputas();
  }, [tipoFilter]);

  const fetchDisputas = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { action: "get_disputas", tipo: tipoFilter },
      });

      if (error) throw error;
      if (data?.success && data.rows) {
        setRows(data.rows);
      } else {
        setRows([]);
      }
    } catch (err) {
      console.error("Erro ao carregar disputas:", err);
      toast({ title: "Erro", description: "Falha ao carregar disputas", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Filter rows by search
  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return rows;
    const q = searchQuery.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return rows.filter((r) => {
      const hay = [r.razao_base, r.cliente, r.nf, r.nd, r.tipo, r.responsavel]
        .join(" ")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      return hay.includes(q);
    });
  }, [rows, searchQuery]);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "-";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("pt-BR");
    } catch {
      return dateStr;
    }
  };

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return "-";
    try {
      const d = new Date(dateStr);
      return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch {
      return dateStr;
    }
  };

  const formatMoney = (val: number) => {
    return "R$ " + val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatElapsed = (startDate: string) => {
    if (!startDate) return "—";
    try {
      const start = new Date(startDate).getTime();
      const now = Date.now();
      const ms = now - start;
      const s = Math.floor(ms / 1000);
      const d = Math.floor(s / 86400);
      const h = Math.floor((s % 86400) / 3600);
      const m = Math.floor((s % 3600) / 60);
      if (d > 0) return `D+${d} • ${String(h).padStart(2, "0")}h${String(m).padStart(2, "0")}`;
      if (h > 0) return `${h}h ${m}m`;
      return `${m}m`;
    } catch {
      return "—";
    }
  };

  const handleAddDispute = async () => {
    if (!addNf.trim()) {
      setAddError("Informe o documento/NF.");
      return;
    }
    setAddError("");
    setAddLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { action: "save_disputa", nf: addNf.trim(), responsavel: addResp.trim() },
      });

      if (error) throw error;
      if (data?.success) {
        toast({ title: "Sucesso", description: "Disputa adicionada!" });
        setAddModalOpen(false);
        setAddNf("");
        setAddResp("");
        fetchDisputas();
      } else {
        setAddError(data?.error || "Falha ao salvar.");
      }
    } catch (err) {
      console.error("Erro ao salvar disputa:", err);
      setAddError("Falha de rede.");
    } finally {
      setAddLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteDocKey) return;
    try {
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { action: "delete_disputa", doc_key: deleteDocKey },
      });

      if (error) throw error;
      if (data?.success) {
        toast({ title: "Sucesso", description: "Disputa excluída" });
        fetchDisputas();
      } else {
        toast({ title: "Erro", description: data?.error || "Falha ao excluir", variant: "destructive" });
      }
    } catch (err) {
      console.error("Erro ao excluir:", err);
      toast({ title: "Erro", description: "Falha de rede", variant: "destructive" });
    } finally {
      setDeleteDialogOpen(false);
      setDeleteDocKey(null);
    }
  };

  const handleResolve = async () => {
    if (!resolveDocKey) return;
    try {
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { action: "resolve_disputa", doc_key: resolveDocKey },
      });

      if (error) throw error;
      if (data?.success) {
        toast({ title: "Sucesso", description: "Disputa resolvida" });
        fetchDisputas();
      } else {
        toast({ title: "Erro", description: data?.error || "Falha ao resolver", variant: "destructive" });
      }
    } catch (err) {
      console.error("Erro ao resolver:", err);
      toast({ title: "Erro", description: "Falha de rede", variant: "destructive" });
    } finally {
      setResolveDialogOpen(false);
      setResolveDocKey(null);
    }
  };

  const clearFilters = () => {
    setSearchQuery("");
    setTipoFilter("");
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background */}
      <div
        className="fixed inset-0 z-[-2]"
        style={{
          background: `
            radial-gradient(circle at 10% 0%, rgba(255,200,0,0.20), transparent 55%),
            radial-gradient(circle at 90% 100%, rgba(255,200,0,0.15), transparent 55%),
            linear-gradient(180deg, rgba(0,0,0,0.82), rgba(0,0,0,0.96)),
            url(${dachserBg}) center/cover no-repeat
          `,
          filter: "saturate(0.8)",
        }}
      />
      <div
        className="fixed inset-0 z-[-1]"
        style={{
          background: "radial-gradient(circle at 50% 0%, rgba(0,0,0,0.75), transparent 55%)",
        }}
      />

      {/* Header */}
      <div className="absolute top-[18px] left-[18px] z-[1000] flex items-center gap-[18px]">
        <button
          onClick={() => navigate("/fin/regua")}
          className="inline-flex items-center gap-2 px-[14px] py-[10px] rounded-full border border-primary/90 bg-primary/15 text-primary font-bold text-[0.9rem] backdrop-blur-sm hover:bg-primary/25 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <header className="text-left">
          <div className="text-[1.6rem] tracking-[0.24em] uppercase font-bold">DACHSER</div>
          <div className="mt-[2px] text-[0.9rem] text-muted-foreground">
            Financeiro — NFs em disputa
          </div>
          <div className="mt-[6px] flex gap-[6px]">
            <span className="w-[6px] h-[6px] rounded-full bg-primary shadow-[0_0_10px_rgba(255,200,0,0.9)]" />
            <span className="w-[6px] h-[6px] rounded-full bg-primary shadow-[0_0_10px_rgba(255,200,0,0.9)]" />
            <span className="w-[6px] h-[6px] rounded-full bg-primary shadow-[0_0_10px_rgba(255,200,0,0.9)]" />
          </div>
        </header>
      </div>

      {/* User info */}
      <div className="absolute top-[18px] right-[18px] flex items-center gap-[10px] text-[0.85rem] z-[1000]">
        <div className="px-[14px] py-[6px] rounded-full bg-black/70 border border-white/18 max-w-[220px] truncate">
          @{username}
        </div>
        <div className="w-8 h-8 rounded-full border border-white/25 flex items-center justify-center bg-black/70 text-primary">
          <Scale className="w-4 h-4" />
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[1720px] mx-auto mt-[130px] px-6 pb-8">
        {/* Meta */}
        <div className="flex flex-wrap gap-[10px] mb-4">
          <span className="px-3 py-2 rounded-full bg-white/6 border border-white/12 text-[#ddd] text-[0.85rem] inline-flex items-center gap-[6px]">
            <Flag className="w-4 h-4" />
            <span>Total de NFs em disputa:</span>
            <b>{loading ? "..." : rows.length}</b>
          </span>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap gap-3 items-center mb-[18px]">
          <div className="flex-1 min-w-[320px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por cliente, documento ou tipo..."
                className="pl-9 w-full max-w-[520px] h-9 rounded-full bg-[#13141a] border-white/20 text-[0.9rem]"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="inline-flex items-center gap-2 px-3 py-[6px] rounded-full bg-[#121212] border border-white/12 text-[0.85rem]">
              <Filter className="w-4 h-4" />
              <span>Tipo:</span>
              <Select value={tipoFilter} onValueChange={setTipoFilter}>
                <SelectTrigger className="w-[100px] h-7 border-0 bg-transparent text-[0.85rem] p-0">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todos</SelectItem>
                  <SelectItem value="A prazo">A prazo</SelectItem>
                  <SelectItem value="À vista">À vista</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={clearFilters}
              className="rounded-full h-8 text-[0.8rem] uppercase tracking-wider"
            >
              <X className="w-3 h-3 mr-1" /> Limpar filtros
            </Button>

            <Button
              onClick={() => setAddModalOpen(true)}
              className="h-9 rounded-xl bg-primary text-black font-extrabold text-[0.9rem] hover:bg-primary/90"
            >
              <Plus className="w-4 h-4 mr-1" /> Adicionar Disputa
            </Button>
          </div>
        </div>

        {/* Table */}
        <section className="bg-[rgba(4,5,15,0.94)] rounded-2xl border border-white/12 shadow-[0_18px_40px_rgba(0,0,0,0.9)]">
          <div className="rounded-2xl overflow-auto">
            <table className="w-full min-w-[1200px] border-collapse">
              <thead>
                <tr>
                  <th className="bg-[#15151f] sticky top-0 z-[1] px-4 py-[14px] text-left text-[0.78rem] uppercase tracking-wider font-bold whitespace-nowrap max-w-[220px]">
                    Cliente
                  </th>
                  <th className="bg-[#15151f] sticky top-0 z-[1] px-4 py-[14px] text-left text-[0.78rem] uppercase tracking-wider font-bold whitespace-nowrap">
                    Documento / NF
                  </th>
                  <th className="bg-[#15151f] sticky top-0 z-[1] px-4 py-[14px] text-left text-[0.78rem] uppercase tracking-wider font-bold whitespace-nowrap">
                    Emissão
                  </th>
                  <th className="bg-[#15151f] sticky top-0 z-[1] px-4 py-[14px] text-left text-[0.78rem] uppercase tracking-wider font-bold whitespace-nowrap">
                    Vencimento
                  </th>
                  <th className="bg-[#15151f] sticky top-0 z-[1] px-4 py-[14px] text-left text-[0.78rem] uppercase tracking-wider font-bold whitespace-nowrap">
                    Inclusão
                  </th>
                  <th className="bg-[#15151f] sticky top-0 z-[1] px-4 py-[14px] text-left text-[0.78rem] uppercase tracking-wider font-bold whitespace-nowrap">
                    Em disputa
                  </th>
                  <th className="bg-[#15151f] sticky top-0 z-[1] px-4 py-[14px] text-left text-[0.78rem] uppercase tracking-wider font-bold whitespace-nowrap">
                    Responsável
                  </th>
                  <th className="bg-[#15151f] sticky top-0 z-[1] px-4 py-[14px] text-left text-[0.78rem] uppercase tracking-wider font-bold whitespace-nowrap">
                    Valor
                  </th>
                  <th className="bg-[#15151f] sticky top-0 z-[1] px-4 py-[14px] text-left text-[0.78rem] uppercase tracking-wider font-bold whitespace-nowrap">
                    Tipo
                  </th>
                  <th className="bg-[#15151f] sticky top-0 z-[1] px-4 py-[14px] text-left text-[0.78rem] uppercase tracking-wider font-bold whitespace-nowrap">
                    ㅤㅤ
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-[18px] text-muted-foreground">
                      Carregando...
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-[18px] text-muted-foreground">
                      Nenhuma NF em disputa.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((r) => (
                    <tr key={r.doc_key} className="hover:bg-white/4 border-b border-white/14">
                      <td className="px-4 py-[14px] whitespace-nowrap max-w-[220px] overflow-hidden text-ellipsis" title={r.cliente || "-"}>
                        {r.razao_base || r.cliente || "-"}
                      </td>
                      <td className="px-4 py-[14px] whitespace-nowrap">{r.nf || "-"}</td>
                      <td className="px-4 py-[14px] whitespace-nowrap">{formatDate(r.emissao)}</td>
                      <td className="px-4 py-[14px] whitespace-nowrap">{formatDate(r.vencimento)}</td>
                      <td className="px-4 py-[14px] whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                      <td className="px-4 py-[14px] whitespace-nowrap">
                        <Badge variant="outline" className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {formatElapsed(r.created_at)}
                        </Badge>
                      </td>
                      <td className="px-4 py-[14px] whitespace-nowrap">{r.responsavel || "-"}</td>
                      <td className="px-4 py-[14px] whitespace-nowrap">{formatMoney(r.valor)}</td>
                      <td className="px-4 py-[14px] whitespace-nowrap">{r.tipo || "-"}</td>
                      <td className="px-4 py-[14px] whitespace-nowrap">
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setResolveDocKey(r.doc_key);
                              setResolveDialogOpen(true);
                            }}
                            className="w-9 h-9 inline-grid place-items-center rounded-[10px] bg-[#141414] text-[#7df0c0] border border-[#7df0c0] hover:bg-[rgba(0,255,150,0.08)] transition-colors"
                            title="Resolvido"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setDeleteDocKey(r.doc_key);
                              setDeleteDialogOpen(true);
                            }}
                            className="w-9 h-9 inline-grid place-items-center rounded-[10px] bg-[#141414] text-[#ff8a8a] border border-[#ff8a8a] hover:bg-[rgba(255,0,0,0.08)] transition-colors"
                            title="Excluir"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Add Modal */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="bg-[#111218] border-white/12 max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-extrabold">
              <Plus className="w-5 h-5 text-primary" />
              Adicionar Disputa
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-[12px] font-bold text-[#ddd]">Documento / NF / ND</Label>
              <Input
                value={addNf}
                onChange={(e) => setAddNf(e.target.value)}
                placeholder="Digite o DOCUMENTO, NF ou ND"
                className="mt-2 bg-[#1b1b1b] border-white/12 rounded-[10px]"
              />
            </div>
            <div>
              <Label className="text-[12px] font-bold text-[#ddd]">Responsável</Label>
              <Input
                value={addResp}
                onChange={(e) => setAddResp(e.target.value)}
                placeholder="Nome do responsável"
                className="mt-2 bg-[#1b1b1b] border-white/12 rounded-[10px]"
              />
            </div>
            {addError && (
              <p className="text-[#ffb3b3] text-sm">{addError}</p>
            )}
          </div>
          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => setAddModalOpen(false)}
              className="bg-[#202020] border-white/12 rounded-[10px]"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleAddDispute}
              disabled={addLoading}
              className="bg-primary text-black font-extrabold rounded-[10px]"
            >
              <Check className="w-4 h-4 mr-1" /> Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-[#111218] border-white/12">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir disputa?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação irá remover a disputa da lista.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-[#202020] border-white/12">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Resolve Confirmation */}
      <AlertDialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
        <AlertDialogContent className="bg-[#111218] border-white/12">
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar como resolvida?</AlertDialogTitle>
            <AlertDialogDescription>
              A disputa será removida da lista de pendências.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-[#202020] border-white/12">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleResolve} className="bg-green-600 hover:bg-green-700">
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
