import { useRef, useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Upload, Loader2, FileSpreadsheet, CheckCircle2, AlertCircle, FileText, Wand2, Search, Info,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { parseBatchSpreadsheet } from "@/utils/batchVoucherImport";
import { BatchImportPreviewTable, type StatusFilter } from "./BatchImportPreviewTable";
import { BatchImportRowEditor } from "./BatchImportRowEditor";
import { FornecedoresSemFiscalDialog } from "./FornecedoresSemFiscalDialog";

const EXPECTED_HEADERS = [
  "SPO", "Processo", "Origem Processo", "Fornecedor", "CNPJ", "Valor", "Moeda",
  "Vencimento", "Data Emissão", "Tipo Documento", "Filial", "Forma Pagto",
  "Fiscal", "Urgente", "Comentários",
];

const ORIGENS = ["AIR", "SEA", "CHB", "ROD"];
const TIPOS_DOC = ["VOUCHER", "SPO", "ICMS", "ARMAZENAGEM", "ADF", "OUTROS"];
const FORMAS = ["BOLETO", "PIX", "TRANSFERENCIA", "DEPOSITO", "DARF", "GPS", "CAMBIO", "ADF", "CARTAO", "DEBITO"];

// origem_processo e forma_pagamento são SEMPRE por-linha (variam por voucher);
// nunca aparecem no step "fill" global.
const detectMissingColumns = (items: any[]) => {
  const checks: Array<{ key: string; label: string }> = [
    { key: "tipo_documento", label: "Tipo Documento" },
    { key: "cobranca_em_nome_de", label: "Fiscal" },
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

  // selection / filters / editor — all live in PARENT
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [editingRow, setEditingRow] = useState<number | null>(null);

  // Bulk
  const [bulkField, setBulkField] = useState<string>("");
  const [bulkValue, setBulkValue] = useState<string>("");
  const [bulkOpen, setBulkOpen] = useState(false);

  const reset = () => {
    setStep("upload");
    setItems([]);
    setRawRows([]);
    setFileName("");
    setFillValues({});
    setSelected(new Set());
    setFilter("all");
    setSearch("");
    setEditingRow(null);
    setBulkField(""); setBulkValue(""); setBulkOpen(false);
  };

  const validate = (next: any) => {
    const errors: string[] = [];
    if (!next.spo) errors.push("SPO obrigatório");
    if (!next.origem_processo) errors.push("origem do processo obrigatória");
    if (!next.fornecedor) errors.push("fornecedor obrigatório");
    if (!next.vencimento) errors.push("vencimento obrigatório");
    if (!next.tipo_documento) errors.push("tipo de documento obrigatório");
    if (!next.forma_pagamento) errors.push("forma de pagamento obrigatória");
    if (!next.cobranca_em_nome_de) errors.push("contabilização fiscal obrigatória");
    if (next.forma_pagamento === "PIX" && !next.chave_pix) errors.push("chave PIX obrigatória");
    next.status = errors.length ? "ERROR" : "VALID";
    next.validation_message = errors.length ? errors.join("; ") : null;
    return next;
  };

  // Marks rows that share the same (id_rm + spo) pair — would violate uq_voucher_rm_spo.
  const markDuplicates = (list: any[]) => {
    const groups = new Map<string, number[]>();
    list.forEach((it, idx) => {
      const rm = it?.id_rm == null ? "" : String(it.id_rm).trim();
      const spo = (it?.spo == null ? "" : String(it.spo)).trim().toUpperCase();
      if (!rm || !spo) return;
      const key = `${rm}|${spo}`;
      const arr = groups.get(key) || [];
      arr.push(idx);
      groups.set(key, arr);
    });
    const dupIdx = new Map<number, number>(); // arrayIdx -> firstRowIndex
    for (const indices of groups.values()) {
      if (indices.length < 2) continue;
      const firstRowIdx = list[indices[0]].row_index;
      for (let k = 1; k < indices.length; k++) dupIdx.set(indices[k], firstRowIdx);
    }
    return list.map((it, idx) => {
      if (dupIdx.has(idx)) {
        const firstRowIdx = dupIdx.get(idx)!;
        const dupMsg = `SPO duplicado nesta planilha (linha #${firstRowIdx + 1} já usa o mesmo SPO+RM)`;
        const existing = String(it.validation_message || "").split(";").map(s => s.trim()).filter(Boolean);
        if (!existing.includes(dupMsg)) existing.push(dupMsg);
        return { ...it, is_duplicate: true, duplicate_of_row: firstRowIdx, status: "ERROR", validation_message: existing.join("; ") };
      }
      // not duplicate: clear flags but DO NOT clobber other validation errors
      return { ...it, is_duplicate: false, duplicate_of_row: null };
    });
  };

  const revalidate = (list: any[]) => markDuplicates(list.map(validate));

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
      setItems(markDuplicates(it));
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
    setItems(prev => revalidate(prev.map(it => {
      const next = { ...it };
      const fo = { ...(it.field_origin || {}) };
      for (const [k, v] of Object.entries(patches)) {
        if (v === undefined || v === null || v === "") continue;
        next[k] = v;
        fo[k] = "MANUAL";
      }
      next.field_origin = fo;
      return next;
    })));
    setStep("preview");
  };

  const applyBulk = () => {
    if (!bulkField || !bulkValue) return;
    if (selected.size === 0) {
      toast({ title: "Selecione ao menos uma linha", variant: "destructive" });
      return;
    }
    const v = bulkField === "urgente" ? bulkValue === "true" : bulkValue;
    setItems(prev => revalidate(prev.map(it => {
      if (!selected.has(it.row_index)) return it;
      const next = { ...it, [bulkField]: v };
      next.field_origin = { ...(it.field_origin || {}), [bulkField]: "MANUAL" };
      return next;
    })));
    toast({ title: `Aplicado a ${selected.size} linha(s)` });
    setBulkOpen(false);
    setBulkField(""); setBulkValue("");
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
      revalidate(prev.map((it) => (it.row_index !== rowIndex ? it : { ...it, ...patch, field_origin: {
        ...(it.field_origin || {}),
        ...Object.fromEntries(Object.keys(patch).map(k => [k, "MANUAL"])),
      } })))
    );
  };

  const removeRow = (rowIndex: number) => {
    setItems((prev) => prev.filter((it) => it.row_index !== rowIndex));
    setSelected((prev) => {
      const n = new Set(prev); n.delete(rowIndex); return n;
    });
  };

  const toggleSelect = (rowIndex: number) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(rowIndex)) n.delete(rowIndex); else n.add(rowIndex);
      return n;
    });
  };

  const selectAllVisible = (rowIndexes: number[], allSelected: boolean) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (allSelected) rowIndexes.forEach(i => n.delete(i));
      else rowIndexes.forEach(i => n.add(i));
      return n;
    });
  };

  const validCount = items.filter((i) => i.status === "VALID").length;
  const errCount = items.filter((i) => i.status === "ERROR").length;
  const validPct = items.length ? (validCount / items.length) * 100 : 0;

  const errorReasons = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of items) {
      if (it.status !== "ERROR" || !it.validation_message) continue;
      const seen = new Set<string>();
      for (const raw of String(it.validation_message).split(";")) {
        const m = raw.trim();
        if (!m || seen.has(m)) continue;
        seen.add(m);
        map.set(m, (map.get(m) || 0) + 1);
      }
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [items]);

  const visibleCount = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(it => {
      if (filter === "errors" && it.status !== "ERROR") return false;
      if (filter === "valid" && it.status !== "VALID") return false;
      if (q) {
        const hay = `${it.spo || ""} ${it.processo || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).length;
  }, [items, filter, search]);

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

  const editingItem = editingRow != null ? items.find(i => i.row_index === editingRow) ?? null : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent
        className={`${step === "preview" ? "w-[90vw] max-w-[1400px] h-[90vh]" : "max-w-2xl max-h-[85vh]"} overflow-hidden flex flex-col rounded-2xl border-border/60`}
      >
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
                <br />
                <span className="italic">Origem Processo, Forma de Pagamento e Urgente devem ser definidos por linha — use o botão de edição ou "Editar em lote" na próxima etapa.</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {missingCols.map(c => (
                <div key={c.key} className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1.5">
                    {c.label} <span className="text-red-400">*</span>
                    {c.key === "cobranca_em_nome_de" && (
                      <FornecedoresSemFiscalDialog
                        trigger={
                          <button type="button" className="text-muted-foreground hover:text-primary inline-flex" title="Ver fornecedores sem fiscal">
                            <Info className="h-3 w-3" />
                          </button>
                        }
                      />
                    )}
                  </Label>
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
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-border bg-card/50 p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-muted/30 flex items-center justify-center">
                  <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Total</div>
                  <div className="text-2xl font-semibold leading-tight">{items.length}</div>
                </div>
              </div>
              <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-emerald-400">Válidas</div>
                  <div className="text-2xl font-semibold text-emerald-400 leading-tight">{validCount}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFilter(filter === "errors" ? "all" : "errors")}
                className={`text-left rounded-xl border p-4 flex items-center gap-3 transition-colors ${
                  filter === "errors" ? "border-red-500/60 bg-red-500/10" : "border-red-500/40 bg-red-500/5 hover:bg-red-500/10"
                }`}
              >
                <div className="h-10 w-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                  <AlertCircle className="h-5 w-5 text-red-400" />
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-red-400">Com erro</div>
                  <div className="text-2xl font-semibold text-red-400 leading-tight">{errCount}</div>
                </div>
              </button>
            </div>

            {/* Progress */}
            <div className="space-y-1.5">
              <div className="h-1.5 w-full rounded-full bg-muted/40 overflow-hidden flex">
                <div className="bg-emerald-500 h-full transition-all" style={{ width: `${validPct}%` }} />
                <div className="bg-red-500 h-full transition-all" style={{ width: `${100 - validPct}%` }} />
              </div>
              <div className="text-xs text-muted-foreground">
                {validCount} de {items.length} registros prontos para importação
              </div>
            </div>

            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-xl border border-border/60 bg-card/40">
              <Popover open={bulkOpen} onOpenChange={setBulkOpen}>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="secondary" className="h-8 gap-1.5" disabled={selected.size === 0}>
                    <Wand2 className="h-3.5 w-3.5" />
                    Editar em lote {selected.size > 0 && `(${selected.size})`}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72 p-3 space-y-2">
                  <div className="text-xs font-medium">Aplicar a {selected.size} linha(s) selecionada(s)</div>
                  <Select value={bulkField} onValueChange={(v) => { setBulkField(v); setBulkValue(""); }}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Campo" /></SelectTrigger>
                    <SelectContent>
                      {["origem_processo","tipo_documento","forma_pagamento","cobranca_em_nome_de","moeda","urgente"].map(k => (
                        <SelectItem key={k} value={k}>{fieldLabel(k)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={bulkValue} onValueChange={setBulkValue} disabled={!bulkField}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Valor" /></SelectTrigger>
                    <SelectContent>
                      {bulkOptions.map(o => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="flex justify-end gap-2 pt-1">
                    <Button size="sm" variant="ghost" onClick={() => setBulkOpen(false)} className="h-7">Cancelar</Button>
                    <Button size="sm" onClick={applyBulk} disabled={!bulkField || !bulkValue} className="h-7">Aplicar</Button>
                  </div>
                </PopoverContent>
              </Popover>

              <div className="h-5 w-px bg-border" />

              {(["all", "errors", "valid"] as StatusFilter[]).map((f) => (
                <Button
                  key={f}
                  size="sm"
                  variant={filter === f ? "default" : "outline"}
                  className="h-8 rounded-full text-xs"
                  onClick={() => setFilter(f)}
                >
                  {f === "all" ? "Todos" : f === "errors" ? "Com erro" : "Válidos"}
                </Button>
              ))}

              <div className="ml-auto relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar SPO ou processo..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 text-xs pl-8 w-64"
                />
              </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-hidden">
              <BatchImportPreviewTable
                items={items}
                selected={selected}
                filter={filter}
                search={search}
                onToggleSelect={toggleSelect}
                onSelectAllVisible={selectAllVisible}
                onRemove={removeRow}
                onEdit={(i) => setEditingRow(i)}
              />
            </div>

            <div className="text-[11px] text-muted-foreground px-1">
              Mostrando {visibleCount} de {items.length} linha(s){visibleCount < items.length ? " — role a tabela para ver mais" : ""}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 pt-2 border-t border-border/60">
              <div className="flex items-center gap-3 flex-1 min-w-0 flex-wrap">
                <Button variant="outline" onClick={reset} disabled={busy}>
                  Voltar
                </Button>
                {errorReasons.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 items-center">
                    {errorReasons.map(([msg, count]) => (
                      <button
                        key={msg}
                        type="button"
                        onClick={() => { setFilter("errors"); setSearch(""); }}
                        className="text-xs px-2.5 py-1 rounded-full border border-red-500/30 bg-red-500/5 text-red-300 hover:bg-red-500/10"
                        title="Filtrar linhas com erro"
                      >
                        {count} {count === 1 ? "linha com" : "linhas com"} {msg}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {validCount === 0 && (
                  <span className="text-xs text-muted-foreground">Corrija os erros para habilitar a importação</span>
                )}
                <Button onClick={confirm} disabled={busy || validCount === 0}>
                  {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Criar {validCount} voucher(s)
                </Button>
              </div>
            </div>

            <BatchImportRowEditor
              item={editingItem}
              open={editingRow != null}
              onOpenChange={(v) => { if (!v) setEditingRow(null); }}
              onSave={updateItem}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
