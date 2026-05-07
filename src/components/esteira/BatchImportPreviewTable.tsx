import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertCircle } from "lucide-react";

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
  status: string;
  validation_message: string | null;
  dfv_found?: boolean;
  field_origin?: Record<string, "DFV" | "PLANILHA" | "MANUAL" | null>;
}

const TIPOS_DOC = ["VOUCHER", "SPO", "ICMS", "ARMAZENAGEM", "ADF", "OUTROS"];
const FORMAS = ["BOLETO", "PIX", "TRANSFERENCIA", "DEPOSITO", "DARF", "GPS", "CAMBIO", "ADF", "CARTAO", "DEBITO"];
const ORIGENS = ["AIR", "SEA", "CHB", "ROD"];
const MOEDAS = ["BRL", "USD", "EUR"];

interface Props {
  items: PreviewItem[];
  onChange: (rowIndex: number, patch: Partial<PreviewItem>) => void;
}

const OriginBadge = ({ origin }: { origin?: string | null }) => {
  if (!origin) return null;
  const cls =
    origin === "DFV"
      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
      : origin === "MANUAL"
      ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
      : "bg-sky-500/10 text-sky-400 border-sky-500/30";
  return (
    <Badge variant="outline" className={`text-[9px] px-1 py-0 ml-1 ${cls}`}>
      {origin === "PLANILHA" ? "PL" : origin === "DFV" ? "RM" : "MN"}
    </Badge>
  );
};

export function BatchImportPreviewTable({ items, onChange }: Props) {
  const patch = (i: number, key: keyof PreviewItem, value: any) => {
    onChange(i, { [key]: value, field_origin: { ...(items[i].field_origin || {}), [key as string]: "MANUAL" } } as any);
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className="max-h-[520px] overflow-auto rounded-lg border border-white/10">
        <Table className="text-xs">
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow>
              <TableHead className="w-8">#</TableHead>
              <TableHead className="w-8"></TableHead>
              <TableHead>SPO</TableHead>
              <TableHead>Processo</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead>Fornecedor</TableHead>
              <TableHead>CNPJ</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Moeda</TableHead>
              <TableHead>Vencim.</TableHead>
              <TableHead>Emissão</TableHead>
              <TableHead>Tipo Doc</TableHead>
              <TableHead>Filial</TableHead>
              <TableHead>Forma Pag.</TableHead>
              <TableHead>Fiscal?</TableHead>
              <TableHead>Urg.</TableHead>
              <TableHead>Coment.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((it, idx) => {
              const fo = it.field_origin || {};
              const rowCls =
                it.status === "ERROR" ? "bg-red-500/5" : it.dfv_found ? "" : "bg-amber-500/5";
              return (
                <TableRow key={it.row_index} className={rowCls}>
                  <TableCell className="text-muted-foreground">{it.row_index + 1}</TableCell>
                  <TableCell>
                    {it.status === "ERROR" ? (
                      <Tooltip>
                        <TooltipTrigger>
                          <AlertCircle className="h-3.5 w-3.5 text-red-400" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">{it.validation_message}</TooltipContent>
                      </Tooltip>
                    ) : (
                      <span
                        className={`text-[10px] font-semibold ${
                          it.dfv_found ? "text-emerald-400" : "text-sky-400"
                        }`}
                        title={it.dfv_found ? "Encontrado no RM" : "Apenas planilha"}
                      >
                        {it.dfv_found ? "RM" : "PL"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono">{it.spo || "—"}</TableCell>
                  <TableCell>
                    <Input
                      className="h-7 text-xs"
                      value={it.processo || ""}
                      onChange={(e) => patch(idx, "processo", e.target.value || null)}
                    />
                    <OriginBadge origin={fo.processo} />
                  </TableCell>
                  <TableCell>
                    <Select value={it.origem_processo || ""} onValueChange={(v) => patch(idx, "origem_processo", v)}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        {ORIGENS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <OriginBadge origin={fo.origem_processo} />
                  </TableCell>
                  <TableCell>
                    <Input className="h-7 text-xs min-w-[140px]" value={it.fornecedor || ""}
                      onChange={(e) => patch(idx, "fornecedor", e.target.value || null)} />
                    <OriginBadge origin={fo.fornecedor} />
                  </TableCell>
                  <TableCell>
                    <Input className="h-7 text-xs min-w-[120px]" value={it.cnpj_fornecedor || ""}
                      onChange={(e) => patch(idx, "cnpj_fornecedor", e.target.value.replace(/\D/g, "") || null)} />
                    <OriginBadge origin={fo.cnpj_fornecedor} />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number" step="0.01"
                      className="h-7 text-xs w-[100px]"
                      value={it.valor ?? ""}
                      onChange={(e) => patch(idx, "valor", e.target.value === "" ? null : Number(e.target.value))}
                    />
                    <OriginBadge origin={fo.valor} />
                  </TableCell>
                  <TableCell>
                    <Select value={it.moeda || "BRL"} onValueChange={(v) => patch(idx, "moeda", v)}>
                      <SelectTrigger className="h-7 text-xs w-[72px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MOEDAS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <OriginBadge origin={fo.moeda} />
                  </TableCell>
                  <TableCell>
                    <Input type="date" className="h-7 text-xs"
                      value={it.vencimento || ""} onChange={(e) => patch(idx, "vencimento", e.target.value || null)} />
                    <OriginBadge origin={fo.vencimento} />
                  </TableCell>
                  <TableCell>
                    <Input type="date" className="h-7 text-xs"
                      value={it.data_emissao || ""} onChange={(e) => patch(idx, "data_emissao", e.target.value || null)} />
                    <OriginBadge origin={fo.data_emissao} />
                  </TableCell>
                  <TableCell>
                    <Select value={it.tipo_documento || ""} onValueChange={(v) => patch(idx, "tipo_documento", v)}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        {TIPOS_DOC.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <OriginBadge origin={fo.tipo_documento} />
                  </TableCell>
                  <TableCell>
                    <Input className="h-7 text-xs w-[80px]" value={it.filial || ""}
                      onChange={(e) => patch(idx, "filial", e.target.value || null)} />
                    <OriginBadge origin={fo.filial} />
                  </TableCell>
                  <TableCell>
                    <Select value={it.forma_pagamento || ""} onValueChange={(v) => patch(idx, "forma_pagamento", v)}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        {FORMAS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <OriginBadge origin={fo.forma_pagamento} />
                  </TableCell>
                  <TableCell>
                    <Select value={it.cobranca_em_nome_de || "DACHSER"} onValueChange={(v) => patch(idx, "cobranca_em_nome_de", v)}>
                      <SelectTrigger className="h-7 text-xs w-[110px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DACHSER">Sim — Fiscal</SelectItem>
                        <SelectItem value="CLIENTE">Não — Cliente</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Checkbox checked={!!it.urgente} onCheckedChange={(v) => patch(idx, "urgente", !!v)} />
                  </TableCell>
                  <TableCell>
                    <Input className="h-7 text-xs min-w-[140px]" value={it.comentarios || ""}
                      onChange={(e) => patch(idx, "comentarios", e.target.value || null)} />
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
