import { useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { AlertTriangle, CheckCircle2, Pencil, Trash2 } from "lucide-react";

export interface PreviewItem {
  row_index: number;
  spo: string | null;
  id_rm: string | number | null;
  processo: string | null;
  origem_processo: string | null;
  fornecedor: string | null;
  cnpj_fornecedor: string | null;
  valor: number | null;
  moeda: string | null;
  vencimento: string | null;
  data_emissao: string | null;
  tipo_documento: string | null;
  filial: string | null;
  forma_pagamento: string | null;
  cobranca_em_nome_de: string | null;
  urgente: boolean;
  comentarios: string | null;
  fatura: string | null;
  chave_pix?: string | null;
  status: string;
  validation_message: string | null;
  dfv_found?: boolean;
  field_origin?: Record<string, "DFV" | "PLANILHA" | "MANUAL" | null>;
  is_duplicate?: boolean;
  duplicate_of_row?: number | null;
  already_exists?: boolean;
  existing_etapa?: string | null;
  expanded_from_processo?: boolean;
  source_row_index?: number | null;
}

export type StatusFilter = "all" | "errors" | "valid";

interface Props {
  items: PreviewItem[];
  selected: Set<number>;
  filter: StatusFilter;
  search: string;
  onToggleSelect: (rowIndex: number) => void;
  onSelectAllVisible: (rowIndexes: number[], allSelected: boolean) => void;
  onRemove: (rowIndex: number) => void;
  onEdit: (rowIndex: number) => void;
}

const fmtCurrency = (v: number | null, moeda?: string | null) => {
  if (v == null) return "—";
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda || "BRL" }).format(v);
  } catch {
    return v.toFixed(2);
  }
};

const fmtDate = (v: string | null) => {
  if (!v) return "—";
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return v;
};

export function BatchImportPreviewTable({
  items, selected, filter, search,
  onToggleSelect, onSelectAllVisible, onRemove, onEdit,
}: Props) {
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (filter === "errors" && it.status !== "ERROR") return false;
      if (filter === "valid" && it.status !== "VALID") return false;
      if (q) {
        const hay = `${it.spo || ""} ${it.processo || ""} ${it.fornecedor || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, filter, search]);

  const visibleIdx = visible.map((v) => v.row_index);
  const allVisibleSelected = visibleIdx.length > 0 && visibleIdx.every((i) => selected.has(i));
  const someVisibleSelected = visibleIdx.some((i) => selected.has(i)) && !allVisibleSelected;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="h-full overflow-auto rounded-lg border border-border/60">
        <Table className="text-xs">
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10">
                <Checkbox
                  checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                  onCheckedChange={() => onSelectAllVisible(visibleIdx, allVisibleSelected)}
                />
              </TableHead>
              <TableHead className="w-10 text-[11px] uppercase tracking-wider text-muted-foreground">#</TableHead>
              <TableHead className="w-10"></TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">SPO</TableHead>
              <TableHead className="hidden lg:table-cell text-[11px] uppercase tracking-wider text-muted-foreground">Processo</TableHead>
              <TableHead className="hidden lg:table-cell text-[11px] uppercase tracking-wider text-muted-foreground">Fornecedor</TableHead>
              <TableHead className="text-right text-[11px] uppercase tracking-wider text-muted-foreground">Valor</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Vencimento</TableHead>
              <TableHead className="w-24 text-right text-[11px] uppercase tracking-wider text-muted-foreground">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                  Nenhuma linha corresponde ao filtro.
                </TableCell>
              </TableRow>
            )}
            {visible.map((it) => {
              const isSel = selected.has(it.row_index);
              const isErr = it.status === "ERROR";
              return (
                <TableRow
                  key={it.row_index}
                  onDoubleClick={() => onEdit(it.row_index)}
                  className={`group h-[52px] cursor-pointer transition-colors even:bg-card/20 hover:bg-primary/5 ${isSel ? "!bg-amber-500/10" : ""}`}
                >
                  <TableCell className="py-3.5 px-3">
                    <Checkbox checked={isSel} onCheckedChange={() => onToggleSelect(it.row_index)} />
                  </TableCell>
                  <TableCell className="py-3.5 px-3 text-muted-foreground font-mono">{it.row_index + 1}</TableCell>
                  <TableCell className="py-3.5 px-3">
                    {isErr ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex">
                            <AlertTriangle className="h-4 w-4 text-red-400 group-hover:animate-pulse" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <div className="font-semibold mb-1">Erros</div>
                          <ul className="list-disc list-inside space-y-0.5 text-xs">
                            {(it.validation_message || "").split(";").map((m, i) => <li key={i}>{m.trim()}</li>)}
                          </ul>
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex">
                            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>{it.dfv_found ? "Válida — encontrada no RM" : "Válida — apenas planilha"}</TooltipContent>
                      </Tooltip>
                    )}
                  </TableCell>
                  <TableCell className="py-3.5 px-3 font-mono text-foreground">
                    <div className="inline-flex items-center gap-1.5">
                      <span>{it.spo || "—"}</span>
                      {it.is_duplicate && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center rounded-md border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-400">
                              Duplicado
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            Mesma combinação SPO + RM da linha #{(it.duplicate_of_row ?? 0) + 1}
                          </TooltipContent>
                        </Tooltip>
                      )}
                      {it.already_exists && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                              Já na etapa {it.existing_etapa || '—'}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            Este SPO já existe no sistema para o mesmo RM, atualmente na etapa {it.existing_etapa || 'desconhecida'}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-3.5 px-3 hidden lg:table-cell text-foreground/90">
                    <div className="flex items-center gap-1.5">
                      <span>{it.processo || "—"}</span>
                      {it.expanded_from_processo && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal border-primary/40 text-primary">
                              SPO {(it.source_row_index ?? 0) + 1}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            Processo com múltiplos SPOs — esta linha foi expandida da linha #{(it.source_row_index ?? 0) + 1} da planilha.
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-3.5 px-3 hidden lg:table-cell max-w-[220px]">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="truncate text-foreground/90">{it.fornecedor || "—"}</div>
                      </TooltipTrigger>
                      {it.fornecedor && <TooltipContent>{it.fornecedor}</TooltipContent>}
                    </Tooltip>
                  </TableCell>
                  <TableCell className="py-3.5 px-3 text-right font-mono text-foreground">{fmtCurrency(it.valor, it.moeda)}</TableCell>
                  <TableCell className="py-3.5 px-3 font-mono text-foreground/90">{fmtDate(it.vencimento)}</TableCell>
                  <TableCell className="py-3.5 px-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(it.row_index)} title="Editar linha">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-red-400" title="Remover">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-64 p-3">
                          <div className="text-xs text-foreground mb-3">
                            Remover esta linha? Essa ação não pode ser desfeita.
                          </div>
                          <div className="flex justify-end gap-2">
                            <PopoverPrimitive.Close asChild>
                              <Button size="sm" variant="outline">Cancelar</Button>
                            </PopoverPrimitive.Close>
                            <PopoverPrimitive.Close asChild>
                              <Button size="sm" variant="destructive" onClick={() => onRemove(it.row_index)}>
                                Confirmar remoção
                              </Button>
                            </PopoverPrimitive.Close>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  );
}
