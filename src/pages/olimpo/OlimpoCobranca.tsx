import { useState, useEffect, useMemo } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DollarSign,
  TrendingUp,
  AlertTriangle,
  Clock,
  RefreshCw,
  Search,
  Download,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { ClientDetailSheet } from "@/components/olimpo/ClientDetailSheet";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import * as XLSX from "xlsx";

interface AgingRow {
  product: string;
  not_due: number;
  aging_30: number;
  aging_40: number;
  aging_60: number;
  aging_90: number;
  aging_120: number;
  aging_180: number;
  aging_240: number;
  aging_365: number;
  aging_366_plus: number;
  count_not_due: number;
  count_30: number;
  count_40: number;
  count_60: number;
  count_90: number;
  count_120: number;
  count_180: number;
  count_240: number;
  count_365: number;
  count_366_plus: number;
  cnpjs?: string[];
}

interface AgingData {
  data: AgingRow[];
  totals: AgingRow;
  lastUpdate: string;
}

interface BudgetForecast {
  period: string;
  budget: number;
  forecast: number;
  asOf: string;
}

interface PymtTermRow {
  periodo: string;
  pct_0_15: number;
  pct_16_30: number;
  pct_31_45: number;
  pct_46_60: number;
  pct_61_90: number;
  pct_gt90: number;
}

interface HistoricalAgingRow {
  periodo: string;
  ref_date: string;
  not_od: number; d1_90: number; d91_180: number; d181_240: number; d241_360: number; d361_plus: number; total: number;
  pct_not_od: number; pct_1_90: number; pct_91_180: number; pct_181_240: number; pct_241_360: number; pct_361_plus: number; pct_od: number;
  prov_not_od: number; prov_1_90: number; prov_91_180: number; prov_181_240: number; prov_241_360: number; prov_361_plus: number; prov_total: number;
  cust_not_od: number; cust_1_90: number; cust_91_180: number; cust_181_240: number; cust_241_360: number; cust_361_plus: number;
}

interface ClientPymtTerm {
  cliente: string;
  periodos: Array<{
    periodo: string;
    pct_0_15: number; pct_16_30: number; pct_31_45: number; pct_46_60: number; pct_61_90: number; pct_gt90: number;
    total_baixado: number;
  }>;
}

interface ClientAgingHistorical {
  cliente: string;
  periodos: HistoricalAgingRow[];
}

const AGING_COLORS: Record<string, string> = {
  not_due: "#22c55e",
  aging_30: "#84cc16",
  aging_40: "#a3e635",
  aging_60: "#facc15",
  aging_90: "#eab308",
  aging_120: "#f59e0b",
  aging_180: "#f97316",
  aging_240: "#ef4444",
  aging_365: "#dc2626",
  aging_366_plus: "#991b1b",
};

const AGING_LABELS: Record<string, string> = {
  not_due: "Not Overdue",
  aging_30: "0-30",
  aging_40: "31-40",
  aging_60: "41-60",
  aging_90: "61-90",
  aging_120: "91-120",
  aging_180: "121-180",
  aging_240: "181-240",
  aging_365: "241-365",
  aging_366_plus: "366+",
};

const PROVISION_PCT: Record<string, number> = {
  not_due: 0,
  aging_30: 1,
  aging_40: 1,
  aging_60: 1,
  aging_90: 1,
  aging_120: 25,
  aging_180: 25,
  aging_240: 50,
  aging_365: 75,
  aging_366_plus: 100,
};

// Provisioning percentages for the analytical export (by days overdue)
function getProvisionPct(dias: number): { bucket: string; pct: number } {
  if (dias <= 90) return { bucket: '≤90', pct: 1 };
  if (dias <= 180) return { bucket: '91-180', pct: 25 };
  if (dias <= 240) return { bucket: '181-240', pct: 50 };
  if (dias <= 365) return { bucket: '241-365', pct: 75 };
  return { bucket: '>365', pct: 100 };
}

const PIE_COLORS = ["#22c55e", "#ef4444"];

const PRODUCT_MAP: Record<string, string> = {
  SI: "Sea",
  SE: "Sea",
  AI: "Air",
  AE: "Air",
  DIM: "CHB",
  DEX: "CHB",
  ASO: "Miscellaneous",
  TCK: "Trucking",
};

const agingKeys = ["not_due", "aging_30", "aging_40", "aging_60", "aging_90", "aging_120", "aging_180", "aging_240", "aging_365", "aging_366_plus"] as const;
const overdueKeys = agingKeys.filter(k => k !== "not_due");

function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCompact(value: number): string {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(0)}K`;
  return formatBRL(value);
}

function formatPeriodLabel(periodo: string): string {
  const [year, month] = periodo.split('-');
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${months[parseInt(month) - 1]}/${year.slice(2)}`;
}

function mergeProductRows(rows: AgingRow[]): AgingRow[] {
  const grouped: Record<string, AgingRow> = {};
  for (const row of rows) {
    const mapped = PRODUCT_MAP[row.product] || row.product;
    if (!grouped[mapped]) {
      grouped[mapped] = { ...row, product: mapped };
    } else {
      for (const k of agingKeys) {
        (grouped[mapped][k] as number) += row[k] as number;
      }
      const countKeys = ["count_not_due", "count_30", "count_40", "count_60", "count_90", "count_120", "count_180", "count_240", "count_365", "count_366_plus"] as const;
      for (const ck of countKeys) {
        (grouped[mapped] as any)[ck] += (row as any)[ck];
      }
    }
  }
  return Object.values(grouped).sort((a, b) => {
    const totalA = agingKeys.reduce((s, k) => s + (a[k] as number), 0);
    const totalB = agingKeys.reduce((s, k) => s + (b[k] as number), 0);
    return totalB - totalA;
  });
}

