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
import { Link2, Unlink, Loader2, FileText, Paperclip, CheckCircle2, Search, Layers, Lock, X, PackageSearch, Trash2 } from "lucide-react";
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
  const [batchTipo, setBatchTipo] = useState<string>("PLANILHA");

  const isFechamento = batchTipo === "FECHAMENTO_QUINZENAL";

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
        setBatchTipo(data?.batch?.tipo || "PLANILHA");
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
    const hasVouchers = lockedMaster
      ? lockedMaster.voucherIds.length > 0
      : (selectedVouchers.size + selectedPreLanc.size) > 0;
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
    let allOk = true;
    try {
      // 1) Anexar pré-lançados selecionados ao lote (se houver)
      let extraIds: string[] = [];
      if (!lockedMaster && selectedPreLanc.size > 0) {
        const preIds = Array.from(selectedPreLanc);
        const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
          body: {
            action: "attach_pre_lancamento_to_batch",
            userId,
            batch_id: batchId,
            voucher_ids: preIds,
          },
        });
        if (error || !data?.success) {
          allOk = false;
          toast({ title: "Falha ao anexar pré-lançados", description: data?.error || error?.message, variant: "destructive" });
        } else {
          extraIds = preIds;
        }
      }

      // 2) Compor lista final de voucher_ids (lançados + pré-lançados recém-anexados)
      const voucherIds = lockedMaster
        ? lockedMaster.voucherIds
        : [...Array.from(selectedVouchers), ...extraIds];
      const isMasterBind = voucherIds.length >= 2;

      // Acumular pares (voucher_id, file_url) para extrair linha digitável após bind
      const extractionTargets: Array<{ voucherIds: string[]; fileUrl: string; tipo: string }> = [];

      if (allOk) {
        for (const docId of selectedDocs) {
          const docMeta = docs.find((d: any) => String(d.id) === String(docId));
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
            } else if (docMeta?.file_url && (tipoAnexo === "BOLETO" || tipoAnexo === "DAI")) {
              extractionTargets.push({ voucherIds, fileUrl: docMeta.file_url, tipo: tipoAnexo });
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
            } else if (docMeta?.file_url && (tipoAnexo === "BOLETO" || tipoAnexo === "DAI")) {
              extractionTargets.push({ voucherIds: [voucherIds[0]], fileUrl: docMeta.file_url, tipo: tipoAnexo });
            }
          }
        }
      }

      // Extração de linha digitável (BOLETO sempre; DAI somente se nenhum BOLETO já vinculado ao voucher)
      if (extractionTargets.length > 0) {
        const voucherHasBoleto = (vid: string): boolean => {
          return docs.some((d: any) => {
            if (String(d.tipo_anexo || "").toUpperCase() !== "BOLETO") return false;
            if (String(d.voucher_id || "") === String(vid)) return true;
            try {
              const mv = typeof d.master_voucher_ids === "string"
                ? JSON.parse(d.master_voucher_ids)
                : d.master_voucher_ids;
              if (Array.isArray(mv) && mv.map(String).includes(String(vid))) return true;
            } catch (_) {}
            return false;
          });
        };

        for (const target of extractionTargets) {
          // Para DAI: filtrar vouchers que já têm BOLETO vinculado
          const eligibleVids = target.tipo === "DAI"
            ? target.voucherIds.filter((vid) => !voucherHasBoleto(vid))
            : target.voucherIds;
          if (eligibleVids.length === 0) continue;

          try {
            const { data: ext, error: extErr } = await supabase.functions.invoke("extract-boleto-barcode", {
              body: { fileUrl: target.fileUrl },
            });
            if (extErr || !ext?.success || !ext?.linhaDigitavel) {
              console.warn("Lote: extração de linha digitável falhou", extErr || ext?.error);
              continue;
            }
            for (const vid of eligibleVids) {
              await supabase.functions.invoke("mariadb-proxy", {
                body: {
                  action: "save_linha_digitavel",
                  voucher_id: vid,
                  linha_digitavel: ext.linhaDigitavel,
                  codigo_barras: ext.codigoBarras || null,
                },
              });
            }
            toast({
              title: "Linha digitável extraída",
              description: `Extraída do ${target.tipo} e gravada em ${eligibleVids.length} voucher(s).`,
            });
          } catch (e) {
            console.warn("Lote: erro na extração de linha digitável", e);
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
        setSelectedPreLanc(new Set());
        // mantém selectedVouchers como feedback visual
      } else if (lockedMaster) {
        // master já travado: limpa apenas docs
        setSelectedDocs(new Set());
      } else {
        setSelectedDocs(new Set());
        setSelectedVouchers(new Set());
        setSelectedPreLanc(new Set());
      }
      await refresh();
      await searchPreLancamento();
    } finally {
      setBusy(false);
    }
  };

  const unlockMaster = () => {
    setLockedMaster(null);
    setSelectedVouchers(new Set());
  };


  const searchPreLancamento = async () => {
    if (!batchId) return;
    setPreSearchLoading(true);
    try {
      const { data } = await supabase.functions.invoke("mariadb-proxy", {
        body: { action: "search_pre_lancamento_by_fornecedores", userId, batch_id: batchId },
      });
      if (data?.success) {
        const idsNoLote = new Set((checklist || []).map((c) => c.voucher_id));
        setPreLancVouchers((data.vouchers || []).filter((v: any) => !idsNoLote.has(v.id)));
      } else {
        toast({ title: "Falha ao buscar pré-lançados", description: data?.error, variant: "destructive" });
      }
    } finally {
      setPreSearchLoading(false);
    }
  };

  const togglePreLanc = (id: string) => {
    if (lockedMaster) {
      toast({
        title: "Master travado",
        description: "Encerre o master atual para alterar a seleção de vouchers.",
      });
      return;
    }
    setSelectedPreLanc((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
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

  const deleteDoc = async (docId: string, fileName: string) => {
    if (!confirm(`Excluir definitivamente "${fileName}"? Esta ação não pode ser desfeita.`)) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { action: "delete_batch_document", userId, batch_document_id: docId },
      });
      if (error || !data?.success) {
        toast({ title: "Falha ao excluir", description: data?.error || error?.message, variant: "destructive" });
      } else {
        toast({ title: "Documento excluído" });
        setSelectedDocs((prev) => {
          const n = new Set(prev);
          n.delete(docId);
          return n;
        });
      }
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
      <DialogContent className="max-w-[80vw] w-[80vw] max-h-[92vh] overflow-hidden flex flex-col bg-card border-border/60">
        <DialogHeader className="space-y-1">
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Paperclip className="h-4 w-4" />
            </span>
            Vincular documentos ao lote
            {isFechamento && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                Fechamento quinzenal
              </span>
            )}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {isFechamento
              ? "Modo fechamento quinzenal: nenhum voucher novo será criado. Selecione os SPOs pré-lançados na lista ao lado e anexe os documentos."
              : "Faça upload das faturas e boletos e associe cada arquivo aos voucher(s) correspondente(s). Selecione 2 ou mais vouchers para vincular um único arquivo e gerar um voucher master automaticamente. Os vouchers só serão promovidos após todos os anexos obrigatórios e a finalização do lote."}
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
                      className="flex-1 truncate text-sm text-foreground hover:text-primary hover:underline"
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
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteDoc(d.id, d.file_name)}
                        disabled={busy}
                        title="Excluir documento"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
              {docs.length === 0 && !loading && (
                <div className="py-8 text-center text-sm text-muted-foreground">
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
                {(filteredChecklist.length > 0 || filteredPreLanc.length > 0) && (() => {
                  const visibleChecklistIds = filteredChecklist.map((c) => c.voucher_id);
                  const visiblePreIds = filteredPreLanc.map((v) => String(v.id));
                  const totalVisible = visibleChecklistIds.length + visiblePreIds.length;
                  const selectedCount =
                    visibleChecklistIds.filter((id) => selectedVouchers.has(id)).length +
                    visiblePreIds.filter((id) => selectedPreLanc.has(id)).length;
                  const allSelected = totalVisible > 0 && selectedCount === totalVisible;
                  const someSelected = selectedCount > 0 && !allSelected;
                  return (
                    <label className="flex items-center gap-1.5 cursor-pointer text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
                      <Checkbox
                        checked={allSelected ? true : someSelected ? "indeterminate" : false}
                        onCheckedChange={toggleAllVisible}
                        disabled={!!lockedMaster}
                        className="border-border/80 data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=checked]:text-primary-foreground"
                      />
                      Selecionar todos ({totalVisible})
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
            <div className="border-b border-border/60 px-3 py-2">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por fornecedor ou SPO (filtra ambas as colunas)..."
                    value={voucherSearch}
                    onChange={(e) => setVoucherSearch(e.target.value)}
                    className="h-9 text-sm pl-8"
                  />
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0"
                  onClick={searchPreLancamento}
                  disabled={preSearchLoading}
                  title="Atualizar lista de pré-lançados"
                >
                  {preSearchLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PackageSearch className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 flex-1 overflow-hidden p-3">
              {/* Coluna 1: Lançados no lote */}
              <div className="flex flex-col overflow-hidden rounded-lg border border-border/40 bg-card/30">
                <div className="flex items-center justify-between border-b border-border/40 px-2.5 py-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Lançados no lote
                  </span>
                  <span className="rounded-full bg-muted/40 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    {filteredChecklist.length}
                  </span>
                </div>
                <div className="flex-1 overflow-auto p-2 space-y-2">
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
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      {checklist.length === 0 ? "Nenhum voucher no lote." : "Nenhum voucher corresponde à busca."}
                    </div>
                  )}
                </div>
              </div>

              {/* Coluna 2: Pré-lançados */}
              <div className="flex flex-col overflow-hidden rounded-lg border border-border/40 bg-card/30">
                <div className="flex items-center justify-between border-b border-border/40 px-2.5 py-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Pré-lançados disponíveis
                  </span>
                  <span className="rounded-full bg-muted/40 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    {filteredPreLanc.length}
                  </span>
                </div>
                <div className="flex-1 overflow-auto p-2 space-y-2">
                  {preSearchLoading && preLancVouchers.length === 0 && (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  {!preSearchLoading && filteredPreLanc.length === 0 && (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      {preLancVouchers.length === 0
                        ? "Nenhum pré-lançado disponível."
                        : "Nenhum pré-lançado corresponde à busca."}
                    </div>
                  )}
                  {filteredPreLanc.map((v) => {
                    const id = String(v.id);
                    const isSel = selectedPreLanc.has(id);
                    return (
                      <label
                        key={id}
                        className={`flex items-start gap-2 rounded-md border p-2 cursor-pointer transition ${
                          isSel ? "border-primary/60 bg-primary/5" : "border-border/60 hover:border-primary/40"
                        } ${lockedMaster ? "opacity-60 cursor-not-allowed" : ""}`}
                      >
                        <Checkbox
                          checked={isSel}
                          onCheckedChange={() => togglePreLanc(id)}
                          disabled={!!lockedMaster}
                          className="mt-0.5 border-border/80 data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=checked]:text-primary-foreground"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-mono font-semibold text-foreground truncate">
                              {v.numero_spo}
                            </span>
                            <span className="text-sm font-mono text-foreground shrink-0">
                              {fmtBRL(Number(v.valor) || 0)}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {v.fornecedor}
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5 flex gap-2">
                            <span>{v.forma_pagamento || "—"}</span>
                            {v.vencimento && <span>venc: {String(v.vencimento).slice(0, 10)}</span>}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Resumo da seleção */}
        {(selectedVouchers.size + selectedPreLanc.size) > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-3.5 py-2.5">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Selecionados
            </span>
            <span className="text-sm font-semibold text-foreground">
              {selectedVouchers.size + selectedPreLanc.size} voucher(s)
            </span>
            {selectedPreLanc.size > 0 && (
              <span className="text-[11px] text-muted-foreground">
                ({selectedVouchers.size} no lote + {selectedPreLanc.size} pré-lançado{selectedPreLanc.size > 1 ? "s" : ""})
              </span>
            )}
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
              (lockedMaster ? lockedMaster.voucherIds.length === 0 : (selectedVouchers.size + selectedPreLanc.size) === 0)
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
                      <strong>{selectedVouchers.size + selectedPreLanc.size}</strong> vouchers no momento da finalização do lote.
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
