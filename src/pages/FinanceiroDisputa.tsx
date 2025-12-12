import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Flag, Search, Filter, X, Plus, Check, Trash2, Clock, Scale, Upload, FileSpreadsheet, Loader2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { PageLayout } from "@/components/layout/PageLayout";
import { FilterCard, TableCard } from "@/components/layout/PageCard";

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
  departamento: string;
  observacoes: string;
  escalation: string;
}

export default function FinanceiroDisputa() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [rows, setRows] = useState<DisputaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [tipoFilter, setTipoFilter] = useState("all");

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addNf, setAddNf] = useState("");
  const [addResp, setAddResp] = useState("");
  const [addObservacoes, setAddObservacoes] = useState("");
  const [addError, setAddError] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteDocKey, setDeleteDocKey] = useState<string | null>(null);

  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [resolveDocKey, setResolveDocKey] = useState<string | null>(null);

  // Import from spreadsheet
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Observações editing state
  const [savingObservacoes, setSavingObservacoes] = useState<Record<string, boolean>>({});
  const [editingObservacoes, setEditingObservacoes] = useState<string | null>(null);
  const debounceTimers = useRef<Record<string, NodeJS.Timeout>>({});
  const observacoesInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    fetchDisputas();
  }, [tipoFilter]);

  const fetchDisputas = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { action: "get_disputas", tipo: tipoFilter === "all" ? "" : tipoFilter },
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
        body: { 
          action: "save_disputa", 
          nf: addNf.trim(), 
          responsavel: addResp.trim(),
          observacoes: addObservacoes.trim(),
        },
      });

      if (error) throw error;
      if (data?.success) {
        toast({ title: "Sucesso", description: "Disputa adicionada!" });
        setAddModalOpen(false);
        setAddNf("");
        setAddResp("");
        setAddObservacoes("");
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
    setTipoFilter("all");
  };

  // Debounced observacoes update
  const handleObservacoesChange = useCallback((docKey: string, value: string) => {
    // Update local state immediately
    setRows(prev => prev.map(r => r.doc_key === docKey ? { ...r, observacoes: value } : r));

    // Clear existing timer
    if (debounceTimers.current[docKey]) {
      clearTimeout(debounceTimers.current[docKey]);
    }

    // Set new debounce timer (500ms)
    debounceTimers.current[docKey] = setTimeout(async () => {
      setSavingObservacoes(prev => ({ ...prev, [docKey]: true }));
      try {
        const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
          body: { action: "update_disputa_observacoes", doc_key: docKey, observacoes: value },
        });

        if (error) throw error;
        if (!data?.success) {
          toast({ title: "Erro", description: "Falha ao salvar observações", variant: "destructive" });
        }
      } catch (err) {
        console.error("Erro ao salvar observações:", err);
        toast({ title: "Erro", description: "Falha ao salvar observações", variant: "destructive" });
      } finally {
        setSavingObservacoes(prev => ({ ...prev, [docKey]: false }));
      }
    }, 500);
  }, [toast]);

  const parseSpreadsheet = async (file: File): Promise<Array<{
    nd: string;
    descricao: string;
    departamento: string;
    responsavel: string;
    escalation: string;
  }>> => {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(line => line.trim());
    
    // Skip header if it looks like one
    const startIdx = lines[0]?.toLowerCase().includes('nd') || 
                     lines[0]?.toLowerCase().includes('cnpj') ||
                     lines[0]?.toLowerCase().includes('documento') ? 1 : 0;
    
    const items: Array<{
      nd: string;
      descricao: string;
      departamento: string;
      responsavel: string;
      escalation: string;
    }> = [];
    
    for (let i = startIdx; i < lines.length; i++) {
      const cols = lines[i].split(/[,;\t]/);
      const nd = cols[0]?.trim();  // ND (coluna 0)
      if (nd) {
        items.push({
          nd,
          descricao: cols[8]?.trim() || '',      // DESCRIÇÃO/PENDÊNCIA (coluna 8) → observacoes
          departamento: cols[9]?.trim() || '',   // DEPARTAMENTO (coluna 9)
          responsavel: cols[10]?.trim() || '',   // RESPONSÁVEL (coluna 10)
          escalation: cols[13]?.trim() || '',    // ESCALATION (coluna 13)
        });
      }
    }
    return items;
  };

  const handleImportSpreadsheet = async () => {
    if (!importFile) {
      toast({ title: "Erro", description: "Selecione um arquivo", variant: "destructive" });
      return;
    }

    setImportLoading(true);
    try {
      const items = await parseSpreadsheet(importFile);
      
      if (items.length === 0) {
        toast({ title: "Erro", description: "Nenhum documento encontrado na planilha", variant: "destructive" });
        setImportLoading(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { action: "import_disputas_planilha", items },
      });

      if (error) throw error;
      
      if (data?.success) {
        const msg = `${data.imported} disputa(s) importada(s)` + 
          (data.notFound > 0 ? `, ${data.notFound} não encontrado(s)` : '');
        toast({ title: "Importação concluída", description: msg });
        
        if (data.notFoundItems?.length > 0) {
          console.log("Documentos não encontrados:", data.notFoundItems);
        }
        
        setImportModalOpen(false);
        setImportFile(null);
        fetchDisputas();
      } else {
        toast({ title: "Erro", description: data?.error || "Falha na importação", variant: "destructive" });
      }
    } catch (err) {
      console.error("Erro ao importar:", err);
      toast({ title: "Erro", description: "Falha ao processar planilha", variant: "destructive" });
    } finally {
      setImportLoading(false);
    }
  };

  const rightContent = (
    <div className="flex gap-2">
      <Button
        onClick={() => setImportModalOpen(true)}
        variant="outline"
        className="h-8 rounded-full font-bold text-[0.85rem]"
      >
        <FileSpreadsheet className="w-4 h-4 mr-1" /> Importar Planilha
      </Button>
      <Button
        onClick={() => setAddModalOpen(true)}
        className="h-8 rounded-full bg-primary text-primary-foreground font-bold text-[0.85rem] hover:bg-primary/90"
      >
        <Plus className="w-4 h-4 mr-1" /> Adicionar Disputa
      </Button>
    </div>
  );

  return (
    <PageLayout 
      title="DACHSER" 
      subtitle="Financeiro — NFs em disputa"
      rightContent={rightContent}
      pageIcon={Scale}
    >
      {/* Filter Card */}
      <FilterCard>
        <div className="flex flex-wrap gap-3 items-center">
          {/* Meta badge */}
          <span className="px-3 py-2 rounded-full bg-white/6 border border-white/12 text-[#ddd] text-[0.85rem] inline-flex items-center gap-[6px]">
            <Flag className="w-4 h-4" />
            <span>Total de NFs em disputa:</span>
            <b>{loading ? "..." : rows.length}</b>
          </span>

          <div className="flex-1 min-w-[280px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por cliente, documento ou tipo..."
                className="pl-9 w-full max-w-[420px] h-9 rounded-full bg-[#13141a] border-white/20 text-[0.85rem]"
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
                  <SelectItem value="all">Todos</SelectItem>
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
          </div>
        </div>
      </FilterCard>

      {/* Table Card */}
      <TableCard>
        <div className="rounded-2xl overflow-auto">
          <table className="w-full min-w-[1500px] border-collapse">
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
                <th className="bg-[#15151f] sticky top-0 z-[1] px-4 py-[14px] text-left text-[0.78rem] uppercase tracking-wider font-bold whitespace-nowrap min-w-[200px]">
                  Observações
                </th>
                <th className="bg-[#15151f] sticky top-0 z-[1] px-4 py-[14px] text-left text-[0.78rem] uppercase tracking-wider font-bold whitespace-nowrap">
                  ㅤㅤ
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={12} className="px-4 py-[18px] text-muted-foreground">
                    Carregando...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-[18px] text-muted-foreground">
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
                    <td className="px-4 py-[14px] whitespace-nowrap min-w-[200px] max-w-[300px]">
                      {editingObservacoes === r.doc_key ? (
                        <div className="relative flex items-center gap-2">
                          <Input
                            ref={observacoesInputRef}
                            value={r.observacoes || ""}
                            onChange={(e) => handleObservacoesChange(r.doc_key, e.target.value)}
                            onBlur={() => setEditingObservacoes(null)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === 'Escape') {
                                setEditingObservacoes(null);
                              }
                            }}
                            placeholder="Adicionar observação..."
                            className="h-8 text-[0.85rem] bg-[#0a0a0f] border-white/15 rounded-lg pr-8"
                            autoFocus
                          />
                          {savingObservacoes[r.doc_key] && (
                            <Loader2 className="w-4 h-4 animate-spin absolute right-2 text-muted-foreground" />
                          )}
                        </div>
                      ) : (
                        <span 
                          onClick={() => setEditingObservacoes(r.doc_key)}
                          className="cursor-pointer hover:text-primary transition-colors block overflow-hidden text-ellipsis"
                          title={r.observacoes || "Clique para editar"}
                        >
                          {r.observacoes || <span className="text-muted-foreground italic">—</span>}
                          {savingObservacoes[r.doc_key] && (
                            <Loader2 className="w-3 h-3 animate-spin inline ml-2 text-muted-foreground" />
                          )}
                        </span>
                      )}
                    </td>
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
      </TableCard>

      {/* Add Modal */}
      <Dialog open={addModalOpen} onOpenChange={(open) => {
        setAddModalOpen(open);
        if (!open) {
          setAddNf("");
          setAddResp("");
          setAddObservacoes("");
          setAddError("");
        }
      }}>
        <DialogContent className="bg-[rgba(4,5,15,0.98)] border-white/12 max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar Disputa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div>
              <Label className="text-sm text-muted-foreground">ND / NF / Documento</Label>
              <Input
                value={addNf}
                onChange={(e) => setAddNf(e.target.value)}
                placeholder="Ex: 12345"
                className="mt-1 bg-[#13141a] border-white/20"
              />
            </div>

            <div>
              <Label className="text-sm text-muted-foreground">Responsável</Label>
              <Input
                value={addResp}
                onChange={(e) => setAddResp(e.target.value)}
                placeholder="Nome do responsável"
                className="mt-1 bg-[#13141a] border-white/20"
              />
            </div>
            
            <div>
              <Label className="text-sm text-muted-foreground">Observações</Label>
              <Textarea
                value={addObservacoes}
                onChange={(e) => setAddObservacoes(e.target.value)}
                placeholder="Descrição/Pendência..."
                className="mt-1 bg-[#13141a] border-white/20 min-h-[80px]"
              />
            </div>

            {addError && <p className="text-sm text-red-400">{addError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAddDispute} disabled={addLoading} className="bg-primary text-primary-foreground">
              {addLoading ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-[rgba(4,5,15,0.98)] border-white/12">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir disputa?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A NF será removida da lista de disputas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Resolve Dialog */}
      <AlertDialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
        <AlertDialogContent className="bg-[rgba(4,5,15,0.98)] border-white/12">
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar como resolvida?</AlertDialogTitle>
            <AlertDialogDescription>
              Confirme que a disputa desta NF foi resolvida. Ela será removida da lista.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleResolve} className="bg-green-600 text-white hover:bg-green-700">
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import Spreadsheet Modal */}
      <Dialog open={importModalOpen} onOpenChange={setImportModalOpen}>
        <DialogContent className="bg-[rgba(4,5,15,0.98)] border-white/12">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5" />
              Importar Disputas via Planilha
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="text-sm text-muted-foreground">
              Faça upload de um arquivo CSV ou TXT com uma coluna de documentos/NFs.
              A primeira coluna será usada como identificador do documento.
            </div>
            
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const file = e.dataTransfer.files?.[0];
                if (file && (file.name.endsWith('.csv') || file.name.endsWith('.txt') || file.name.endsWith('.tsv'))) {
                  setImportFile(file);
                }
              }}
              className={`
                border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors
                ${importFile ? 'border-primary/50 bg-primary/5' : 'border-white/20 hover:border-primary/40 hover:bg-white/5'}
              `}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,.tsv"
                className="hidden"
                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
              />
              {importFile ? (
                <div className="flex items-center justify-center gap-2 text-primary">
                  <FileSpreadsheet className="w-5 h-5" />
                  <span>{importFile.name}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setImportFile(null);
                    }}
                    className="ml-2 p-1 rounded-full hover:bg-white/10"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="text-muted-foreground">
                  <Upload className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>Clique ou arraste um arquivo CSV/TXT</p>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setImportModalOpen(false); setImportFile(null); }}>
              Cancelar
            </Button>
            <Button 
              onClick={handleImportSpreadsheet} 
              disabled={importLoading || !importFile} 
              className="bg-primary text-primary-foreground"
            >
              {importLoading ? "Importando..." : "Importar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}
