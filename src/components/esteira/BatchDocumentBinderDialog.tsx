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
import { Link2, Unlink, Loader2, FileText, Paperclip, CheckCircle2, Search, Layers } from "lucide-react";
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
    if (open && batchId) refresh();
    if (!open) {
      setSelectedDocs(new Set());
      setSelectedVouchers(new Set());
      setVoucherSearch("");
    }
  }, [open, batchId, refresh]);

  const toggleDoc = (id: string) => {
    setSelectedDocs((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const toggleVoucher = (id: string) => {
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

  const selectedItems = useMemo(
    () => checklist.filter((c) => selectedVouchers.has(c.voucher_id)),
    [checklist, selectedVouchers],
  );

  const totalSelecionado = selectedItems.reduce((acc, it) => acc + (Number(it.valor) || 0), 0);
  const isMaster = selectedItems.length >= 2;

  // Preview do numero_spo do master: menor id_rm; fallback para o primeiro
  const previewMasterSpo = useMemo(() => {
    if (!isMaster) return null;
    const withRm = selectedItems
      .map((it) => ({ it, rm: (it as any).id_rm != null ? Number((it as any).id_rm) : null }))
      .filter((x) => x.rm != null && !Number.isNaN(x.rm));
    if (withRm.length > 0) {
      withRm.sort((a, b) => (a.rm! - b.rm!));
      return withRm[0].it.numero_spo || "—";
    }
    return selectedItems[0]?.numero_spo || "—";
  }, [isMaster, selectedItems]);

  const requestBind = () => {
    if (selectedDocs.size === 0 || selectedVouchers.size === 0 || !tipoAnexo) {
      toast({ title: "Selecione documento(s), voucher(s) e tipo", variant: "destructive" });
      return;
    }
    if (isMaster) {
      setConfirmOpen(true);
    } else {
      doBind();
    }
  };

  const doBind = async () => {
    setConfirmOpen(false);
    setBusy(true);
    try {
      const voucherIds = Array.from(selectedVouchers);
      for (const docId of selectedDocs) {
        if (voucherIds.length >= 2) {
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
            toast({ title: "Falha ao vincular", description: data?.error || error?.message, variant: "destructive" });
          }
        }
      }
      setSelectedDocs(new Set());
      setSelectedVouchers(new Set());
      await refresh();
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
              <span className="rounded-full bg-muted/40 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                {checklist.filter((c) => c.status === "COMPLETO").length}/{checklist.length}
              </span>
            </div>
            <div className="border-b border-border/60 px-3 py-2">
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar por fornecedor ou SPO..."
                  value={voucherSearch}
                  onChange={(e) => setVoucherSearch(e.target.value)}
                  className="h-8 text-xs pl-8"
                />
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
            disabled={busy || selectedDocs.size === 0 || selectedVouchers.size === 0}
          >
            <Link2 className="h-4 w-4 mr-2" />
            Vincular {selectedDocs.size > 0 ? `(${selectedDocs.size})` : ""} {isMaster ? "ao master" : "ao voucher"}
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
