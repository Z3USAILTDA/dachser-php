import { useRef, useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Upload, Loader2, FileSpreadsheet, CheckCircle2, AlertCircle, FileText, Wand2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { parseBatchSpreadsheet } from "@/utils/batchVoucherImport";
import { BatchImportPreviewTable } from "./BatchImportPreviewTable";

const EXPECTED_HEADERS = [
  "SPO", "Processo", "Origem Processo", "Fornecedor", "CNPJ", "Valor", "Moeda",
  "Vencimento", "Data Emissão", "Tipo Documento", "Filial", "Forma Pagto",
  "Fiscal", "Urgente", "Comentários",
];

const ORIGENS = ["AIR", "SEA", "CHB", "ROD"];
const TIPOS_DOC = ["VOUCHER", "SPO", "ICMS", "ARMAZENAGEM", "ADF", "OUTROS"];
const FORMAS = ["BOLETO", "PIX", "TRANSFERENCIA", "DEPOSITO", "DARF", "GPS", "CAMBIO", "ADF", "CARTAO", "DEBITO"];

// Detects which columns are *entirely empty* across all parsed rows
const detectMissingColumns = (items: any[]) => {
  const checks: Array<{ key: string; label: string }> = [
    { key: "origem_processo", label: "Origem Processo" },
    { key: "tipo_documento", label: "Tipo Documento" },
    { key: "cobranca_em_nome_de", label: "Fiscal" },
    { key: "forma_pagamento", label: "Forma de Pagamento" },
  ];
  return checks.filter(c => items.every(i => !i[c.key]));
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: number;
  onCreated: (batchId: string) => void;
}

export function BatchImportVoucherDialog({ open, onOpenChange, userId, onCreated }: Props) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"upload" | "fill" | "preview">("upload");
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [rawRows, setRawRows] = useState<any[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [fillValues, setFillValues] = useState<Record<string, any>>({});

  // Bulk action bar (preview step)
  const [bulkField, setBulkField] = useState<string>("");
  const [bulkValue, setBulkValue] = useState<string>("");

  const reset = () => {
    setStep("upload");
    setItems([]);
    setRawRows([]);
    setFileName("");
    setFillValues({});
    setBulkField("");
    setBulkValue("");
  };

  const validate = (next: any) => {
    const errors: string[] = [];
    if (!next.spo) errors.push("SPO obrigatório");
    if (!next.processo) errors.push("processo obrigatório");
    if (!next.origem_processo) errors.push("origem do processo obrigatória");
    if (!next.fornecedor) errors.push("fornecedor obrigatório");
    if (!next.valor || next.valor <= 0) errors.push("valor inválido");
    if (!next.vencimento) errors.push("vencimento obrigatório");
    if (!next.tipo_documento) errors.push("tipo de documento obrigatório");
    if (!next.forma_pagamento) errors.push("forma de pagamento obrigatória");
    if (!next.cobranca_em_nome_de) errors.push("contabilização fiscal obrigatória");
    next.status = errors.length ? "ERROR" : "VALID";
    next.validation_message = errors.length ? errors.join("; ") : null;
    return next;
  };

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const rows = await parseBatchSpreadsheet(file);
      setRawRows(rows);
      setFileName(file.name);
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { action: "preview_voucher_batch_import", userId, rows },
      });
      if (error || !data?.success) {
        toast({ title: "Falha ao validar planilha", description: data?.error || error?.message, variant: "destructive" });
        return;
      }
      const it = data.items || [];
      setItems(it);
      const missing = detectMissingColumns(it);
      setStep(missing.length ? "fill" : "preview");
    } catch (e: any) {
      toast({ title: "Erro lendo planilha", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const missingCols = useMemo(() => detectMissingColumns(items), [items]);

  const applyFillAndContinue = () => {
    const patches = fillValues;
    setItems(prev => prev.map(it => {
      const next = { ...it };
      const fo = { ...(it.field_origin || {}) };
      for (const [k, v] of Object.entries(patches)) {
        if (v === undefined || v === null || v === "") continue;
        next[k] = v;
        fo[k] = "MANUAL";
      }
      next.field_origin = fo;
      return validate(next);
    }));
    setStep("preview");
  };

  const applyBulk = () => {
    if (!bulkField || !bulkValue) return;
    const v = bulkField === "urgente" ? bulkValue === "true" : bulkValue;
    setItems(prev => prev.map(it => {
      const next = { ...it, [bulkField]: v };
      next.field_origin = { ...(it.field_origin || {}), [bulkField]: "MANUAL" };
      return validate(next);
    }));
    toast({ title: "Aplicado a todas as linhas" });
  };

  const confirm = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "create_voucher_batch_import",
          userId,
          rows: rawRows,
          items,
          file_name: fileName,
        },
      });
      if (error || !data?.success) {
        toast({ title: "Falha ao criar lote", description: data?.error || error?.message, variant: "destructive" });
        return;
      }
      toast({ title: `Lote criado: ${data.created} voucher(s)` });
      onCreated(data.batch_id);
      reset();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  const updateItem = (rowIndex: number, patch: any) => {
    setItems((prev) =>
      prev.map((it) => (it.row_index !== rowIndex ? it : validate({ ...it, ...patch })))
    );
  };

  const validCount = items.filter((i) => i.status === "VALID").length;
  const errCount = items.filter((i) => i.status === "ERROR").length;

  // Options for bulk value depending on field
  const bulkOptions = useMemo(() => {
    switch (bulkField) {
      case "origem_processo": return ORIGENS.map(v => ({ v, l: v }));
      case "tipo_documento": return TIPOS_DOC.map(v => ({ v, l: v }));
      case "forma_pagamento": return FORMAS.map(v => ({ v, l: v }));
      case "cobranca_em_nome_de": return [{ v: "DACHSER", l: "Sim — Fiscal" }, { v: "CLIENTE", l: "Não — Cliente" }];
      case "moeda": return [{ v: "BRL", l: "BRL" }, { v: "USD", l: "USD" }, { v: "EUR", l: "EUR" }];
      case "urgente": return [{ v: "true", l: "Sim" }, { v: "false", l: "Não" }];
      default: return [];
    }
  }, [bulkField]);

  const fieldLabel = (k: string) => ({
    origem_processo: "Origem Processo",
    tipo_documento: "Tipo Documento",
    cobranca_em_nome_de: "Fiscal",
    forma_pagamento: "Forma de Pagamento",
    moeda: "Moeda",
    urgente: "Urgente",
  } as Record<string, string>)[k] || k;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className={`${step === "preview" ? "max-w-[95vw]" : "max-w-2xl"} max-h-[90vh] overflow-hidden flex flex-col rounded-2xl border-border/60`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Importar SPO em Lote
          </DialogTitle>
          <DialogDescription className="text-xs">
            Crie múltiplos vouchers/SPO a partir de uma planilha CSV ou XLSX.
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="flex flex-col gap-5">
            <label
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={(e) => {
                e.preventDefault(); e.stopPropagation();
                const f = e.dataTransfer.files?.[0];
                if (f) handleFile(f);
              }}
              className="flex flex-col items-center justify-center gap-4 py-14 px-8 rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 transition cursor-pointer"
            >
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
              <div className="h-14 w-14 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                <Upload className="h-7 w-7" />
              </div>
              <div className="text-center space-y-1">
                <div className="text-base font-medium">Selecione sua planilha</div>
                <div className="text-xs text-muted-foreground">
                  Arraste e solte aqui ou clique no botão abaixo
                </div>
              </div>
              <Button
                type="button"
                onClick={(e) => { e.preventDefault(); inputRef.current?.click(); }}
                disabled={busy}
                className="mt-1"
              >
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
                Selecionar arquivo (.csv / .xlsx)
              </Button>
            </label>

            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Cabeçalhos esperados
              </div>
              <div className="flex flex-wrap gap-1.5">
                {EXPECTED_HEADERS.map((h) => (
                  <Badge key={h} variant="outline" className="font-normal">{h}</Badge>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === "fill" && (
          <div className="flex flex-col gap-5">
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-1">
              <div className="text-sm font-medium text-amber-300 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Campos ausentes na planilha
              </div>
              <div className="text-xs text-muted-foreground">
                Os campos abaixo não foram encontrados em nenhuma linha da planilha. Defina o valor para aplicar a todas as {items.length} linhas. Você poderá ajustar exceções na próxima etapa.
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {missingCols.map(c => (
                <div key={c.key} className="space-y-1.5">
                  <Label className="text-xs">{c.label} <span className="text-red-400">*</span></Label>
                  <Select
                    value={fillValues[c.key] || ""}
                    onValueChange={v => setFillValues(prev => ({ ...prev, [c.key]: v }))}
                  >
                    <SelectTrigger className="h-9"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {c.key === "origem_processo" && ORIGENS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                      {c.key === "tipo_documento" && TIPOS_DOC.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                      {c.key === "forma_pagamento" && FORMAS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                      {c.key === "cobranca_em_nome_de" && (
                        <>
                          <SelectItem value="DACHSER">Sim — Fiscal</SelectItem>
                          <SelectItem value="CLIENTE">Não — Cliente</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              ))}

              <div className="space-y-1.5">
                <Label className="text-xs">Urgente (opcional)</Label>
                <div className="flex items-center gap-2 h-9">
                  <Checkbox
                    checked={!!fillValues.urgente}
                    onCheckedChange={(v) => setFillValues(prev => ({ ...prev, urgente: !!v }))}
                  />
                  <span className="text-xs text-muted-foreground">Marcar todas como urgentes</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border/60">
              <Button variant="outline" onClick={reset} disabled={busy}>Voltar</Button>
              <Button
                onClick={applyFillAndContinue}
                disabled={busy || missingCols.some(c => !fillValues[c.key])}
              >
                Continuar
              </Button>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="flex flex-col gap-3 overflow-hidden flex-1">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-border bg-card/50 p-3">
                <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" /> Total
                </div>
                <div className="text-2xl font-semibold mt-1">{items.length}</div>
              </div>
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                <div className="text-xs text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Válidas
                </div>
                <div className="text-2xl font-semibold mt-1 text-emerald-400">{validCount}</div>
              </div>
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3">
                <div className="text-xs text-red-400 flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5" /> Com erro
                </div>
                <div className="text-2xl font-semibold mt-1 text-red-400">{errCount}</div>
              </div>
            </div>

            <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border/60 bg-card/40">
              <Wand2 className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs text-muted-foreground">Aplicar a todas:</span>
              <Select value={bulkField} onValueChange={(v) => { setBulkField(v); setBulkValue(""); }}>
                <SelectTrigger className="h-8 text-xs w-[180px]"><SelectValue placeholder="Campo" /></SelectTrigger>
                <SelectContent>
                  {["origem_processo","tipo_documento","forma_pagamento","cobranca_em_nome_de","moeda","urgente"].map(k => (
                    <SelectItem key={k} value={k}>{fieldLabel(k)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={bulkValue} onValueChange={setBulkValue} disabled={!bulkField}>
                <SelectTrigger className="h-8 text-xs w-[180px]"><SelectValue placeholder="Valor" /></SelectTrigger>
                <SelectContent>
                  {bulkOptions.map(o => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" variant="secondary" onClick={applyBulk} disabled={!bulkField || !bulkValue} className="h-8">
                Aplicar
              </Button>
            </div>

            <div className="flex-1 overflow-hidden rounded-xl border border-border">
              <BatchImportPreviewTable items={items} onChange={updateItem} />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-border/60">
              <Button variant="outline" onClick={reset} disabled={busy}>
                Voltar
              </Button>
              <Button onClick={confirm} disabled={busy || validCount === 0}>
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Criar {validCount} voucher(s)
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
