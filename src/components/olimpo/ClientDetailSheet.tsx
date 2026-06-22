import { useState, useEffect, useCallback } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

import { useToast } from "@/hooks/use-toast";
import { getClientDetail, getClientDisputas, getClientEmailLogs, getClientFaturas, saveCobrancaObservacao } from "@/services/olimpo/cobrancaService";
import { TablePagination } from "@/components/layout/TablePagination";
import {
  Building2,
  Mail,
  Save,
  Loader2,
  FileText,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";

interface CnpjDetail {
  cnpj: string;
  cnpjClean: string;
  not_due: number;
  aging_30: number;
  aging_90: number;
  aging_180: number;
  aging_240: number;
  aging_360: number;
  aging_360_plus: number;
  totalCount: number;
  condicao_pagamento: string | null;
  nome_vendedor: string | null;
  disputa_total?: number;
  disputa_count?: number;
}

interface Observacao {
  cnpj: string;
  observacao: string;
  updated_by: string | null;
  updated_at: string | null;
}

interface Contato {
  cnpjClean: string;
  nome_contato: string | null;
  email_contato: string;
}

interface EmailLog {
  id: number;
  stage: string;
  subject: string | null;
  sent_at: string;
  success: 0 | 1;
  error_message: string | null;
}

interface DisputaRow {
  nd: string | null;
  numero_nf: string | null;
  documento: string | null;
  valor_nf: number;
  modal: string | null;
  data_emissao: string | null;
  data_vencimento: string | null;
}

interface AgingRow {
  product: string;
  cnpjs?: string[];
}

interface FaturaRow {
  documento: string;
  nd: string;
  referencia_cliente: string;
  numero_nf: string;
  tipo_documento: string;
  data_vencimento: string;
  data_emissao: string;
  valor_nf: number;
  modal: string | null;
  disputa: number;
  condicao_pagamento: string;
  nome_vendedor: string;
  numero_processo: string;
}


interface ClientDetailSheetProps {
  client: AgingRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const agingKeys = ["not_due", "aging_30", "aging_90", "aging_180", "aging_240", "aging_360", "aging_360_plus"] as const;
const AGING_LABELS: Record<string, string> = {
  not_due: "Not Due",
  aging_30: "0-30",
  aging_90: "31-90",
  aging_180: "91-180",
  aging_240: "181-240",
  aging_360: "241-360",
  aging_360_plus: "> 360",
};
const AGING_COLORS: Record<string, string> = {
  not_due: "#22c55e",
  aging_30: "#84cc16",
  aging_90: "#eab308",
  aging_180: "#f97316",
  aging_240: "#ef4444",
  aging_360: "#dc2626",
  aging_360_plus: "#991b1b",
};

function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}

function formatBRLFull(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export function ClientDetailSheet({ client, open, onOpenChange }: ClientDetailSheetProps) {
  const [cnpjData, setCnpjData] = useState<CnpjDetail[]>([]);
  const [observacoes, setObservacoes] = useState<Record<string, string>>({});
  const [contatos, setContatos] = useState<Record<string, Contato[]>>({});
  const [emailLogs, setEmailLogs] = useState<Record<string, Record<string, EmailLog[]>>>({});
  const [savingCnpj, setSavingCnpj] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Faturas state
  const [faturasOpen, setFaturasOpen] = useState(false);
  const [faturas, setFaturas] = useState<FaturaRow[]>([]);
  const [faturasTotal, setFaturasTotal] = useState(0);
  const [faturasPage, setFaturasPage] = useState(1);
  const [faturasLoading, setFaturasLoading] = useState(false);
  const [modalFilter, setModalFilter] = useState("");
  const [modalFilterDebounced, setModalFilterDebounced] = useState("");
  const faturasPageSize = 20;
  const [vencSort, setVencSort] = useState<"overdue-first" | "asc" | "desc">("overdue-first");

  // Disputas por CNPJ (lazy)
  const [disputasOpen, setDisputasOpen] = useState<Record<string, boolean>>({});
  const [disputasByCnpj, setDisputasByCnpj] = useState<Record<string, DisputaRow[]>>({});
  const [disputasLoading, setDisputasLoading] = useState<Record<string, boolean>>({});

  // Debounce do filtro modal
  useEffect(() => {
    const t = setTimeout(() => setModalFilterDebounced(modalFilter.trim()), 300);
    return () => clearTimeout(t);
  }, [modalFilter]);


  const fetchDetail = useCallback(async () => {
    if (!client?.product) return;
    setLoading(true);
    try {
      const data = await getClientDetail(client.product);
      if (!data?.success) throw new Error(data?.error || "Erro");
      setCnpjData(data.data || []);
      const obsMap: Record<string, string> = {};
      for (const obs of (data.observacoes || []) as Observacao[]) {
        obsMap[obs.cnpj] = obs.observacao || "";
      }
      setObservacoes(obsMap);
      const contMap: Record<string, Contato[]> = {};
      for (const c of (data.contatos || []) as Contato[]) {
        if (!contMap[c.cnpjClean]) contMap[c.cnpjClean] = [];
        contMap[c.cnpjClean].push(c);
      }
      setContatos(contMap);

      // Buscar histórico de envios de e-mail por CNPJ em paralelo
      const cnpjList = (data.data || []).map((d: any) => d.cnpjClean).filter(Boolean);
      if (cnpjList.length > 0) {
        const results = await Promise.all(
          cnpjList.map((cnpjClean: string) =>
            getClientEmailLogs(cnpjClean)
              .then((r) => ({ cnpjClean, logs: (r?.logsByEmail || {}) as Record<string, EmailLog[]> }))
              .catch(() => ({ cnpjClean, logs: {} as Record<string, EmailLog[]> }))
          )
        );
        const logsMap: Record<string, Record<string, EmailLog[]>> = {};
        for (const r of results) logsMap[r.cnpjClean] = r.logs;
        setEmailLogs(logsMap);
      } else {
        setEmailLogs({});
      }
    } catch (err: any) {
      console.error("Error fetching client detail:", err);
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [client?.product]);

  const fetchFaturas = useCallback(async (page: number, modalQ?: string) => {
    if (!client?.product) return;
    setFaturasLoading(true);
    try {
      const data = await getClientFaturas({ clientName: client.product, page, pageSize: faturasPageSize, modalFilter: modalQ ?? modalFilterDebounced, vencSort });
      if (!data?.success) throw new Error(data?.error || "Erro");
      setFaturas(data.rows || []);
      setFaturasTotal(data.total || 0);
      setFaturasPage(page);
    } catch (err: any) {
      console.error("Error fetching faturas:", err);
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setFaturasLoading(false);
    }
  }, [client?.product, modalFilterDebounced, vencSort]);

  const fetchDisputasForCnpj = useCallback(async (cnpjClean: string) => {
    if (disputasByCnpj[cnpjClean] || disputasLoading[cnpjClean]) return;
    setDisputasLoading((prev) => ({ ...prev, [cnpjClean]: true }));
    try {
      const data = await getClientDisputas(cnpjClean);
      if (!data?.success) throw new Error(data?.error || "Erro");
      setDisputasByCnpj((prev) => ({ ...prev, [cnpjClean]: data.rows || [] }));
    } catch (err: any) {
      console.error("Error fetching disputas:", err);
      toast({ title: "Erro ao buscar disputas", description: err.message, variant: "destructive" });
    } finally {
      setDisputasLoading((prev) => ({ ...prev, [cnpjClean]: false }));
    }
  }, [disputasByCnpj, disputasLoading]);


  useEffect(() => {
    if (open && client) {
      fetchDetail();
      setFaturasOpen(false);
      setFaturas([]);
      setFaturasPage(1);
    }
  }, [open, client, fetchDetail]);

  useEffect(() => {
    if (faturasOpen && faturas.length === 0 && client?.product) {
      fetchFaturas(1);
    }
  }, [faturasOpen]);

  // Refetch ao mudar filtro modal (com debounce já aplicado) ou sort
  useEffect(() => {
    if (faturasOpen && client?.product) {
      fetchFaturas(1, modalFilterDebounced);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalFilterDebounced, vencSort]);


  const handleSaveObs = async (cnpj: string) => {
    setSavingCnpj(cnpj);
    try {
      const data = await saveCobrancaObservacao({ cnpj, observacao: observacoes[cnpj] || "" });
      if (!data?.success) throw new Error(data?.error || "Erro");
      toast({ title: "Observação salva" });
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSavingCnpj(null);
    }
  };

  if (!client) return null;

  const totalCount = cnpjData.reduce((s, c) => s + c.totalCount, 0);
  const totalValue = cnpjData.reduce((s, c) => s + agingKeys.reduce((v, k) => v + c[k], 0), 0);
  const faturaTotalPages = Math.ceil(faturasTotal / faturasPageSize);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-foreground">
            <Building2 className="h-5 w-5 text-primary" />
            {client.product}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-muted/30 rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">CNPJs</p>
              <p className="text-lg font-bold text-foreground">{cnpjData.length}</p>
            </div>
            <div className="bg-muted/30 rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">Faturas</p>
              <p className="text-lg font-bold text-foreground">{totalCount}</p>
            </div>
            <div className="bg-muted/30 rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-sm font-bold text-foreground">{formatBRL(totalValue)}</p>
            </div>
          </div>

          {/* Email Status */}
          <div className="bg-muted/20 rounded-lg p-3 border border-border">
            <div className="flex items-center gap-2 mb-2">
              <Mail className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-foreground">Disparo automático de cobrança</span>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>Status: <Badge variant="outline" className="text-[10px] ml-1">Ativo</Badge></p>
              <p>Régua: Pré-vencimento → Vencido 7d → Vencido 15d → Vencido 30d</p>
            </div>
          </div>

          <Separator />

          {/* CNPJ Breakdown */}
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <FileText className="h-4 w-4" /> Detalhamento por CNPJ
          </h3>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : cnpjData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum CNPJ encontrado</p>
          ) : (
            cnpjData.map((cnpj) => {
              const cnpjTotal = agingKeys.reduce((s, k) => s + cnpj[k], 0);
              const overdue = cnpjTotal - cnpj.not_due;
              return (
                <div key={cnpj.cnpjClean} className="border border-border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-mono font-medium text-foreground">{cnpj.cnpj || cnpj.cnpjClean}</span>
                    <Badge variant="outline" className="text-[10px]">{cnpj.totalCount} faturas</Badge>
                  </div>

                  {/* Mini aging bar */}
                  <div className="flex rounded overflow-hidden h-2">
                    {agingKeys.map((k) => {
                      const pct = cnpjTotal > 0 ? (cnpj[k] / cnpjTotal) * 100 : 0;
                      if (pct <= 0) return null;
                      return (
                        <div key={k} style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: AGING_COLORS[k] }}
                          title={`${AGING_LABELS[k]}: ${formatBRL(cnpj[k])}`} />
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap justify-between text-xs text-muted-foreground gap-x-4 gap-y-1">
                    <span>Total: {formatBRL(cnpjTotal)}</span>
                    {overdue > 0 && (
                      <span className="text-red-400 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> Overdue: {formatBRL(overdue)}
                      </span>
                    )}
                  </div>

                  {/* Em disputa */}
                  {(cnpj.disputa_total || 0) > 0 && (
                    <div className="rounded border border-amber-500/30 bg-amber-500/5 p-2 space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-amber-300 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Em disputa: <strong>{formatBRLFull(cnpj.disputa_total || 0)}</strong>
                          <span className="opacity-70">({cnpj.disputa_count || 0} fatura{(cnpj.disputa_count || 0) === 1 ? "" : "s"})</span>
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-[11px] text-amber-300 hover:text-amber-200 hover:bg-amber-500/10"
                          onClick={() => {
                            const next = !disputasOpen[cnpj.cnpjClean];
                            setDisputasOpen((prev) => ({ ...prev, [cnpj.cnpjClean]: next }));
                            if (next) fetchDisputasForCnpj(cnpj.cnpjClean);
                          }}
                        >
                          {disputasOpen[cnpj.cnpjClean] ? "Ocultar" : "Ver"}
                        </Button>
                      </div>
                      {disputasOpen[cnpj.cnpjClean] && (
                        <div className="pt-1">
                          {disputasLoading[cnpj.cnpjClean] ? (
                            <div className="flex items-center justify-center py-2">
                              <Loader2 className="h-4 w-4 animate-spin text-amber-300" />
                            </div>
                          ) : (disputasByCnpj[cnpj.cnpjClean]?.length || 0) === 0 ? (
                            <p className="text-[11px] text-muted-foreground italic">Nenhuma disputa ativa encontrada.</p>
                          ) : (
                            <ul className="space-y-1">
                              {(disputasByCnpj[cnpj.cnpjClean] || []).map((d, i) => (
                                <li key={i} className="text-[11px] flex flex-wrap gap-x-3 gap-y-0.5 text-foreground/90 border-t border-amber-500/10 pt-1 first:border-t-0 first:pt-0">
                                  <span><strong className="text-amber-300">ND:</strong> {d.nd || "—"}</span>
                                  <span><strong>NF:</strong> {d.numero_nf || "—"}</span>
                                  <span><strong>Venc.:</strong> {d.data_vencimento || "—"}</span>
                                  <span className="ml-auto font-mono">{formatBRLFull(d.valor_nf)}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
                  )}


                  {/* Cond. Pagamento & Vendedor */}
                  {(cnpj.condicao_pagamento || cnpj.nome_vendedor) && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {cnpj.condicao_pagamento && (
                        <span><strong className="text-foreground">Cond. Pagamento:</strong> {cnpj.condicao_pagamento}</span>
                      )}
                      {cnpj.nome_vendedor && (
                        <span><strong className="text-foreground">Vendedor:</strong> {cnpj.nome_vendedor}</span>
                      )}
                    </div>
                  )}

                  {/* E-mails cadastrados */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground font-medium">
                      <Mail className="h-3 w-3" /> E-mails cadastrados
                    </div>
                    {(contatos[cnpj.cnpjClean]?.length ?? 0) === 0 ? (
                      <p className="text-xs text-muted-foreground/70 italic">Nenhum e-mail cadastrado</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {contatos[cnpj.cnpjClean].map((c, i) => {
                          const logs = emailLogs[cnpj.cnpjClean]?.[c.email_contato.toLowerCase().trim()] || [];
                          return (
                            <li key={i} className="text-xs text-foreground space-y-1">
                              <div>
                                {c.nome_contato && <span className="text-muted-foreground">{c.nome_contato} — </span>}
                                <a href={`mailto:${c.email_contato}`} className="text-primary hover:underline">{c.email_contato}</a>
                              </div>
                              {logs.length === 0 ? (
                                <p className="text-[10px] text-muted-foreground/60 italic pl-2">Sem envios registrados</p>
                              ) : (
                                <div className="flex flex-wrap gap-1 pl-2">
                                  {logs.map((log) => {
                                    const dt = new Date(log.sent_at);
                                    const dtLabel = isNaN(dt.getTime())
                                      ? "—"
                                      : new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(dt);
                                    const ok = log.success === 1;
                                    const title = `${ok ? "Enviado" : "Falha"} · ${log.stage} · ${dtLabel}` +
                                      (log.subject ? `\nAssunto: ${log.subject}` : "") +
                                      (!ok && log.error_message ? `\nErro: ${log.error_message}` : "");
                                    return (
                                      <span
                                        key={log.id}
                                        title={title}
                                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border ${
                                          ok
                                            ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                                            : "bg-rose-500/10 text-rose-300 border-rose-500/30"
                                        }`}
                                      >
                                        <span className="font-semibold">{log.stage}</span>
                                        <span className="opacity-70">· {dtLabel}</span>
                                        <span>{ok ? "✓" : "✗"}</span>
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>


                  {/* Observação */}
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground font-medium">Observação</label>
                    <Textarea
                      value={observacoes[cnpj.cnpjClean] || ""}
                      onChange={(e) => setObservacoes((prev) => ({ ...prev, [cnpj.cnpjClean]: e.target.value }))}
                      placeholder="Adicionar observação..."
                      className="min-h-[60px] text-xs bg-background border-border"
                    />
                    <Button size="sm" variant="outline" className="h-7 text-xs"
                      disabled={savingCnpj === cnpj.cnpjClean}
                      onClick={() => handleSaveObs(cnpj.cnpjClean)}>
                      {savingCnpj === cnpj.cnpjClean ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                      Salvar
                    </Button>
                  </div>
                </div>
              );
            })
          )}

          <Separator />

          {/* Faturas Detalhadas */}
          <div>
            <Button
              variant="outline"
              className="w-full justify-between text-sm font-semibold"
              onClick={() => setFaturasOpen(!faturasOpen)}
            >
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Faturas Detalhadas ({faturasTotal > 0 ? faturasTotal : "..."})
              </span>
              {faturasOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>

            {faturasOpen && (
              <div className="mt-3 space-y-3">
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Filtrar por Modal..."
                    value={modalFilter}
                    onChange={(e) => setModalFilter(e.target.value)}
                    className="h-8 text-xs bg-background border-border max-w-[240px]"
                  />
                  {modalFilter && (
                    <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setModalFilter("")}>
                      Limpar
                    </Button>
                  )}
                </div>
                {faturasLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : faturas.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhuma fatura encontrada</p>
                ) : (
                  <>
                    <div className="border border-border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>ND</TableHead>
                            <TableHead>Modal</TableHead>
                            <TableHead>
                              <button
                                type="button"
                                onClick={() =>
                                  setVencSort((s) =>
                                    s === "overdue-first" ? "asc" : s === "asc" ? "desc" : "overdue-first"
                                  )
                                }
                                className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                                title={
                                  vencSort === "overdue-first"
                                    ? "Vencidos primeiro (clique para asc)"
                                    : vencSort === "asc"
                                      ? "Crescente (clique para desc)"
                                      : "Decrescente (clique para vencidos primeiro)"
                                }
                              >
                                Vencimento
                                {vencSort === "overdue-first" ? (
                                  <ArrowUpDown className="h-3 w-3" />
                                ) : vencSort === "asc" ? (
                                  <ArrowUp className="h-3 w-3" />
                                ) : (
                                  <ArrowDown className="h-3 w-3" />
                                )}
                              </button>
                            </TableHead>
                            <TableHead className="text-right">Valor</TableHead>
                            <TableHead className="text-center">Disputa</TableHead>
                            <TableHead>Cond. Pagamento</TableHead>
                            <TableHead>Vendedor</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {faturas.map((f, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="font-mono font-medium">{f.nd || "—"}</TableCell>
                              <TableCell>{f.modal || "—"}</TableCell>
                              <TableCell>{f.data_vencimento || "—"}</TableCell>
                              <TableCell className="text-right font-mono">
                                {f.valor_nf != null ? formatBRLFull(Number(f.valor_nf)) : "—"}
                              </TableCell>
                              <TableCell className="text-center">
                                {Number(f.disputa) === 1 ? (
                                  <Badge variant="destructive" className="text-[10px]">Sim</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-[10px] text-muted-foreground">Não</Badge>
                                )}
                              </TableCell>
                              <TableCell>{f.condicao_pagamento || "—"}</TableCell>
                              <TableCell>{f.nome_vendedor || "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    <TablePagination
                      currentPage={faturasPage}
                      totalPages={faturaTotalPages}
                      onPageChange={(p) => fetchFaturas(p)}
                    />

                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
