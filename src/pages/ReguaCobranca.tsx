import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarRange, HelpCircle, Mail, Send } from "lucide-react";
import { useUsageLog } from "@/hooks/useUsageLog";
import { FileText, Clock, Flag, Search, X, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { PageLayout } from "@/components/layout/PageLayout";
import { PageCard } from "@/components/layout/PageCard";
import { TablePagination } from "@/components/layout/TablePagination";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface StageCounts {
  PRE: number;
  D1: number;
  D7: number;
  D15: number;
  D30: number;
  D45: number;
  D60: number;
}

interface StageRow {
  razao_base: string;
  razao_social: string;
  documento: string;
  nf_exibicao: string;
  data_venc_br: string;
  dias: number;
  tipo_pagto: string;
  valor_br: string;
  cnpj: string;
}

interface ClienteResumo {
  razao_base: string;
  razao_social: string;
  cnpj: string;
  qtd_faturas: number;
}

const STAGE_LABELS: Record<string, string> = {
  PRE: "Antes do vencimento",
  D1: "D+1",
  D7: "D+7",
  D15: "D+15",
  D30: "D+30",
  D45: "D+45",
  D60: "D+60",
};

const STAGE_HINTS: Record<string, string> = {
  PRE: "Antes do vencimento (comunicação preventiva)",
  D1: "Lembrete amistoso",
  D7: "1ª cobrança formal",
  D15: "2ª cobrança (suspensão/protesto)",
  D30: "Notificação / ações formais (à vista: último estágio; a prazo: segue D+45 e D+60)",
  D45: "Bloqueio e tratativa",
  D60: "Encaminhar jurídico",
};

const STAGE_POSITIONS: Record<string, number> = {
  PRE: 10,
  D1: 20 + (1 / 60) * 60,
  D7: 20 + (7 / 60) * 60,
  D15: 20 + (15 / 60) * 60,
  D30: 20 + (30 / 60) * 60,
  D45: 20 + (45 / 60) * 60,
  D60: 20 + (60 / 60) * 60,
};

const PAGE_SIZE = 15;

export default function ReguaCobranca() {
  useUsageLog({ endpoint: "/fin/regua-cobranca" });
  const navigate = useNavigate();
  const { toast } = useToast();

  const [counts, setCounts] = useState<StageCounts>({
    PRE: 0, D1: 0, D7: 0, D15: 0, D30: 0, D45: 0, D60: 0,
  });
  const [totalTitles, setTotalTitles] = useState(0);
  const [lastSync, setLastSync] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const [openStage, setOpenStage] = useState<string | null>(null);
  const [stageRows, setStageRows] = useState<StageRow[]>([]);
  const [stageLoading, setStageLoading] = useState(false);
  const [stageSearch, setStageSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // Aging modal state
  const [agingModalOpen, setAgingModalOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<StageRow | null>(null);
  const [sendingAging, setSendingAging] = useState(false);
  const [agingEmailText, setAgingEmailText] = useState("");

  // Bulk send state (admin only)
  const [bulkSendModalOpen, setBulkSendModalOpen] = useState(false);
  const [sendingBulk, setSendingBulk] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ sent: number; skipped: number; errors?: string[] } | null>(null);

  // Client search state
  const [clienteSearch, setClienteSearch] = useState("");
  const [clienteRows, setClienteRows] = useState<ClienteResumo[]>([]);
  const [clienteLoading, setClienteLoading] = useState(false);
  const [showClienteResults, setShowClienteResults] = useState(false);

  // Check admin status
  const storedUser = localStorage.getItem("user");
  const user = storedUser ? JSON.parse(storedUser) : null;
  const isAdmin = user?.is_admin === 1 || user?.is_admin === "1" || user?.is_admin === true;

  useEffect(() => {
    fetchCounts();
  }, []);

  const fetchCounts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { action: "get_regua_counts" },
      });

      if (error) throw error;
      if (data?.success && data.counts) {
        setCounts(data.counts);
        setTotalTitles(Object.values(data.counts as StageCounts).reduce((a, b) => a + b, 0));
      }
    } catch (err) {
      console.error("Erro ao carregar contagens:", err);
      toast({ title: "Erro", description: "Falha ao carregar dados da régua", variant: "destructive" });
    } finally {
      setLoading(false);
      setLastSync(new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) + " GMT-3");
    }
  };

  const fetchStageRows = async (stage: string) => {
    setStageLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { action: "get_regua_stage", stage },
      });

      if (error) throw error;
      if (data?.success && data.rows) {
        setStageRows(data.rows);
      } else {
        setStageRows([]);
      }
    } catch (err) {
      console.error("Erro ao carregar estágio:", err);
      toast({ title: "Erro", description: "Falha ao carregar dados do estágio", variant: "destructive" });
      setStageRows([]);
    } finally {
      setStageLoading(false);
    }
  };

  const toggleStage = (stage: string) => {
    // Clear client search when opening a stage
    if (showClienteResults) {
      clearClienteSearch();
    }
    
    if (openStage === stage) {
      setOpenStage(null);
      setStageRows([]);
    } else {
      setOpenStage(stage);
      setStageSearch("");
      setCurrentPage(1);
      fetchStageRows(stage);
    }
  };

  // Client search functions
  const searchByCliente = async () => {
    if (!clienteSearch.trim()) return;
    setClienteLoading(true);
    setShowClienteResults(true);
    
    try {
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { action: "get_regua_clientes_resumo", cliente: clienteSearch.trim() },
      });
      
      if (error) throw error;
      setClienteRows(data?.rows || []);
    } catch (err) {
      console.error("Erro ao buscar cliente:", err);
      toast({ title: "Erro", description: "Falha ao buscar cliente", variant: "destructive" });
      setClienteRows([]);
    } finally {
      setClienteLoading(false);
    }
  };

  const clearClienteSearch = () => {
    setShowClienteResults(false);
    setClienteRows([]);
    setClienteSearch("");
  };

  const getDefaultAgingText = (cnpj: string) => {
    const cnpjFormatted = cnpj ? cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : "xx.xxx.xxx/xxxx-xx";
    return `Boa tarde!
Tudo bem?

Segue anexo, aging list para os CNPJ's:

${cnpjFormatted}

Por gentileza, poderia verificar e nos retornar com a programação de pagamento para essa semana?

Em caso de dúvidas ou eventuais divergências, nossa equipe está à disposição através do e-mail jessica.costa@dachser.com ou pelo telefone +55 (19) 3312-6185.

Agradecemos a sua atenção e colaboração.

Atenciosamente,
Financeiro Dachser`;
  };

  const handleSendAgingCliente = (cliente: ClienteResumo) => {
    const row = {
      razao_base: cliente.razao_base,
      razao_social: cliente.razao_social,
      cnpj: cliente.cnpj,
      documento: "",
      nf_exibicao: "",
      data_venc_br: "",
      dias: 0,
      tipo_pagto: "",
      valor_br: ""
    };
    setSelectedRow(row);
    setAgingEmailText(getDefaultAgingText(cliente.cnpj));
    setAgingModalOpen(true);
  };

  const filteredRows = useMemo(() => {
    if (!stageSearch.trim()) return stageRows;
    const q = stageSearch.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return stageRows.filter((r) => {
      const hay = [r.razao_base, r.nf_exibicao, r.data_venc_br, String(r.dias), r.valor_br, r.tipo_pagto, r.cnpj]
        .join(" ")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      return hay.includes(q);
    });
  }, [stageRows, stageSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const paginatedRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => {
    setCurrentPage(1);
  }, [stageSearch, openStage]);

  const formatDias = (dias: number) => {
    return dias >= 0 ? `D+${dias}` : `D${dias}`;
  };

  const handleSendAging = (row: StageRow) => {
    setSelectedRow(row);
    setAgingEmailText(getDefaultAgingText(row.cnpj));
    setAgingModalOpen(true);
  };

  const confirmSendAging = async () => {
    if (!selectedRow) return;
    
    setSendingAging(true);
    try {
      const { data, error } = await supabase.functions.invoke("regua-send-aging", {
        body: {
          cnpj: selectedRow.cnpj,
          cliente: selectedRow.razao_base || selectedRow.razao_social,
          email_to: "devs@z3us.ai", // Fixed test email
          custom_text: agingEmailText, // Custom email text
        },
      });

      if (error) throw error;
      
      if (data?.success) {
        toast({
          title: "E-mail enviado!",
          description: data.message || "Aging List enviada para devs@z3us.ai",
        });
      } else {
        throw new Error(data?.message || "Erro ao enviar e-mail");
      }
    } catch (err) {
      console.error("Erro ao enviar aging:", err);
      toast({
        title: "Erro",
        description: err instanceof Error ? err.message : "Falha ao enviar Aging List",
        variant: "destructive",
      });
    } finally {
      setSendingAging(false);
      setAgingModalOpen(false);
      setSelectedRow(null);
    }
  };

  const handleBulkSend = () => {
    setBulkResult(null);
    setBulkSendModalOpen(true);
  };

  const confirmBulkSend = async () => {
    if (!openStage) return;
    
    setSendingBulk(true);
    setBulkResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("regua-send-emails", {
        body: {
          stage: openStage,
          dryRun: false, // Set to true for testing without actually sending
        },
      });

      if (error) throw error;
      
      if (data?.success) {
        setBulkResult({
          sent: data.sent || 0,
          skipped: data.skipped || 0,
          errors: data.errors,
        });
        toast({
          title: "Envio concluído!",
          description: `${data.sent} e-mail(s) enviado(s), ${data.skipped} ignorado(s)`,
        });
      } else {
        throw new Error(data?.message || "Erro ao enviar e-mails");
      }
    } catch (err) {
      console.error("Erro ao enviar em lote:", err);
      toast({
        title: "Erro",
        description: err instanceof Error ? err.message : "Falha ao enviar e-mails em lote",
        variant: "destructive",
      });
    } finally {
      setSendingBulk(false);
    }
  };

  const rightContent = (
    <div className="flex items-center gap-3">
      <button
        onClick={() => navigate("/fin/manual")}
        className="w-8 h-8 rounded-full border border-white/25 flex items-center justify-center bg-black/70 text-gray-400 hover:text-[#ffc800] transition-colors"
        title="Manual do usuário"
      >
        <HelpCircle className="h-4 w-4" />
      </button>
      <button
        onClick={() => window.location.href = "/fin/disputa"}
        className="px-3 py-1.5 rounded-full bg-primary/12 border border-primary/90 text-primary font-bold text-[0.85rem] inline-flex items-center gap-[6px] hover:bg-primary/20 transition-colors"
      >
        <Flag className="w-4 h-4" /> Em disputa
      </button>
      <Button
        onClick={fetchCounts}
        disabled={loading}
        size="sm"
        className="h-8 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
      >
        <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
        Atualizar
      </Button>
    </div>
  );

  return (
    <PageLayout 
      title="DACHSER" 
      subtitle="Régua de cobrança – títulos em aberto"
      rightContent={rightContent}
      pageIcon={CalendarRange}
      backTo="/dashboard"
    >
      {/* Meta pills + Client search */}
      <div className="flex flex-wrap items-center gap-[10px] mb-[18px]">
        <span className="px-3 py-2 rounded-full bg-white/6 border border-white/12 text-[#ddd] text-[0.85rem] inline-flex items-center gap-[6px]">
          <FileText className="w-4 h-4" />
          <span>Total de títulos na régua:</span>
          <b>{loading ? "..." : totalTitles}</b>
        </span>
        <span className="px-3 py-2 rounded-full bg-white/6 border border-white/12 text-[#ddd] text-[0.85rem] inline-flex items-center gap-[6px]">
          <Clock className="w-4 h-4" />
          <span>Última atualização:</span> {lastSync || "..."}
        </span>

        {/* Client search */}
        <div className="flex items-center gap-2 ml-auto">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={clienteSearch}
              onChange={(e) => setClienteSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchByCliente()}
              placeholder="Buscar cliente..."
              className="pl-9 w-[220px] h-9 rounded-full bg-[#13141a] border-white/20 text-[0.85rem]"
            />
          </div>
          <Button
            onClick={searchByCliente}
            disabled={clienteLoading}
            size="sm"
            className="h-9 rounded-full"
          >
            {clienteLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Buscar"}
          </Button>
          {showClienteResults && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearClienteSearch}
              className="h-9 px-2"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Ruler Panel */}
      <PageCard>
        <div className="relative py-10 px-5 min-h-[120px]">
          {/* Bar */}
          <div className="absolute left-5 right-5 top-1/2 h-[2px] bg-[#3a3a3a] -translate-y-1/2 rounded" />

          {/* Ticks, Labels, Bubbles */}
          {Object.entries(STAGE_POSITIONS).map(([stage, pos]) => (
            <div key={stage}>
              <div
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-[2px] h-9 bg-[#8a8a8a] cursor-pointer hover:bg-primary transition-colors"
                style={{ left: `${pos}%` }}
                onClick={() => toggleStage(stage)}
              />
              <div
                className="absolute top-2 -translate-x-1/2 text-[13px] text-[#e5e5e5] whitespace-nowrap cursor-pointer hover:text-primary transition-colors"
                style={{ left: `${pos}%` }}
                onClick={() => toggleStage(stage)}
              >
                {STAGE_LABELS[stage]}
              </div>
              <div
                className={`absolute bottom-2 -translate-x-1/2 min-w-[28px] h-7 px-2 rounded-full bg-[#111] border border-white/18 text-[12px] flex items-center justify-center cursor-pointer hover:border-primary transition-colors ${
                  counts[stage as keyof StageCounts] === 0 ? "opacity-40" : ""
                }`}
                style={{ left: `${pos}%` }}
                onClick={() => toggleStage(stage)}
              >
                {loading ? "..." : counts[stage as keyof StageCounts]}
              </div>
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="mt-4 pt-3 border-t border-white/8 text-muted-foreground text-[13px] flex gap-[10px] flex-wrap leading-relaxed">
          <span className="inline-flex items-center gap-1">
            <span className="text-primary">ℹ</span> Estágios:
          </span>
          <span>
            D+45 e D+60 aplicam-se apenas a clientes a prazo. Para títulos à vista, a régua vai até D+30.
            "Antes do vencimento" agrupa boletos e notas com vencimento futuro.
          </span>
        </div>
      </PageCard>

      {/* Client Search Results (below the ruler) */}
      {showClienteResults && (
        <PageCard className="mt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-bold">
              Resultado da busca: "{clienteSearch}"
              <span className="text-muted-foreground font-normal ml-2">
                ({clienteRows.length} cliente{clienteRows.length !== 1 ? 's' : ''} encontrado{clienteRows.length !== 1 ? 's' : ''})
              </span>
            </h3>
            <Button variant="ghost" size="sm" onClick={clearClienteSearch}>
              <X className="h-4 w-4 mr-1" /> Fechar
            </Button>
          </div>

          {clienteLoading ? (
            <div className="text-muted-foreground py-4">Buscando...</div>
          ) : clienteRows.length === 0 ? (
            <div className="text-muted-foreground py-4">Nenhum cliente encontrado.</div>
          ) : (
            <div className="rounded-xl border border-white/16 overflow-hidden">
              <table className="w-full text-[0.85rem]">
                <thead>
                  <tr className="bg-[#15151f]">
                    <th className="px-4 py-3 text-left text-[0.75rem] uppercase tracking-wider font-bold">
                      Cliente
                    </th>
                    <th className="px-4 py-3 text-center text-[0.75rem] uppercase tracking-wider font-bold">
                      Faturas na Régua
                    </th>
                    <th className="px-4 py-3 text-center text-[0.75rem] uppercase tracking-wider font-bold">
                      Ação
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {clienteRows.map((c, idx) => (
                    <tr key={idx} className="border-b border-white/9 hover:bg-white/5">
                      <td className="px-4 py-3">{c.razao_base}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant="secondary" className="text-[0.8rem]">
                          {c.qtd_faturas}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[0.75rem] gap-1"
                          onClick={() => handleSendAgingCliente(c)}
                        >
                          <Mail className="h-3 w-3" />
                          Aging
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </PageCard>
      )}

      {/* Stage List Panel */}
      {openStage && (
        <PageCard>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h3 className="text-base uppercase tracking-wider font-bold">
              {STAGE_LABELS[openStage]}{" "}
              <span className="text-[0.85rem] text-muted-foreground normal-case tracking-normal font-normal">
                {STAGE_HINTS[openStage]}
              </span>
            </h3>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={stageSearch}
                  onChange={(e) => setStageSearch(e.target.value)}
                  placeholder="Buscar por cliente, documento, processo..."
                  className="pl-9 w-[420px] max-w-[40vw] h-9 rounded-full bg-[#13141a] border-white/20 text-[0.85rem]"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStageSearch("")}
                className="rounded-full h-8 text-[0.8rem] uppercase tracking-wider"
              >
                <X className="w-3 h-3 mr-1" /> Limpar filtros
              </Button>
              {isAdmin && (
                <Button
                  size="sm"
                  onClick={handleBulkSend}
                  className="rounded-full h-8 text-[0.8rem] bg-orange-600 hover:bg-orange-700 text-white"
                >
                  <Send className="w-3 h-3 mr-1" /> Enviar lote
                </Button>
              )}
            </div>
          </div>

          {stageLoading ? (
            <div className="text-muted-foreground py-4">Carregando...</div>
          ) : filteredRows.length === 0 ? (
            <div className="text-muted-foreground py-4">Nenhuma fatura neste estágio.</div>
          ) : (
            <>
              <div className="mt-2 max-h-[60vh] overflow-auto rounded-xl border border-white/16">
                <table className="w-full border-collapse text-[0.82rem]">
                  <thead>
                    <tr>
                      <th className="bg-[#15151f] sticky top-0 z-[5] px-3 py-[10px] text-left text-[0.75rem] uppercase tracking-wider font-bold">
                        Cliente
                      </th>
                      <th className="bg-[#15151f] sticky top-0 z-[5] px-3 py-[10px] text-left text-[0.75rem] uppercase tracking-wider font-bold">
                        Doc / NF
                      </th>
                      <th className="bg-[#15151f] sticky top-0 z-[5] px-3 py-[10px] text-left text-[0.75rem] uppercase tracking-wider font-bold">
                        Vencimento
                      </th>
                      <th className="bg-[#15151f] sticky top-0 z-[5] px-3 py-[10px] text-left text-[0.75rem] uppercase tracking-wider font-bold">
                        Dias
                      </th>
                      <th className="bg-[#15151f] sticky top-0 z-[5] px-3 py-[10px] text-left text-[0.75rem] uppercase tracking-wider font-bold">
                        Valor
                      </th>
                      <th className="bg-[#15151f] sticky top-0 z-[5] px-3 py-[10px] text-left text-[0.75rem] uppercase tracking-wider font-bold">
                        Tipo
                      </th>
                      <th className="bg-[#15151f] sticky top-0 z-[5] px-3 py-[10px] text-left text-[0.75rem] uppercase tracking-wider font-bold">
                        Ação
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRows.map((r, idx) => (
                      <tr key={idx} className="hover:bg-white/5 border-b border-white/9">
                        <td className="px-3 py-[10px]">{r.razao_base || r.razao_social}</td>
                        <td className="px-3 py-[10px]">{r.nf_exibicao || "—"}</td>
                        <td className="px-3 py-[10px]">{r.data_venc_br}</td>
                        <td className="px-3 py-[10px]">
                          <Badge variant="outline" className="text-[0.74rem]">
                            {formatDias(r.dias)}
                          </Badge>
                        </td>
                        <td className="px-3 py-[10px]">{r.valor_br}</td>
                        <td className="px-3 py-[10px]">{r.tipo_pagto}</td>
                        <td className="px-3 py-[10px]">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[0.75rem] gap-1"
                            onClick={() => handleSendAging(r)}
                          >
                            <Mail className="h-3 w-3" />
                            Aging
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filteredRows.length > PAGE_SIZE && (
                <TablePagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                  showFirstLast={false}
                />
              )}
            </>
          )}
        </PageCard>
      )}

      {/* Aging Confirmation Modal */}
      <Dialog open={agingModalOpen} onOpenChange={setAgingModalOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Enviar Aging List</DialogTitle>
            <DialogDescription>
              Confirmar envio de Aging List para o cliente?
            </DialogDescription>
          </DialogHeader>
          
          {selectedRow && (
            <div className="py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-muted-foreground text-sm">Cliente:</span>
                  <p className="font-medium">{selectedRow.razao_base || selectedRow.razao_social}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-sm">CNPJ:</span>
                  <p className="font-mono text-sm">{selectedRow.cnpj || selectedRow.documento?.slice(0, 18) || "—"}</p>
                </div>
              </div>
              <div>
                <span className="text-muted-foreground text-sm">E-mail destino (teste):</span>
                <p className="font-medium text-orange-400">devs@z3us.ai</p>
              </div>
              
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Texto do e-mail (editável)</Label>
                <Textarea
                  value={agingEmailText}
                  onChange={(e) => setAgingEmailText(e.target.value)}
                  className="min-h-[240px] bg-[#13141a] border-white/20 text-sm font-normal leading-relaxed"
                  placeholder="Texto do e-mail..."
                />
                <p className="text-xs text-muted-foreground">
                  O rodapé legal do e-mail (condições gerais de negócios) não pode ser alterado e será incluído automaticamente.
                </p>
              </div>
              
              <p className="text-sm text-muted-foreground">
                Será gerada uma Aging List com todas as faturas em atraso deste cliente (incluindo todos os CNPJs do mesmo grupo).
              </p>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setAgingModalOpen(false)}
              disabled={sendingAging}
            >
              Cancelar
            </Button>
            <Button
              onClick={confirmSendAging}
              disabled={sendingAging}
              className="bg-primary text-primary-foreground"
            >
              {sendingAging ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4 mr-2" />
                  Enviar E-mail
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Send Confirmation Modal (Admin Only) */}
      <Dialog open={bulkSendModalOpen} onOpenChange={setBulkSendModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Envio em Lote - {openStage ? STAGE_LABELS[openStage] : ""}</DialogTitle>
            <DialogDescription>
              Enviar e-mails de cobrança para todos os clientes neste estágio?
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-3">
            <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
              <p className="text-sm text-orange-400">
                ⚠️ <strong>Atenção:</strong> Esta ação enviará e-mails de cobrança para todos os clientes com faturas no estágio {openStage ? STAGE_LABELS[openStage] : ""}.
              </p>
            </div>
            
            <div>
              <span className="text-muted-foreground text-sm">Total de faturas neste estágio:</span>
              <p className="font-bold text-lg">{filteredRows.length}</p>
            </div>

            {bulkResult && (
              <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg space-y-1">
                <p className="text-sm text-green-400">
                  ✓ Enviados: <strong>{bulkResult.sent}</strong>
                </p>
                <p className="text-sm text-muted-foreground">
                  Ignorados (sem e-mail ou já enviado hoje): <strong>{bulkResult.skipped}</strong>
                </p>
                {bulkResult.errors && bulkResult.errors.length > 0 && (
                  <div className="mt-2">
                    <p className="text-sm text-red-400">Erros:</p>
                    {bulkResult.errors.slice(0, 3).map((err, i) => (
                      <p key={i} className="text-xs text-red-400">{err}</p>
                    ))}
                    {bulkResult.errors.length > 3 && (
                      <p className="text-xs text-red-400">...e mais {bulkResult.errors.length - 3} erros</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setBulkSendModalOpen(false)}
              disabled={sendingBulk}
            >
              {bulkResult ? "Fechar" : "Cancelar"}
            </Button>
            {!bulkResult && (
              <Button
                onClick={confirmBulkSend}
                disabled={sendingBulk}
                className="bg-orange-600 hover:bg-orange-700 text-white"
              >
                {sendingBulk ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Confirmar Envio
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}