export default function OlimpoCobranca() {
  const [data, setData] = useState<AgingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"product" | "client">("product");
  const [clientFilter, setClientFilter] = useState("");
  const [budgetForecast, setBudgetForecast] = useState<BudgetForecast | null>(null);
  const [selectedClient, setSelectedClient] = useState<AgingRow | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pymtTermData, setPymtTermData] = useState<PymtTermRow[]>([]);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [historicalData, setHistoricalData] = useState<HistoricalAgingRow[]>([]);
  const [clientPymtHistorical, setClientPymtHistorical] = useState<ClientPymtTerm[]>([]);
  const [clientAgingHistorical, setClientAgingHistorical] = useState<ClientAgingHistorical[]>([]);
  const { toast } = useToast();

  const fetchData = async () => {
    setLoading(true);
    try {
      const agingAction = viewMode === "client" ? "get_aging_by_client" : "get_aging_overview";

      const [agingResult, bfResult, pymtResult, histResult, pymtClientResult, agingClientResult] = await Promise.allSettled([
        supabase.functions.invoke("mariadb-proxy", { body: { action: agingAction } }),
        supabase.functions.invoke("mariadb-proxy", { body: { action: "get_budget_forecast_auto", viewMode } }),
        supabase.functions.invoke("mariadb-proxy", { body: { action: "get_pymt_term_rating" } }),
        supabase.functions.invoke("mariadb-proxy", { body: { action: "get_aging_historical" } }),
        supabase.functions.invoke("mariadb-proxy", { body: { action: "get_pymt_term_by_client" } }),
        supabase.functions.invoke("mariadb-proxy", { body: { action: "get_aging_historical_by_client" } }),
      ]);

      if (agingResult.status === "fulfilled") {
        const { data: resp, error } = agingResult.value;
        if (error) throw error;
        if (!resp?.success) throw new Error(resp?.error || "Erro desconhecido");
        setData(resp);
      } else {
        throw agingResult.reason;
      }

      const currentPeriod = new Date().toISOString().slice(0, 7);
      const fallback: BudgetForecast = { period: currentPeriod, budget: 0, forecast: 0, asOf: new Date().toISOString() };
      if (bfResult.status === "fulfilled") {
        const { data: bfResp, error: bfError } = bfResult.value;
        if (!bfError && bfResp?.success) {
          setBudgetForecast({
            period: bfResp.period || currentPeriod,
            budget: Number(bfResp.budget) || 0,
            forecast: Number(bfResp.forecast) || 0,
            asOf: bfResp.asOf || new Date().toISOString(),
          });
        } else {
          setBudgetForecast(fallback);
        }
      } else {
        setBudgetForecast(fallback);
      }

      if (pymtResult.status === "fulfilled") {
        const { data: pymtResp } = pymtResult.value;
        if (pymtResp?.success) {
          setPymtTermData(pymtResp.data || []);
        }
      }

      if (histResult.status === "fulfilled") {
        const { data: histResp } = histResult.value;
        if (histResp?.success) {
          setHistoricalData(histResp.data || []);
        }
      }

      if (pymtClientResult.status === "fulfilled") {
        const { data: pymtClientResp } = pymtClientResult.value;
        if (pymtClientResp?.success) {
          setClientPymtHistorical(pymtClientResp.data || []);
        }
      }

      if (agingClientResult.status === "fulfilled") {
        const { data: agingClientResp } = agingClientResult.value;
        if (agingClientResp?.success) {
          setClientAgingHistorical(agingClientResp.data || []);
        }
      }
    } catch (err: any) {
      console.error("Erro ao buscar aging:", err);
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    setClientFilter("");
  }, [viewMode]);

  const displayRows = useMemo(() => {
    if (!data?.data) return [];
    const rows = viewMode === "product" ? mergeProductRows(data.data) : data.data;
    if (viewMode === "client" && clientFilter.trim()) {
      const q = clientFilter.trim().toLowerCase();
      return rows.filter((r) => r.product.toLowerCase().includes(q));
    }
    return rows;
  }, [data, viewMode, clientFilter]);

  const totals = useMemo(() => {
    if (displayRows.length === 0) return null;
    const t: any = {
      product: "Grand Total",
      not_due: 0, aging_30: 0, aging_40: 0, aging_60: 0, aging_90: 0, aging_120: 0, aging_180: 0, aging_240: 0, aging_365: 0, aging_366_plus: 0,
      count_not_due: 0, count_30: 0, count_40: 0, count_60: 0, count_90: 0, count_120: 0, count_180: 0, count_240: 0, count_365: 0, count_366_plus: 0,
    };
    for (const row of displayRows) {
      for (const k of agingKeys) t[k] += (row[k] as number) || 0;
      const countKeys = ["count_not_due", "count_30", "count_40", "count_60", "count_90", "count_120", "count_180", "count_240", "count_365", "count_366_plus"];
      for (const ck of countKeys) t[ck] += (row as any)[ck] || 0;
    }
    return t as AgingRow;
  }, [displayRows]);

  const totalReceivable = totals ? agingKeys.reduce((s, k) => s + (totals[k] as number), 0) : 0;
  const totalOverdue = totals ? overdueKeys.reduce((s, k) => s + (totals[k] as number), 0) : 0;
  const pctOverdue = totalReceivable > 0 ? ((totalOverdue / totalReceivable) * 100).toFixed(1) : "0";

  const agingSegments = useMemo(() => {
    if (!totals || totalReceivable === 0) return [];
    return agingKeys.map((k) => ({
      key: k,
      value: totals[k as keyof AgingRow] as number,
      pct: ((totals[k as keyof AgingRow] as number) / totalReceivable) * 100,
      color: AGING_COLORS[k],
      label: AGING_LABELS[k],
    })).filter((s) => s.pct >= 0);
  }, [totals, totalReceivable]);

  // Bar chart data
  const barData = useMemo(() => {
    return displayRows.map((r) => ({
      product: r.product,
      "Not Overdue": r.not_due,
      "0-30": r.aging_30,
      "31-40": r.aging_40,
      "41-60": r.aging_60,
      "61-90": r.aging_90,
      "91-120": r.aging_120,
      "121-180": r.aging_180,
      "181-240": r.aging_240,
      "241-365": r.aging_365,
      "366+": r.aging_366_plus,
    }));
  }, [displayRows]);

  const pieData = useMemo(() => {
    if (!totalReceivable) return [];
    return [
      { name: "Not Due", value: totals?.not_due || 0 },
      { name: "Overdue", value: totalOverdue },
    ];
  }, [totals, totalOverdue, totalReceivable]);

  // Export to Excel with Analítico tab
  const handleExportExcel = async () => {
    if (!displayRows.length) return;
    setExportingExcel(true);

    try {
      const wsData: any[][] = [
        ["Brazil Customer Aging Overview", "", "", "", "", "", "", "", "", "", "", "", ""],
        [viewMode === "product" ? "Product" : "Client", ...agingKeys.map(k => AGING_LABELS[k]), "Total Overdue", "Total Receivable"],
      ];
      for (const row of displayRows) {
        const rowOverdue = overdueKeys.reduce((s, k) => s + (row[k] as number), 0);
        const rowTotal = row.not_due + rowOverdue;
        wsData.push([
          row.product,
          ...agingKeys.map(k => (row[k] as number).toFixed(2)),
          rowOverdue.toFixed(2), rowTotal.toFixed(2),
        ]);
      }
      if (totals) {
        wsData.push([
          "Grand Total",
          ...agingKeys.map(k => (totals[k] as number).toFixed(2)),
          totalOverdue.toFixed(2), totalReceivable.toFixed(2),
        ]);
        wsData.push([
          "% do Total",
          ...agingKeys.map(k => totalReceivable > 0 ? `${((totals[k] as number) / totalReceivable * 100).toFixed(1)}%` : "0%"),
          totalReceivable > 0 ? `${(totalOverdue / totalReceivable * 100).toFixed(1)}%` : "0%",
          "100%",
        ]);
        wsData.push([
          "% Provisão", ...agingKeys.map(k => `${PROVISION_PCT[k]}%`), "", "",
        ]);
        wsData.push([
          "Valor Provisionado",
          ...agingKeys.map(k => ((totals[k] as number) * PROVISION_PCT[k] / 100).toFixed(2)),
          "",
          agingKeys.reduce((s, k) => s + (totals[k] as number) * PROVISION_PCT[k] / 100, 0).toFixed(2),
        ]);
      }

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      XLSX.utils.book_append_sheet(wb, ws, "Aging");

      // Sheet 2: Analítico de Clientes
      try {
        const { data: analiticoResp } = await supabase.functions.invoke("mariadb-proxy", {
          body: { action: "get_aging_analitico" },
        });

        if (analiticoResp?.success && analiticoResp.data?.length > 0) {
          const dataCorte = analiticoResp.dataCorte || new Date().toISOString().slice(0, 10);
          const analiticoWs: any[][] = [
            [`DATA DE CORTE: ${dataCorte}`],
            [],
            [
              "COLIGADA", "NUMERO DOCUMENTO", "NOTA FISCAL", "MODAL", "TIPO DOC.",
              "DATA EMISSÃO", "VENCTO", "COD. CLIENTE", "RAZÃO SOCIAL CLIENTE",
              "STATUS FINANCEIRO", "VALOR ORIGINAL", "VALOR LÍQUIDO",
              "PROCESSO", "MASTER", "HOUSE", "IDLAN",
              "Provisão ≤90 (1%)", "Provisão 91-180 (25%)", "Provisão 181-240 (50%)",
              "Provisão 241-365 (75%)", "Provisão >365 (100%)",
              "Qtd. Dias de Vencimento",
            ],
          ];

          let totalProv1 = 0, totalProv25 = 0, totalProv50 = 0, totalProv75 = 0, totalProv100 = 0;

          for (const r of analiticoResp.data) {
            const dias = r.dias_vencimento;
            const valor = r.valor_nf;
            const { pct } = getProvisionPct(dias);
            const provValue = valor * pct / 100;

            let p1 = 0, p25 = 0, p50 = 0, p75 = 0, p100 = 0;
            if (dias <= 90) p1 = provValue;
            else if (dias <= 180) p25 = provValue;
            else if (dias <= 240) p50 = provValue;
            else if (dias <= 365) p75 = provValue;
            else p100 = provValue;

            totalProv1 += p1;
            totalProv25 += p25;
            totalProv50 += p50;
            totalProv75 += p75;
            totalProv100 += p100;

            analiticoWs.push([
              "1",
              r.documento || "",
              r.numero_nf || "",
              r.modal || "",
              r.tipo_documento || "",
              r.data_emissao ? new Date(r.data_emissao).toLocaleDateString('pt-BR') : "",
              r.data_vencimento ? new Date(r.data_vencimento).toLocaleDateString('pt-BR') : "",
              r.cod_cliente || "",
              r.razao_social || "",
              "Em aberto",
              valor.toFixed(2),
              (r.valor_liquido || valor).toFixed(2),
              r.processo || "",
              r.master || "",
              r.house || "",
              r.id_rm || "",
              p1 > 0 ? p1.toFixed(2) : "",
              p25 > 0 ? p25.toFixed(2) : "",
              p50 > 0 ? p50.toFixed(2) : "",
              p75 > 0 ? p75.toFixed(2) : "",
              p100 > 0 ? p100.toFixed(2) : "",
              dias > 0 ? dias : 0,
            ]);
          }

          analiticoWs.push([]);
          analiticoWs.push([
            "", "", "", "", "", "", "", "", "",
            "TOTAL", "", "",
            "", "", "", "",
            totalProv1.toFixed(2), totalProv25.toFixed(2), totalProv50.toFixed(2),
            totalProv75.toFixed(2), totalProv100.toFixed(2),
            "",
          ]);

          const ws2 = XLSX.utils.aoa_to_sheet(analiticoWs);
          XLSX.utils.book_append_sheet(wb, ws2, "Analítico de Clientes");
        }
      } catch (e) {
        console.warn("Could not fetch analítico data:", e);
      }

      XLSX.writeFile(wb, `aging_${viewMode}_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast({ title: "Excel exportado com sucesso" });
    } catch (err: any) {
      toast({ title: "Erro ao exportar", description: err.message, variant: "destructive" });
    } finally {
      setExportingExcel(false);
    }
  };

  const columnLabel = viewMode === "product" ? "Product" : "Client";

  const headerRight = (
    <div className="flex items-center gap-2">
      <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "product" | "client")}>
        <TabsList className="h-8 overflow-hidden">
          <TabsTrigger value="product" className="text-xs px-3 py-1">Product</TabsTrigger>
          <TabsTrigger value="client" className="text-xs px-3 py-1">Client</TabsTrigger>
        </TabsList>
      </Tabs>
      <Button size="sm" onClick={handleExportExcel} disabled={loading || exportingExcel || !displayRows.length}
        className="h-8 border-border bg-card text-muted-foreground hover:text-foreground text-xs">
        <Download className={`h-3.5 w-3.5 mr-1.5 ${exportingExcel ? "animate-spin" : ""}`} /> {exportingExcel ? "Exportando..." : "Excel"}
      </Button>
      <Button size="sm" onClick={fetchData} disabled={loading}
        className="h-8 border-border bg-card text-muted-foreground hover:text-foreground text-xs">
        <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
      </Button>
    </div>
  );

  return (
    <PageLayout title="DACHSER" subtitle="Cobrança" pageIcon={DollarSign} backTo="/dashboard" rightContent={headerRight}>
      <div className="space-y-6">
        {/* KPI Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <KpiCard icon={DollarSign} label="Total Receivable" value={formatCompact(totalReceivable)} loading={loading} />
          <KpiCard icon={AlertTriangle} label="Total Overdue" value={formatCompact(totalOverdue)} loading={loading} accent />
          <KpiCard icon={TrendingUp} label="% Overdue" value={`${pctOverdue}%`} loading={loading} />
          <KpiCard icon={Clock} label="Último Registro" value={data?.lastUpdate ? new Date(data.lastUpdate).toLocaleString("pt-BR") : "—"} loading={loading} />
        </div>

        {/* Combined Bad Debts / Score Rating / Provision Table */}
        {totals && totalReceivable > 0 && (
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-foreground">Bad Debts — Score Rating & Provisão</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left py-2 px-4 text-xs uppercase tracking-wider text-muted-foreground font-semibold min-w-[120px]">Faixa</th>
                      {agingKeys.map(k => (
                        <th key={k} className="text-right py-2 px-2 text-xs uppercase tracking-wider font-semibold min-w-[80px]" style={{ color: AGING_COLORS[k] }}>
                          {AGING_LABELS[k]}
                        </th>
                      ))}
                      <th className="text-right py-2 px-2 text-xs uppercase tracking-wider font-semibold text-red-400 min-w-[100px]">Total Overdue</th>
                      <th className="text-right py-2 px-4 text-xs uppercase tracking-wider font-semibold text-foreground min-w-[100px]">Grand Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Row 1: Score Rating % */}
                    <tr className="border-b border-border/30">
                      <td className="py-2 px-4 font-medium text-foreground">Score Rating %</td>
                      {agingKeys.map(k => (
                        <td key={k} className="py-2 px-2 text-right tabular-nums" style={{ color: AGING_COLORS[k] }}>
                          {((totals[k] as number) / totalReceivable * 100).toFixed(1)}%
                        </td>
                      ))}
                      <td className="py-2 px-2 text-right tabular-nums text-red-400 font-medium">{pctOverdue}%</td>
                      <td className="py-2 px-4 text-right tabular-nums text-muted-foreground">100%</td>
                    </tr>
                    {/* Row 2: Absolute values */}
                    <tr className="border-b border-border/30">
                      <td className="py-2 px-4 font-medium text-foreground">Valor</td>
                      {agingKeys.map(k => (
                        <td key={k} className="py-2 px-2 text-right tabular-nums" style={{ color: AGING_COLORS[k] }}>
                          {formatBRL(totals[k] as number)}
                        </td>
                      ))}
                      <td className="py-2 px-2 text-right tabular-nums text-red-400 font-medium">{formatBRL(totalOverdue)}</td>
                      <td className="py-2 px-4 text-right tabular-nums text-foreground font-medium">{formatBRL(totalReceivable)}</td>
                    </tr>
                    {/* Row 3: % Provisão */}
                    <tr className="border-b border-border/30">
                      <td className="py-2 px-4 text-muted-foreground">% Provisão</td>
                      {agingKeys.map(k => (
                        <td key={k} className="py-2 px-2 text-right tabular-nums text-muted-foreground">
                          {PROVISION_PCT[k]}%
                        </td>
                      ))}
                      <td className="py-2 px-2" />
                      <td className="py-2 px-4" />
                    </tr>
                    {/* Row 4: Provision values */}
                    <tr className="border-t-2 border-primary/40 bg-primary/5">
                      <td className="py-2 px-4 font-bold text-primary">Valor Provisionado</td>
                      {agingKeys.map(k => {
                        const prov = (totals[k] as number) * PROVISION_PCT[k] / 100;
                        return (
                          <td key={k} className="py-2 px-2 text-right tabular-nums font-bold" style={{ color: prov > 0 ? AGING_COLORS[k] : "var(--muted-foreground)" }}>
                            {formatBRL(prov)}
                          </td>
                        );
                      })}
                      <td className="py-2 px-2" />
                      <td className="py-2 px-4 text-right tabular-nums font-bold text-foreground">
                        {formatBRL(agingKeys.reduce((s, k) => s + (totals[k] as number) * PROVISION_PCT[k] / 100, 0))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* PYMT Term Rating */}
        {pymtTermData.length > 0 && (
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-foreground">PYMT Term Rating — % Pagamentos por Prazo</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left py-2 px-3 text-xs uppercase tracking-wider text-muted-foreground font-semibold">Período</th>
                      <th className="text-right py-2 px-3 text-xs font-semibold text-emerald-400">0-15</th>
                      <th className="text-right py-2 px-3 text-xs font-semibold text-green-400">16-30</th>
                      <th className="text-right py-2 px-3 text-xs font-semibold text-yellow-400">31-45</th>
                      <th className="text-right py-2 px-3 text-xs font-semibold text-orange-400">46-60</th>
                      <th className="text-right py-2 px-3 text-xs font-semibold text-red-400">61-90</th>
                      <th className="text-right py-2 px-3 text-xs font-semibold text-red-600">&gt;90</th>
                      <th className="text-right py-2 px-3 text-xs font-semibold text-red-500">TT &gt;30</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pymtTermData.map((row, idx) => {
                      const ttGt30 = (row.pct_31_45 + row.pct_46_60 + row.pct_61_90 + row.pct_gt90).toFixed(1);
                      return (
                        <tr key={idx} className="border-b border-border/30 hover:bg-muted/10">
                          <td className="py-2 px-3 font-medium text-foreground">{formatPeriodLabel(row.periodo)}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-emerald-400">{row.pct_0_15}%</td>
                          <td className="py-2 px-3 text-right tabular-nums text-green-400">{row.pct_16_30}%</td>
                          <td className="py-2 px-3 text-right tabular-nums text-yellow-400">{row.pct_31_45}%</td>
                          <td className="py-2 px-3 text-right tabular-nums text-orange-400">{row.pct_46_60}%</td>
                          <td className="py-2 px-3 text-right tabular-nums text-red-400">{row.pct_61_90}%</td>
                          <td className="py-2 px-3 text-right tabular-nums text-red-600">{row.pct_gt90}%</td>
                          <td className="py-2 px-3 text-right tabular-nums text-red-500 font-bold">{ttGt30}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Aging Table */}
        <Card className="bg-card border-border overflow-hidden">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm text-foreground">Brazil Customer Aging Overview</CardTitle>
            {viewMode === "client" && (
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Filtrar cliente..." value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}
                  className="h-8 pl-8 text-xs bg-background border-border" />
              </div>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <div className={viewMode === "client" ? "overflow-x-auto max-h-[600px] overflow-y-auto" : "overflow-x-auto"}>
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card z-10">
                  <tr className="border-b border-border/50">
                    <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                      {columnLabel}
                    </th>
                    {agingKeys.map((k) => {
                      const seg = agingSegments.find((s) => s.key === k);
                      return (
                        <th key={k} className="text-right py-3 px-3 font-semibold" style={{ color: AGING_COLORS[k] }}>
                          {seg && <div className="text-sm font-bold mb-1">{seg.pct.toFixed(0)}%</div>}
                          <div className="text-[10px] uppercase tracking-wider">{AGING_LABELS[k]}</div>
                        </th>
                      );
                    })}
                    <th className="text-right py-3 px-3 font-semibold text-red-400">
                      {totalReceivable > 0 && <div className="text-sm font-bold mb-1">{pctOverdue}%</div>}
                      <div className="text-[10px] uppercase tracking-wider">Total Overdue</div>
                    </th>
                    <th className="text-right py-3 px-4 font-semibold text-foreground">
                      <div className="text-[10px] uppercase tracking-wider">Total Receivable</div>
                      {totalReceivable > 0 && (
                        <div className="text-[10px] font-normal text-muted-foreground mt-0.5">{formatCompact(totalReceivable)}</div>
                      )}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={13} className="text-center py-8 text-muted-foreground">Carregando dados...</td></tr>
                  ) : displayRows.length === 0 ? (
                    <tr><td colSpan={13} className="text-center py-8 text-muted-foreground">Nenhum dado encontrado</td></tr>
                  ) : (
                    <>
                      {displayRows.map((row, idx) => {
                        const rowOverdue = overdueKeys.reduce((s, k) => s + (row[k] as number), 0);
                        const rowTotal = row.not_due + rowOverdue;
                        const isBadDebt = row.aging_366_plus > 0;
                        return (
                          <tr key={idx} className={`border-b border-border/30 hover:bg-muted/10 ${isBadDebt ? "bg-red-500/5" : ""} ${viewMode === "client" ? "cursor-pointer" : ""}`}
                            onClick={() => { if (viewMode === "client") { setSelectedClient(row); setSheetOpen(true); } }}>
                            <td className="py-2.5 px-4 font-medium text-foreground">
                              {row.product}
                              {row.cnpjs && row.cnpjs.length > 1 && (
                                <span className="ml-2 text-[10px] text-muted-foreground">({row.cnpjs.length} CNPJs)</span>
                              )}
                            </td>
                            {agingKeys.map((k) => (
                              <td key={k} className="py-2.5 px-3 text-right tabular-nums"
                                style={{ color: (row[k] as number) > 0 ? AGING_COLORS[k] : "var(--muted-foreground)" }}>
                                {formatBRL(row[k] as number)}
                              </td>
                            ))}
                            <td className="py-2.5 px-3 text-right tabular-nums text-red-400 font-medium">{formatBRL(rowOverdue)}</td>
                            <td className="py-2.5 px-3 text-right tabular-nums text-foreground font-medium">{formatBRL(rowTotal)}</td>
                          </tr>
                        );
                      })}
                      {/* Bad Debts summary row */}
                      {totals && totals.aging_366_plus > 0 && (
                        <tr className="border-t border-red-500/30 bg-red-500/10">
                          <td className="py-2.5 px-4 font-bold text-red-400">Bad Debts ({">"} 365)</td>
                          {agingKeys.map((k) => (
                            <td key={k} className="py-2.5 px-3 text-right tabular-nums font-bold" style={{ color: k === "aging_366_plus" ? "#991b1b" : "transparent" }}>
                              {k === "aging_366_plus" ? formatBRL(totals.aging_366_plus) : ""}
                            </td>
                          ))}
                          <td className="py-2.5 px-3" />
                          <td className="py-2.5 px-3 text-right tabular-nums font-bold text-red-400">
                            {totalReceivable > 0 ? `${((totals.aging_366_plus / totalReceivable) * 100).toFixed(1)}% do total` : ""}
                          </td>
                        </tr>
                      )}
                      {/* Grand Total */}
                      {totals && (
                        <tr className="border-t-2 border-primary/40 bg-primary/5 sticky bottom-0">
                          <td className="py-3 px-4 font-bold text-primary">Grand Total</td>
                          {agingKeys.map((k) => (
                            <td key={k} className="py-3 px-3 text-right tabular-nums font-bold" style={{ color: AGING_COLORS[k] }}>
                              {formatBRL(totals[k] as number)}
                            </td>
                          ))}
                          <td className="py-3 px-3 text-right tabular-nums font-bold text-red-400">{formatBRL(totalOverdue)}</td>
                          <td className="py-3 px-3 text-right tabular-nums font-bold text-foreground">{formatBRL(totalReceivable)}</td>
                        </tr>
                      )}
                    </>
                  )}
                </tbody>
              </table>
            </div>
            {viewMode === "client" && (
              <div className="px-4 py-2 border-t border-border/50 text-xs text-muted-foreground">
                {displayRows.length} clientes
              </div>
            )}
          </CardContent>
        </Card>

        {/* ==================== HISTORICAL VISUALIZATIONS ==================== */}
        
        {/* Score Rating + Bad Debts (side by side) */}
        {historicalData.length > 0 && (
          <div className="grid gap-6 lg:grid-cols-3">
            {/* SCORE RATING (Historical %) */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-foreground">Score Rating — Histórico %</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="text-left py-1.5 px-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Período</th>
                        <th className="text-right py-1.5 px-2 text-[10px] font-semibold text-emerald-400">NOT OD</th>
                        <th className="text-right py-1.5 px-2 text-[10px] font-semibold text-yellow-400">1-90</th>
                        <th className="text-right py-1.5 px-2 text-[10px] font-semibold text-amber-400">91-180</th>
                        <th className="text-right py-1.5 px-2 text-[10px] font-semibold text-red-400">181-240</th>
                        <th className="text-right py-1.5 px-2 text-[10px] font-semibold text-red-500">241-360</th>
                        <th className="text-right py-1.5 px-2 text-[10px] font-semibold text-red-700">&gt;361</th>
                        <th className="text-right py-1.5 px-2 text-[10px] font-semibold text-destructive">OD%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historicalData.map((row, idx) => (
                        <tr key={idx} className="border-b border-border/30 hover:bg-muted/10">
                          <td className="py-1.5 px-2 font-medium text-foreground">{formatPeriodLabel(row.periodo)}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-emerald-400">{row.pct_not_od}%</td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-yellow-400">{row.pct_1_90}%</td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-amber-400">{row.pct_91_180}%</td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-red-400">{row.pct_181_240}%</td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-red-500">{row.pct_241_360}%</td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-red-700">{row.pct_361_plus}%</td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-destructive font-bold">{row.pct_od}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* AGING LIST (Historical R$) */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-foreground">Aging List — Histórico R$</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="text-left py-1.5 px-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Período</th>
                        <th className="text-right py-1.5 px-2 text-[10px] font-semibold text-emerald-400">NOT OD</th>
                        <th className="text-right py-1.5 px-2 text-[10px] font-semibold text-yellow-400">1-90</th>
                        <th className="text-right py-1.5 px-2 text-[10px] font-semibold text-amber-400">91-180</th>
                        <th className="text-right py-1.5 px-2 text-[10px] font-semibold text-red-400">181-240</th>
                        <th className="text-right py-1.5 px-2 text-[10px] font-semibold text-red-500">241-360</th>
                        <th className="text-right py-1.5 px-2 text-[10px] font-semibold text-red-700">&gt;361</th>
                        <th className="text-right py-1.5 px-2 text-[10px] font-semibold text-foreground">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historicalData.map((row, idx) => (
                        <tr key={idx} className="border-b border-border/30 hover:bg-muted/10">
                          <td className="py-1.5 px-2 font-medium text-foreground">{formatPeriodLabel(row.periodo)}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-emerald-400">{formatBRL(row.not_od)}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-yellow-400">{formatBRL(row.d1_90)}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-amber-400">{formatBRL(row.d91_180)}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-red-400">{formatBRL(row.d181_240)}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-red-500">{formatBRL(row.d241_360)}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-red-700">{formatBRL(row.d361_plus)}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-foreground font-bold">{formatBRL(row.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* BAD DEBTS (Historical Provision R$) */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-foreground">Bad Debts — Provisão Histórica (R$)</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="text-left py-1.5 px-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Período</th>
                        <th className="text-right py-1.5 px-2 text-[10px] font-semibold text-yellow-400">1-90 (1%)</th>
                        <th className="text-right py-1.5 px-2 text-[10px] font-semibold text-amber-400">91-180 (25%)</th>
                        <th className="text-right py-1.5 px-2 text-[10px] font-semibold text-red-400">181-240 (50%)</th>
                        <th className="text-right py-1.5 px-2 text-[10px] font-semibold text-red-500">241-360 (75%)</th>
                        <th className="text-right py-1.5 px-2 text-[10px] font-semibold text-red-700">&gt;361 (100%)</th>
                        <th className="text-right py-1.5 px-2 text-[10px] font-semibold text-foreground">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historicalData.map((row, idx) => (
                        <tr key={idx} className="border-b border-border/30 hover:bg-muted/10">
                          <td className="py-1.5 px-2 font-medium text-foreground">{formatPeriodLabel(row.periodo)}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-yellow-400">{formatBRL(row.prov_1_90)}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-amber-400">{formatBRL(row.prov_91_180)}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-red-400">{formatBRL(row.prov_181_240)}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-red-500">{formatBRL(row.prov_241_360)}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-red-700">{formatBRL(row.prov_361_plus)}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-foreground font-bold">{formatBRL(row.prov_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* CURRENT CUSTOMERS - AGING LIST (Historical) */}
        {historicalData.length > 0 && (
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-foreground">Current Customers — Aging List (Clientes Distintos)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left py-1.5 px-3 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Período</th>
                      <th className="text-right py-1.5 px-3 text-[10px] font-semibold text-emerald-400">NOT OD</th>
                      <th className="text-right py-1.5 px-3 text-[10px] font-semibold text-yellow-400">1-90</th>
                      <th className="text-right py-1.5 px-3 text-[10px] font-semibold text-amber-400">91-180</th>
                      <th className="text-right py-1.5 px-3 text-[10px] font-semibold text-red-400">181-240</th>
                      <th className="text-right py-1.5 px-3 text-[10px] font-semibold text-red-500">241-360</th>
                      <th className="text-right py-1.5 px-3 text-[10px] font-semibold text-red-700">&gt;361</th>
                      <th className="text-right py-1.5 px-3 text-[10px] font-semibold text-foreground">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historicalData.map((row, idx) => {
                      const totalCust = row.cust_not_od + row.cust_1_90 + row.cust_91_180 + row.cust_181_240 + row.cust_241_360 + row.cust_361_plus;
                      return (
                        <tr key={idx} className="border-b border-border/30 hover:bg-muted/10">
                          <td className="py-1.5 px-3 font-medium text-foreground">{formatPeriodLabel(row.periodo)}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums text-emerald-400">{row.cust_not_od}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums text-yellow-400">{row.cust_1_90}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums text-amber-400">{row.cust_91_180}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums text-red-400">{row.cust_181_240}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums text-red-500">{row.cust_241_360}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums text-red-700">{row.cust_361_plus}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums text-foreground font-bold">{totalCust}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* AGING LIST POR CLIENTE (Collapsible) */}
        {clientAgingHistorical.length > 0 && (
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-foreground">Aging List — Por Cliente (R$)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border/30 max-h-[600px] overflow-y-auto">
                {clientAgingHistorical.map((client, idx) => (
                  <Collapsible key={idx}>
                    <CollapsibleTrigger className="flex items-center gap-2 w-full py-2.5 px-4 hover:bg-muted/10 text-left group">
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                      <span className="text-sm font-medium text-foreground">{client.cliente}</span>
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        {client.periodos.length} períodos • {formatBRL(client.periodos[client.periodos.length - 1]?.total || 0)}
                      </span>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="overflow-x-auto px-4 pb-3">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-border/50">
                              <th className="text-left py-1.5 px-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Período</th>
                              <th className="text-right py-1.5 px-2 text-[10px] font-semibold text-emerald-400">NOT OD</th>
                              <th className="text-right py-1.5 px-2 text-[10px] font-semibold text-yellow-400">1-90</th>
                              <th className="text-right py-1.5 px-2 text-[10px] font-semibold text-amber-400">91-180</th>
                              <th className="text-right py-1.5 px-2 text-[10px] font-semibold text-red-400">181-240</th>
                              <th className="text-right py-1.5 px-2 text-[10px] font-semibold text-red-500">241-360</th>
                              <th className="text-right py-1.5 px-2 text-[10px] font-semibold text-red-700">&gt;361</th>
                              <th className="text-right py-1.5 px-2 text-[10px] font-semibold text-foreground">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {client.periodos.map((p, pIdx) => (
                              <tr key={pIdx} className="border-b border-border/20 hover:bg-muted/5">
                                <td className="py-1 px-2 font-medium text-foreground">{formatPeriodLabel(p.periodo)}</td>
                                <td className="py-1 px-2 text-right tabular-nums text-emerald-400">{formatBRL(p.not_od)}</td>
                                <td className="py-1 px-2 text-right tabular-nums text-yellow-400">{formatBRL(p.d1_90)}</td>
                                <td className="py-1 px-2 text-right tabular-nums text-amber-400">{formatBRL(p.d91_180)}</td>
                                <td className="py-1 px-2 text-right tabular-nums text-red-400">{formatBRL(p.d181_240)}</td>
                                <td className="py-1 px-2 text-right tabular-nums text-red-500">{formatBRL(p.d241_360)}</td>
                                <td className="py-1 px-2 text-right tabular-nums text-red-700">{formatBRL(p.d361_plus)}</td>
                                <td className="py-1 px-2 text-right tabular-nums text-foreground font-bold">{formatBRL(p.total)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {clientPymtHistorical.length > 0 && (
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-foreground">PYMT Term Rating — Por Cliente</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border/30">
                {clientPymtHistorical.map((client, idx) => (
                  <Collapsible key={idx}>
                    <CollapsibleTrigger className="flex items-center gap-2 w-full py-2.5 px-4 hover:bg-muted/10 text-left group">
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                      <span className="text-sm font-medium text-foreground">{client.cliente}</span>
                      <span className="text-[10px] text-muted-foreground ml-auto">{client.periodos.length} períodos</span>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="overflow-x-auto px-4 pb-3">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-border/50">
                              <th className="text-left py-1.5 px-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Período</th>
                              <th className="text-right py-1.5 px-2 text-[10px] font-semibold text-emerald-400">0-15</th>
                              <th className="text-right py-1.5 px-2 text-[10px] font-semibold text-green-400">16-30</th>
                              <th className="text-right py-1.5 px-2 text-[10px] font-semibold text-yellow-400">31-45</th>
                              <th className="text-right py-1.5 px-2 text-[10px] font-semibold text-orange-400">46-60</th>
                              <th className="text-right py-1.5 px-2 text-[10px] font-semibold text-red-400">61-90</th>
                              <th className="text-right py-1.5 px-2 text-[10px] font-semibold text-red-600">&gt;90</th>
                              <th className="text-right py-1.5 px-2 text-[10px] font-semibold text-red-500">TT &gt;30</th>
                              <th className="text-right py-1.5 px-2 text-[10px] font-semibold text-muted-foreground">Total Pago</th>
                            </tr>
                          </thead>
                          <tbody>
                            {client.periodos.map((p, pIdx) => {
                              const ttGt30 = (p.pct_31_45 + p.pct_46_60 + p.pct_61_90 + p.pct_gt90).toFixed(1);
                              return (
                                <tr key={pIdx} className="border-b border-border/20 hover:bg-muted/5">
                                  <td className="py-1 px-2 font-medium text-foreground">{formatPeriodLabel(p.periodo)}</td>
                                  <td className="py-1 px-2 text-right tabular-nums text-emerald-400">{p.pct_0_15}%</td>
                                  <td className="py-1 px-2 text-right tabular-nums text-green-400">{p.pct_16_30}%</td>
                                  <td className="py-1 px-2 text-right tabular-nums text-yellow-400">{p.pct_31_45}%</td>
                                  <td className="py-1 px-2 text-right tabular-nums text-orange-400">{p.pct_46_60}%</td>
                                  <td className="py-1 px-2 text-right tabular-nums text-red-400">{p.pct_61_90}%</td>
                                  <td className="py-1 px-2 text-right tabular-nums text-red-600">{p.pct_gt90}%</td>
                                  <td className="py-1 px-2 text-right tabular-nums text-red-500 font-bold">{ttGt30}%</td>
                                  <td className="py-1 px-2 text-right tabular-nums text-muted-foreground">{formatBRL(p.total_baixado)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Charts */}
        {!loading && displayRows.length > 0 && (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-foreground">Aging por {columnLabel}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={barData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }} barSize={28}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                    <XAxis dataKey="product" tick={{ fill: "#aaa", fontSize: 11 }} />
                    <YAxis tick={{ fill: "#aaa", fontSize: 11 }}
                      tickFormatter={(v) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(0)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(0)}K` : v} />
                    <Tooltip contentStyle={{ backgroundColor: "rgba(0,0,0,0.85)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8 }}
                      labelStyle={{ color: "#fff" }} formatter={(value: number) => formatBRL(value)} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Not Overdue" stackId="a" fill={AGING_COLORS.not_due} />
                    <Bar dataKey="0-30" stackId="a" fill={AGING_COLORS.aging_30} />
                    <Bar dataKey="31-40" stackId="a" fill={AGING_COLORS.aging_40} />
                    <Bar dataKey="41-60" stackId="a" fill={AGING_COLORS.aging_60} />
                    <Bar dataKey="61-90" stackId="a" fill={AGING_COLORS.aging_90} />
                    <Bar dataKey="91-120" stackId="a" fill={AGING_COLORS.aging_120} />
                    <Bar dataKey="121-180" stackId="a" fill={AGING_COLORS.aging_180} />
                    <Bar dataKey="181-240" stackId="a" fill={AGING_COLORS.aging_240} />
                    <Bar dataKey="241-365" stackId="a" fill={AGING_COLORS.aging_365} />
                    <Bar dataKey="366+" stackId="a" fill={AGING_COLORS.aging_366_plus} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-foreground">Not Due vs Overdue</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-center">
                <ResponsiveContainer width="100%" height={320}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" outerRadius={110} innerRadius={60} dataKey="value"
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`} labelLine={false}>
                      {pieData.map((_, i) => (<Cell key={i} fill={PIE_COLORS[i]} />))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: "rgba(0,0,0,0.85)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8 }}
                      formatter={(value: number) => formatBRL(value)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <ClientDetailSheet client={selectedClient} open={sheetOpen} onOpenChange={setSheetOpen} />
    </PageLayout>
  );
}

function KpiCard({ icon: Icon, label, value, loading, accent }: {
  icon: any; label: string; value: string; loading: boolean; accent?: boolean;
}) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${accent ? "bg-red-500/10 border border-red-500/30" : "bg-primary/10 border border-primary/30"}`}>
          <Icon className={`h-5 w-5 ${accent ? "text-red-400" : "text-primary"}`} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className={`text-lg font-bold ${loading ? "animate-pulse text-muted-foreground" : accent ? "text-red-400" : "text-foreground"}`}>
            {loading ? "..." : value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
