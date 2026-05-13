import { useEffect, useState, useCallback, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Link2, Unlink, Loader2, FileText, Paperclip, CheckCircle2, Search, Layers, Lock, X, PackageSearch } from "lucide-react";
import { TIPOS_ANEXO } from "@/utils/batchVoucherImport";
import { BatchDocumentUploadPanel } from "./BatchDocumentUploadPanel";
import { BatchVoucherChecklist, type ChecklistItem } from "./BatchVoucherChecklist";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  batchId: string | null;
  userId: number;
  onFinalized: () => void;
}

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function BatchDocumentBinderDialog({ open, onOpenChange, batchId, userId, onFinalized }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [docs, setDocs] = useState<any[]>([]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [selectedVouchers, setSelectedVouchers] = useState<Set<string>>(new Set());
  const [tipoAnexo, setTipoAnexo] = useState<string>("FATURA");
  const [busy, setBusy] = useState(false);
  const [voucherSearch, setVoucherSearch] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [lockedMaster, setLockedMaster] = useState<{ voucherIds: string[]; previewSpo: string; total: number } | null>(null);
  const [preSearchLoading, setPreSearchLoading] = useState(false);
  const [preLancVouchers, setPreLancVouchers] = useState<any[]>([]);
  const [selectedPreLanc, setSelectedPreLanc] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    if (!batchId) return;
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke("mariadb-proxy", {
        body: { action: "get_batch_import_status", userId, batch_id: batchId },
      });
      if (data?.success) {
        setDocs(data.documents || []);
        setChecklist(data.checklist || []);
      }
    } finally {
      setLoading(false);
    }
  }, [batchId, userId]);

  useEffect(() => {
    if (open && batchId) {
      refresh();
      searchPreLancamento();
    }
    if (!open) {
      setSelectedDocs(new Set());
      setSelectedVouchers(new Set());
      setSelectedPreLanc(new Set());
      setPreLancVouchers([]);
      setVoucherSearch("");
      setLockedMaster(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, batchId]);

  const toggleDoc = (id: string) => {
    setSelectedDocs((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const toggleVoucher = (id: string) => {
    if (lockedMaster) {
      toast({
        title: "Master travado",
        description: "Encerre o master atual para alterar a seleção de vouchers.",
      });
      return;
    }
    setSelectedVouchers((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const filteredChecklist = useMemo(() => {
    const q = voucherSearch.trim().toLowerCase();
    if (!q) return checklist;
    return checklist.filter((c) => {
      const hay = `${c.numero_spo || ""} ${c.fornecedor || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [checklist, voucherSearch]);

  const filteredPreLanc = useMemo(() => {
    const q = voucherSearch.trim().toLowerCase();
    if (!q) return preLancVouchers;
    return preLancVouchers.filter((v) => {
      const hay = `${v.numero_spo || ""} ${v.fornecedor || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [preLancVouchers, voucherSearch]);

  const toggleAllVisible = () => {
    if (lockedMaster) {
      toast({
        title: "Master travado",
        description: "Encerre o master atual para alterar a seleção de vouchers.",
      });
      return;
    }
    const visibleChecklistIds = filteredChecklist.map((c) => c.voucher_id);
    const visiblePreIds = filteredPreLanc.map((v) => String(v.id));
    const totalVisible = visibleChecklistIds.length + visiblePreIds.length;
    const selectedCount =
      visibleChecklistIds.filter((id) => selectedVouchers.has(id)).length +
      visiblePreIds.filter((id) => selectedPreLanc.has(id)).length;
    const allSelected = totalVisible > 0 && selectedCount === totalVisible;
    setSelectedVouchers((prev) => {
      const n = new Set(prev);
      if (allSelected) visibleChecklistIds.forEach((id) => n.delete(id));
      else visibleChecklistIds.forEach((id) => n.add(id));
      return n;
    });
    setSelectedPreLanc((prev) => {
      const n = new Set(prev);
      if (allSelected) visiblePreIds.forEach((id) => n.delete(id));
      else visiblePreIds.forEach((id) => n.add(id));
      return n;
    });
  };

  const selectedItems = useMemo(
    () => [
      ...checklist.filter((c) => selectedVouchers.has(c.voucher_id)),
      ...preLancVouchers
        .filter((v) => selectedPreLanc.has(String(v.id)))
        .map((v) => ({
          voucher_id: String(v.id),
          numero_spo: v.numero_spo,
          fornecedor: v.fornecedor,
          valor: v.valor,
          id_rm: v.id_rm,
        })) as any,
    ],
    [checklist, selectedVouchers, preLancVouchers, selectedPreLanc],
  );

  const totalSelecionado = selectedItems.reduce((acc, it: any) => acc + (Number(it.valor) || 0), 0);
  const isMaster = selectedItems.length >= 2;

  // Preview do numero_spo do master: menor id_rm; fallback para o primeiro
  const previewMasterSpo = useMemo(() => {
    if (!isMaster) return null;
    const withRm = selectedItems
      .map((it: any) => ({ it, rm: (it as any).id_rm != null ? Number((it as any).id_rm) : null }))
      .filter((x: any) => x.rm != null && !Number.isNaN(x.rm));
    if (withRm.length > 0) {
      withRm.sort((a: any, b: any) => (a.rm! - b.rm!));
      return withRm[0].it.numero_spo || "—";
    }
    return (selectedItems[0] as any)?.numero_spo || "—";
  }, [isMaster, selectedItems]);

  const requestBind = () => {
    const hasVouchers = lockedMaster ? lockedMaster.voucherIds.length > 0 : selectedVouchers.size > 0;
    if (selectedDocs.size === 0 || !hasVouchers || !tipoAnexo) {
      toast({ title: "Selecione documento(s), voucher(s) e tipo", variant: "destructive" });
      return;
    }
    if (lockedMaster) {
      doBind();
    } else if (isMaster) {
      setConfirmOpen(true);
    } else {
      doBind();
    }
  };

  const doBind = async () => {
    setConfirmOpen(false);
    setBusy(true);
    const voucherIds = lockedMaster ? lockedMaster.voucherIds : Array.from(selectedVouchers);
    const isMasterBind = voucherIds.length >= 2;
    let allOk = true;
    try {
      for (const docId of selectedDocs) {
        if (isMasterBind) {
          const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
            body: {
              action: "bind_batch_document_to_master_group",
              userId,
              batch_document_id: docId,
              voucher_ids: voucherIds,
              tipo_anexo: tipoAnexo,
            },
          });
          if (error || !data?.success) {
            allOk = false;
            toast({ title: "Falha ao vincular master", description: data?.error || error?.message, variant: "destructive" });
          }
        } else {
          const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
            body: {
              action: "bind_batch_document_to_voucher",
              userId,
              batch_document_id: docId,
              voucher_id: voucherIds[0],
              tipo_anexo: tipoAnexo,
            },
          });
          if (error || !data?.success) {
            allOk = false;
            toast({ title: "Falha ao vincular", description: data?.error || error?.message, variant: "destructive" });
          }
        }
      }
      // Travar master após primeira vinculação bem-sucedida
      if (allOk && isMasterBind && !lockedMaster) {
        setLockedMaster({
          voucherIds,
          previewSpo: previewMasterSpo || "—",
          total: totalSelecionado,
        });
        setSelectedDocs(new Set());
        // mantém selectedVouchers como feedback visual
      } else if (lockedMaster) {
        // master já travado: limpa apenas docs
        setSelectedDocs(new Set());
      } else {
        setSelectedDocs(new Set());
        setSelectedVouchers(new Set());
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const unlockMaster = () => {
    setLockedMaster(null);
    setSelectedVouchers(new Set());
  };

  const fornecedoresDoLote = useMemo(() => {
    const set = new Set<string>();
    for (const c of checklist) if (c.fornecedor) set.add(String(c.fornecedor));
    return Array.from(set);
  }, [checklist]);

  const searchPreLancamento = async () => {
    if (!batchId) return;
    setPreSearchLoading(true);
    setSelectedPreLanc(new Set());
    try {
      const { data } = await supabase.functions.invoke("mariadb-proxy", {
        body: { action: "search_pre_lancamento_by_fornecedores", userId, batch_id: batchId },
      });
      if (data?.success) {
        const idsNoLote = new Set(checklist.map((c) => c.voucher_id));
        setPreLancVouchers((data.vouchers || []).filter((v: any) => !idsNoLote.has(v.id)));
      } else {
        toast({ title: "Falha ao buscar pré-lançados", description: data?.error, variant: "destructive" });
      }
    } finally {
      setPreSearchLoading(false);
    }
  };

  const togglePreLanc = (id: string) => {
    setSelectedPreLanc((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const attachPreLanc = async () => {
    if (!batchId || selectedPreLanc.size === 0) return;
    setBusy(true);
    try {
      const { data } = await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "attach_pre_lancamento_to_batch",
          userId,
          batch_id: batchId,
          voucher_ids: Array.from(selectedPreLanc),
        },
      });
      if (data?.success) {
        toast({ title: `${data.attached} pré-lançado(s) adicionado(s) ao lote` });
        setSelectedPreLanc(new Set());
        setPreLancVouchers([]);
        setPreSearchOpen(false);
        await refresh();
      } else {
        toast({ title: "Falha ao anexar pré-lançados", description: data?.error, variant: "destructive" });
      }
    } finally {
      setBusy(false);
    }
  };

  const unbind = async (docId: string) => {
    setBusy(true);
    try {
      await supabase.functions.invoke("mariadb-proxy", {
        body: { action: "unbind_batch_document", userId, batch_document_id: docId },
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const finalize = async () => {
    if (!batchId) return;
    setBusy(true);
    try {
      const { data } = await supabase.functions.invoke("mariadb-proxy", {
        body: { action: "finalize_batch_import", userId, batch_id: batchId },
      });
      if (data?.success) {
        toast({
          title: "Lote finalizado",
          description: data?.masters_created
            ? `${data.masters_created} master(s) criado(s)`
            : undefined,
        });
        onFinalized();
        onOpenChange(false);
      } else {
        toast({
          title: "Lote possui pendências",
          description: `${data?.pendentes?.length ?? 0} voucher(s) pendentes`,
          variant: "destructive",
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const hasPending = checklist.some((c) => c.status !== "COMPLETO");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-hidden flex flex-col bg-card border-border/60">
        <DialogHeader className="space-y-1">
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Paperclip className="h-4 w-4" />
            </span>
            Vincular documentos ao lote
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Faça upload das faturas e boletos e associe cada arquivo aos voucher(s) correspondente(s). Selecione 2 ou mais vouchers para vincular um único arquivo e gerar um voucher master automaticamente. Os vouchers só serão promovidos após todos os anexos obrigatórios e a finalização do lote.
          </DialogDescription>
        </DialogHeader>

        {batchId && (
          <BatchDocumentUploadPanel batchId={batchId} userId={userId} onUploaded={refresh} />
        )}

        <div className="grid grid-cols-2 gap-4 overflow-hidden flex-1 mt-2">
          {/* Documentos */}
          <div className="flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card/40">
            <div className="flex items-center justify-between border-b border-border/60 px-3.5 py-2.5">
              <div className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Documentos do lote
                </span>
              </div>
              <span className="rounded-full bg-muted/40 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                {docs.length}
              </span>
            </div>
            <div className="flex-1 overflow-auto p-3 space-y-2">
              {loading && (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
              {docs.map((d) => {
                const isVinc = d.status === "VINCULADO";
                const isSel = selectedDocs.has(d.id);
                const masterCount = d.is_master_group
                  ? (Array.isArray(d.master_voucher_ids) ? d.master_voucher_ids.length : 0)
                  : 0;
                return (
                  <div
                    key={d.id}
                    className={`group flex items-center gap-2.5 rounded-lg border p-2.5 transition-all ${
                      isSel
                        ? "border-primary/50 bg-primary/5"
                        : "border-border/60 bg-card/30 hover:border-primary/30 hover:bg-primary/5"
                    } ${isVinc ? "opacity-70" : ""}`}
                  >
                    <Checkbox
                      checked={isSel}
                      onCheckedChange={() => toggleDoc(d.id)}
                      disabled={isVinc}
                      className="border-border/80 data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=checked]:text-primary-foreground"
                    />
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <a
                      href={d.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 truncate text-xs text-foreground hover:text-primary hover:underline"
                    >
                      {d.file_name}
                    </a>
                    <div className="flex items-center gap-1.5">
                      {isVinc ? (
                        masterCount >= 2 ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                            <Layers className="h-3 w-3" />
                            Master ({masterCount})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" />
                            {d.tipo_anexo || "Vinculado"}
                          </span>
                        )
                      ) : (
                        <span className="inline-flex items-center rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                          Pendente
                        </span>
                      )}
                      {isVinc && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          onClick={() => unbind(d.id)}
                          disabled={busy}
                          title="Desvincular"
                        >
                          <Unlink className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
              {docs.length === 0 && !loading && (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  Nenhum documento enviado.
                </div>
              )}
            </div>
          </div>

          {/* Vouchers */}
          <div className="flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card/40">
            <div className="flex items-center justify-between border-b border-border/60 px-3.5 py-2.5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Vouchers do lote
                </span>
              </div>
              <div className="flex items-center gap-3">
                {filteredChecklist.length > 0 && (() => {
                  const visibleIds = filteredChecklist.map((c) => c.voucher_id);
                  const selectedCount = visibleIds.filter((id) => selectedVouchers.has(id)).length;
                  const allSelected = selectedCount === visibleIds.length;
                  const someSelected = selectedCount > 0 && !allSelected;
                  return (
                    <label className="flex items-center gap-1.5 cursor-pointer text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
                      <Checkbox
                        checked={allSelected ? true : someSelected ? "indeterminate" : false}
                        onCheckedChange={toggleAllVisible}
                        disabled={!!lockedMaster}
                        className="border-border/80 data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=checked]:text-primary-foreground"
                      />
                      Selecionar todos ({visibleIds.length})
                    </label>
                  );
                })()}
                <span className="rounded-full bg-muted/40 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  {checklist.filter((c) => c.status === "COMPLETO").length}/{checklist.length}
                </span>
              </div>
            </div>
            {lockedMaster && (
              <div className="flex items-center justify-between gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2">
                <div className="flex items-center gap-2 text-[11px] text-amber-200">
                  <Lock className="h-3.5 w-3.5" />
                  <span className="font-semibold uppercase tracking-wider">Master travado</span>
                  <span className="text-amber-100/80">
                    · {lockedMaster.voucherIds.length} vouchers · SPO {lockedMaster.previewSpo} ·{" "}
                    {fmtBRL(lockedMaster.total)}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[11px] text-amber-200 hover:text-amber-100 hover:bg-amber-500/20"
                  onClick={unlockMaster}
                  disabled={busy}
                >
                  <X className="h-3 w-3 mr-1" />
                  Encerrar master
                </Button>
              </div>
            )}
            <div className="border-b border-border/60 px-3 py-2 space-y-2">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por fornecedor ou SPO..."
                    value={voucherSearch}
                    onChange={(e) => setVoucherSearch(e.target.value)}
                    className="h-8 text-xs pl-8"
                  />
                </div>
                <Popover
                  open={preSearchOpen}
                  onOpenChange={(o) => {
                    setPreSearchOpen(o);
                    if (o && preLancVouchers.length === 0) searchPreLancamento();
                  }}
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-2 text-[11px] gap-1.5 shrink-0"
                      disabled={fornecedoresDoLote.length === 0}
                      title="Buscar SPOs pré-lançados dos fornecedores deste lote"
                    >
                      <PackageSearch className="h-3.5 w-3.5" />
                      Pré-lançados
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-[420px] p-0">
                    <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        SPOs pré-lançados do(s) fornecedor(es) do lote
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={searchPreLancamento}
                        disabled={preSearchLoading}
                        title="Atualizar"
                      >
                        {preSearchLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                      </Button>
                    </div>
                    <div className="max-h-[320px] overflow-auto p-2 space-y-1">
                      {preSearchLoading && (
                        <div className="flex items-center justify-center py-6">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                      )}
                      {!preSearchLoading && preLancVouchers.length === 0 && (
                        <div className="py-6 text-center text-xs text-muted-foreground">
                          Nenhum SPO pré-lançado encontrado para os fornecedores do lote.
                        </div>
                      )}
                      {preLancVouchers.map((v) => {
                        const isSel = selectedPreLanc.has(v.id);
                        return (
                          <label
                            key={v.id}
                            className={`flex items-start gap-2 rounded-md border p-2 cursor-pointer transition ${
                              isSel ? "border-primary/60 bg-primary/5" : "border-border/60 hover:border-primary/40"
                            }`}
                          >
                            <Checkbox
                              checked={isSel}
                              onCheckedChange={() => togglePreLanc(v.id)}
                              className="mt-0.5"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-mono font-semibold text-foreground truncate">
                                  {v.numero_spo}
                                </span>
                                <span className="text-xs font-mono text-foreground shrink-0">
                                  {fmtBRL(Number(v.valor) || 0)}
                                </span>
                              </div>
                              <div className="text-[11px] text-muted-foreground truncate">
                                {v.fornecedor}
                              </div>
                              <div className="text-[10px] text-muted-foreground mt-0.5 flex gap-2">
                                <span>{v.forma_pagamento || "—"}</span>
                                {v.vencimento && <span>venc: {String(v.vencimento).slice(0, 10)}</span>}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                    <div className="flex items-center justify-between border-t border-border/60 px-3 py-2">
                      <span className="text-[11px] text-muted-foreground">
                        {selectedPreLanc.size} selecionado(s)
                      </span>
                      <Button
                        size="sm"
                        className="h-7 text-[11px]"
                        onClick={attachPreLanc}
                        disabled={busy || selectedPreLanc.size === 0}
                      >
                        <Link2 className="h-3 w-3 mr-1" />
                        Adicionar ao lote
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-3 space-y-2">
              {filteredChecklist.map((c) => (
                <BatchVoucherChecklist
                  key={c.voucher_id}
                  item={c}
                  selected={selectedVouchers.has(c.voucher_id)}
                  onSelect={() => toggleVoucher(c.voucher_id)}
                  multi
                />
              ))}
              {filteredChecklist.length === 0 && !loading && (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  {checklist.length === 0 ? "Nenhum voucher no lote." : "Nenhum voucher corresponde à busca."}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Resumo da seleção */}
        {selectedVouchers.size > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-3.5 py-2.5">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Selecionados
            </span>
            <span className="text-sm font-semibold text-foreground">
              {selectedVouchers.size} voucher(s)
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="text-sm font-mono font-semibold text-foreground">
              {fmtBRL(totalSelecionado)}
            </span>
            {isMaster && (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                  <Layers className="h-3 w-3" />
                  Master — SPO previsto: <span className="font-mono font-semibold">{previewMasterSpo}</span>
                </span>
              </>
            )}
          </div>
        )}

        <Separator className="bg-border/60" />

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Tipo do anexo
            </span>
            <Select value={tipoAnexo} onValueChange={setTipoAnexo}>
              <SelectTrigger className="h-9 w-[220px] bg-card/40 border-border/60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_ANEXO.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="secondary"
            onClick={requestBind}
            disabled={
              busy ||
              selectedDocs.size === 0 ||
              (lockedMaster ? lockedMaster.voucherIds.length === 0 : selectedVouchers.size === 0)
            }
          >
            <Link2 className="h-4 w-4 mr-2" />
            Vincular {selectedDocs.size > 0 ? `(${selectedDocs.size})` : ""}{" "}
            {lockedMaster || isMaster ? "ao master" : "ao voucher"}
          </Button>
          <div className="flex-1" />
          <Button
            onClick={finalize}
            disabled={busy || hasPending || checklist.length === 0}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4 mr-2" />
            )}
            Finalizar lote
          </Button>
        </div>
      </DialogContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isMaster ? "Confirmar criação de voucher master" : "Confirmar vínculo"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                {isMaster ? (
                  <>
                    <p>
                      Será criado um <strong>voucher master</strong> agrupando{" "}
                      <strong>{selectedVouchers.size}</strong> vouchers no momento da finalização do lote.
                    </p>
                    <div className="rounded-md border border-border/60 bg-muted/30 p-3 space-y-1">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">SPO do master:</span>
                        <span className="font-mono font-semibold">{previewMasterSpo}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total consolidado:</span>
                        <span className="font-mono font-semibold">{fmtBRL(totalSelecionado)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Documento(s):</span>
                        <span className="font-semibold">{selectedDocs.size}</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Confirma a criação deste voucher master?
                    </p>
                  </>
                ) : (
                  <p>
                    Vincular {selectedDocs.size} documento(s) ao voucher selecionado como{" "}
                    <strong>{tipoAnexo}</strong>?
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doBind}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
