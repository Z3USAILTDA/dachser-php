import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, FileText, Clock, Flag, Coins, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import dachserBg from "@/assets/dachser-background.jpg";

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

  const username = localStorage.getItem("user_email") || "user";

  // Fetch counts on mount
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

  // Filter rows by search
  const filteredRows = useMemo(() => {
    if (!stageSearch.trim()) return stageRows;
    const q = stageSearch.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return stageRows.filter((r) => {
      const hay = [r.razao_base, r.nf_exibicao, r.data_venc_br, String(r.dias), r.valor_br, r.tipo_pagto]
        .join(" ")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      return hay.includes(q);
    });
  }, [stageRows, stageSearch]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const paginatedRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => {
    setCurrentPage(1);
  }, [stageSearch, openStage]);

  const formatDias = (dias: number) => {
    return dias >= 0 ? `D+${dias}` : `D${dias}`;
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background */}
      <div
        className="fixed inset-0 z-[-2]"
        style={{
          background: `
            radial-gradient(circle at 10% 0%, rgba(255,200,0,0.20), transparent 55%),
            radial-gradient(circle at 90% 100%, rgba(255,200,0,0.15), transparent 55%),
            linear-gradient(180deg, rgba(0,0,0,0.82), rgba(0,0,0,0.96)),
            url(${dachserBg}) center/cover no-repeat
          `,
          filter: "saturate(0.8)",
        }}
      />
      <div
        className="fixed inset-0 z-[-1]"
        style={{
          background: "radial-gradient(circle at 50% 0%, rgba(0,0,0,0.7), transparent 55%)",
        }}
      />

      {/* Header */}
      <div className="absolute top-[18px] left-[18px] z-[1000] flex items-center gap-[18px]">
        <button
          onClick={() => navigate("/dashboard")}
          className="inline-flex items-center gap-2 px-[14px] py-[10px] rounded-full border border-primary/90 bg-primary/15 text-primary font-bold text-[0.9rem] backdrop-blur-sm hover:bg-primary/25 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <header className="text-left">
          <div className="text-[1.6rem] tracking-[0.24em] uppercase font-bold">DACHSER</div>
          <div className="mt-[2px] text-[0.9rem] text-muted-foreground">
            Régua de cobrança – títulos em aberto
          </div>
          <div className="mt-[6px] flex gap-[6px]">
            <span className="w-[6px] h-[6px] rounded-full bg-primary shadow-[0_0_10px_rgba(255,200,0,0.9)]" />
            <span className="w-[6px] h-[6px] rounded-full bg-primary shadow-[0_0_10px_rgba(255,200,0,0.9)]" />
            <span className="w-[6px] h-[6px] rounded-full bg-primary shadow-[0_0_10px_rgba(255,200,0,0.9)]" />
          </div>
        </header>
      </div>

      {/* User info */}
      <div className="absolute top-[18px] right-[18px] flex items-center gap-[10px] text-[0.85rem] z-[1000]">
        <div className="px-[14px] py-[6px] rounded-full bg-black/70 border border-white/18 max-w-[220px] truncate">
          @{username}
        </div>
        <div className="w-8 h-8 rounded-full border border-white/25 flex items-center justify-center bg-black/70 text-primary">
          <Coins className="w-4 h-4" />
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[1720px] mx-auto mt-[130px] px-6 pb-8">
        {/* Meta pills */}
        <div className="flex flex-wrap gap-[10px] mb-[18px]">
          <span className="px-3 py-2 rounded-full bg-white/6 border border-white/12 text-[#ddd] text-[0.85rem] inline-flex items-center gap-[6px]">
            <FileText className="w-4 h-4" />
            <span>Total de títulos na régua:</span>
            <b>{loading ? "..." : totalTitles}</b>
          </span>
          <span className="px-3 py-2 rounded-full bg-white/6 border border-white/12 text-[#ddd] text-[0.85rem] inline-flex items-center gap-[6px]">
            <Clock className="w-4 h-4" />
            <span>Última atualização:</span> {lastSync || "..."}
          </span>
          <button
            onClick={() => navigate("/fin/disputa")}
            className="px-3 py-2 rounded-full bg-primary/12 border border-primary/90 text-primary font-bold text-[0.85rem] inline-flex items-center gap-[6px] hover:bg-primary/20 transition-colors"
          >
            <Flag className="w-4 h-4" /> Em disputa
          </button>
        </div>

        {/* Ruler Panel */}
        <section className="bg-[rgba(4,5,15,0.94)] rounded-2xl border border-white/12 shadow-[0_18px_40px_rgba(0,0,0,0.9)] p-4 mb-5">
          <div className="relative py-10 px-5 min-h-[120px]">
            {/* Bar */}
            <div className="absolute left-5 right-5 top-1/2 h-[2px] bg-[#3a3a3a] -translate-y-1/2 rounded" />

            {/* Ticks, Labels, Bubbles */}
            {Object.entries(STAGE_POSITIONS).map(([stage, pos]) => (
              <div key={stage}>
                {/* Tick */}
                <div
                  className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-[2px] h-9 bg-[#8a8a8a] cursor-pointer hover:bg-primary transition-colors"
                  style={{ left: `${pos}%` }}
                  onClick={() => toggleStage(stage)}
                />
                {/* Label */}
                <div
                  className="absolute top-2 -translate-x-1/2 text-[13px] text-[#e5e5e5] whitespace-nowrap cursor-pointer hover:text-primary transition-colors"
                  style={{ left: `${pos}%` }}
                  onClick={() => toggleStage(stage)}
                >
                  {STAGE_LABELS[stage]}
                </div>
                {/* Bubble */}
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
        </section>

        {/* Stage List Panel */}
        {openStage && (
          <section className="bg-[rgba(4,5,15,0.94)] rounded-2xl border border-white/12 shadow-[0_18px_40px_rgba(0,0,0,0.9)] p-4">
            {/* Header */}
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
                    placeholder="Buscar por cliente, documento ou tipo..."
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
              </div>
            </div>

            {/* Table */}
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
                          Documento / NF
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
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {filteredRows.length > PAGE_SIZE && (
                  <div className="flex justify-end mt-3">
                    <div className="flex items-center gap-2 bg-[#121212] border border-white/12 px-3 py-[6px] rounded-xl">
                      <button
                        className={`px-3 py-[6px] rounded-[10px] bg-[#151515] border border-[#333] text-[13px] ${
                          currentPage === 1 ? "opacity-50 cursor-not-allowed" : "hover:brightness-110"
                        }`}
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      >
                        « Anterior
                      </button>
                      <span className="text-[#D7D7D7] text-[13px] mx-2">
                        Página {currentPage}/{totalPages}
                      </span>
                      <button
                        className={`px-3 py-[6px] rounded-[10px] bg-[#151515] border border-[#333] text-[13px] ${
                          currentPage === totalPages ? "opacity-50 cursor-not-allowed" : "hover:brightness-110"
                        }`}
                        disabled={currentPage === totalPages}
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      >
                        Próxima »
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
