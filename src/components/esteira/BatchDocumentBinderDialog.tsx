import { useEffect, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Link2, Unlink, Loader2, FileText } from "lucide-react";
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
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Vincular documentos ao lote</DialogTitle>
        </DialogHeader>

        {batchId && (
          <BatchDocumentUploadPanel batchId={batchId} userId={userId} onUploaded={refresh} />
        )}

        <div className="grid grid-cols-2 gap-4 overflow-hidden flex-1 mt-3">
          <div className="overflow-auto pr-2 space-y-2">
            <div className="text-sm font-semibold mb-1">Documentos do lote</div>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {docs.map((d) => (
              <div
                key={d.id}
                className={`rounded-lg border p-2 flex items-center gap-2 ${
                  selectedDocs.has(d.id) ? "border-primary bg-primary/5" : "border-white/10"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedDocs.has(d.id)}
                  onChange={() => toggleDoc(d.id)}
                  disabled={d.status === "VINCULADO"}
                />
                <FileText className="h-4 w-4 text-muted-foreground" />
                <a href={d.file_url} target="_blank" rel="noopener noreferrer" className="text-xs underline truncate flex-1">
                  {d.file_name}
                </a>
                <span className="text-[11px] uppercase tracking-wide">
                  {d.status}
                  {d.tipo_anexo ? ` • ${d.tipo_anexo}` : ""}
                </span>
                {d.status === "VINCULADO" && (
                  <Button variant="ghost" size="sm" onClick={() => unbind(d.id)} disabled={busy}>
                    <Unlink className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ))}
            {docs.length === 0 && !loading && (
              <div className="text-xs text-muted-foreground">Nenhum documento enviado.</div>
            )}
          </div>

          <div className="overflow-auto pl-2 space-y-2">
            <div className="text-sm font-semibold mb-1">Vouchers do lote</div>
            {checklist.map((c) => (
              <BatchVoucherChecklist
                key={c.voucher_id}
                item={c}
                selected={selectedVoucher === c.voucher_id}
                onSelect={() => setSelectedVoucher(c.voucher_id)}
              />
            ))}
            {checklist.length === 0 && !loading && (
              <div className="text-xs text-muted-foreground">Nenhum voucher no lote.</div>
            )}
          </div>
        </div>

        <div className="border-t border-white/10 pt-3 flex items-center gap-2 flex-wrap">
          <Select value={tipoAnexo} onValueChange={setTipoAnexo}>
            <SelectTrigger className="w-[220px]">
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
          <Button onClick={bind} disabled={busy || selectedDocs.size === 0 || !selectedVoucher}>
            <Link2 className="h-4 w-4 mr-2" />
            Vincular ao voucher
          </Button>
          <div className="flex-1" />
          <Button
            variant="default"
            onClick={finalize}
            disabled={busy || hasPending || checklist.length === 0}
          >
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Finalizar lote
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
