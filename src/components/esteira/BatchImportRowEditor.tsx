import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Info } from "lucide-react";
import { FornecedoresSemFiscalDialog } from "./FornecedoresSemFiscalDialog";
import type { PreviewItem } from "./BatchImportPreviewTable";

const TIPOS_DOC = ["VOUCHER", "SPO", "ICMS", "ARMAZENAGEM", "ADF", "OUTROS"];
const FORMAS = ["BOLETO", "PIX", "TRANSFERENCIA", "DEPOSITO", "DARF", "GPS", "CAMBIO", "ADF", "CARTAO", "DEBITO"];
const ORIGENS = ["AIR", "SEA", "CHB", "ROD"];
const MOEDAS = ["BRL", "USD", "EUR"];

interface Props {
  item: PreviewItem | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (rowIndex: number, patch: Partial<PreviewItem>) => void;
}

export function BatchImportRowEditor({ item, open, onOpenChange, onSave }: Props) {
  const [draft, setDraft] = useState<PreviewItem | null>(item);

  useEffect(() => {
    setDraft(item);
  }, [item]);

  if (!draft) return null;
  const set = <K extends keyof PreviewItem>(k: K, v: PreviewItem[K]) => setDraft({ ...draft, [k]: v });

  const handleSave = () => {
    if (!draft) return;
    const { row_index, status, validation_message, dfv_found, field_origin, ...rest } = draft;
    onSave(draft.row_index, rest as Partial<PreviewItem>);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            Editar SPO {draft.spo || "—"}
            <Badge
              variant="outline"
              className={
                draft.status === "ERROR"
                  ? "border-red-500/40 text-red-400"
                  : "border-emerald-500/40 text-emerald-400"
              }
            >
              {draft.status === "ERROR" ? "Com erro" : "Válida"}
            </Badge>
          </SheetTitle>
          <SheetDescription className="text-xs">
            Linha #{draft.row_index + 1} — ajuste os campos e salve para revalidar.
          </SheetDescription>
        </SheetHeader>

        <div className="py-4 space-y-6">
          {/* Identificação */}
          <section className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Identificação</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs">SPO</Label>
                <Input value={draft.spo || ""} readOnly className="h-8 font-mono text-xs bg-muted/40" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Processo</Label>
                <Input className="h-8 text-xs" value={draft.processo || ""} onChange={(e) => set("processo", e.target.value || null)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Origem Processo</Label>
                <div className="grid grid-cols-4 gap-1.5">
                  {ORIGENS.map((o) => {
                    const active = (draft.origem_processo || "") === o;
                    return (
                      <button
                        key={o}
                        type="button"
                        onClick={() => set("origem_processo", active ? null : o)}
                        className={`h-8 rounded-md border text-xs font-medium transition-colors ${
                          active
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background text-foreground border-border hover:bg-muted"
                        }`}
                      >
                        {o}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs">Fornecedor</Label>
                <Input className="h-8 text-xs bg-muted/40" value={draft.fornecedor || ""} readOnly />
                <p className="text-[10px] text-muted-foreground">Preenchido automaticamente pela base RM (nome_beneficiario).</p>
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs">CNPJ</Label>
                <Input className="h-8 text-xs" value={draft.cnpj_fornecedor || ""} onChange={(e) => set("cnpj_fornecedor", e.target.value.replace(/\D/g, "") || null)} />
              </div>
            </div>
          </section>

          <Separator />

          {/* Financeiro */}
          <section className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Financeiro</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Valor</Label>
                <Input
                  type="number" step="0.01" className="h-8 text-xs"
                  value={draft.valor ?? ""}
                  onChange={(e) => set("valor", e.target.value === "" ? null : Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Moeda</Label>
                <Select value={draft.moeda || "BRL"} onValueChange={(v) => set("moeda", v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MOEDAS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Forma de Pagamento</Label>
                <Select value={draft.forma_pagamento || ""} onValueChange={(v) => set("forma_pagamento", v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {FORMAS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1.5">
                  Fiscal <span className="text-red-400">*</span>
                  <FornecedoresSemFiscalDialog
                    trigger={
                      <button type="button" className="text-muted-foreground hover:text-primary inline-flex" title="Ver fornecedores sem fiscal">
                        <Info className="h-3 w-3" />
                      </button>
                    }
                  />
                </Label>
                <Select value={draft.cobranca_em_nome_de || ""} onValueChange={(v) => set("cobranca_em_nome_de", v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DACHSER">Sim — Fiscal</SelectItem>
                    <SelectItem value="CLIENTE">Não — Cliente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <Separator />

          {/* Datas */}
          <section className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Datas</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Vencimento</Label>
                <Input type="date" className="h-8 text-xs" value={draft.vencimento || ""} onChange={(e) => set("vencimento", e.target.value || null)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Emissão</Label>
                <Input type="date" className="h-8 text-xs" value={draft.data_emissao || ""} onChange={(e) => set("data_emissao", e.target.value || null)} />
              </div>
            </div>
          </section>

          <Separator />

          {/* Classificação */}
          <section className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Classificação</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Tipo Documento</Label>
                <Select value={draft.tipo_documento || ""} onValueChange={(v) => set("tipo_documento", v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {TIPOS_DOC.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Filial</Label>
                <Input className="h-8 text-xs" value={draft.filial || ""} onChange={(e) => set("filial", e.target.value || null)} />
              </div>
              <div className="flex items-center gap-2 col-span-2">
                <Checkbox checked={!!draft.urgente} onCheckedChange={(v) => set("urgente", !!v)} id="row-urgente" />
                <Label htmlFor="row-urgente" className="text-xs cursor-pointer">Marcar como urgente</Label>
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs">Comentários</Label>
                <Textarea
                  className="text-xs min-h-[60px]"
                  value={draft.comentarios || ""}
                  onChange={(e) => set("comentarios", e.target.value || null)}
                />
              </div>
            </div>
          </section>

          {draft.validation_message && (
            <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-400">
              <div className="font-semibold mb-1">Erros de validação</div>
              <ul className="list-disc list-inside space-y-0.5">
                {draft.validation_message.split(";").map((m, i) => <li key={i}>{m.trim()}</li>)}
              </ul>
            </div>
          )}
        </div>

        <SheetFooter className="border-t border-border/60 pt-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave}>Salvar alterações</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
