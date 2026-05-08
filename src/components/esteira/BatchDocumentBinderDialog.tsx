import { useEffect, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Link2, Unlink, Loader2, FileText, Paperclip, CheckCircle2 } from "lucide-react";
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

export function BatchDocumentBinderDialog({ open, onOpenChange, batchId, userId, onFinalized }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [docs, setDocs] = useState<any[]>([]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [selectedVoucher, setSelectedVoucher] = useState<string | null>(null);
  const [tipoAnexo, setTipoAnexo] = useState<string>("FATURA");
  const [busy, setBusy] = useState(false);

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
      setSelectedVoucher(null);
    }
  }, [open, batchId, refresh]);

  const toggleDoc = (id: string) => {
    setSelectedDocs((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const bind = async () => {
    if (!selectedVoucher || selectedDocs.size === 0 || !tipoAnexo) {
      toast({ title: "Selecione documento(s), voucher e tipo", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      for (const docId of selectedDocs) {
        const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
          body: {
            action: "bind_batch_document_to_voucher",
            userId,
            batch_document_id: docId,
            voucher_id: selectedVoucher,
            tipo_anexo: tipoAnexo,
          },
        });
        if (error || !data?.success) {
          toast({ title: "Falha ao vincular", description: data?.error || error?.message, variant: "destructive" });
        }
      }
      setSelectedDocs(new Set());
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
        toast({ title: "Lote finalizado" });
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
            Faça upload das faturas e boletos e associe cada arquivo ao voucher correspondente. Finalize o lote quando todos estiverem completos.
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
                        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" />
                          {d.tipo_anexo || "Vinculado"}
                        </span>
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
            <div className="flex-1 overflow-auto p-3 space-y-2">
              {checklist.map((c) => (
                <BatchVoucherChecklist
                  key={c.voucher_id}
                  item={c}
                  selected={selectedVoucher === c.voucher_id}
                  onSelect={() => setSelectedVoucher(c.voucher_id)}
                />
              ))}
              {checklist.length === 0 && !loading && (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  Nenhum voucher no lote.
                </div>
              )}
            </div>
          </div>
        </div>

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
            onClick={bind}
            disabled={busy || selectedDocs.size === 0 || !selectedVoucher}
          >
            <Link2 className="h-4 w-4 mr-2" />
            Vincular {selectedDocs.size > 0 ? `(${selectedDocs.size})` : ""} ao voucher
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
    </Dialog>
  );
}
