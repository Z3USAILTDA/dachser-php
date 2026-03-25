import { useState, useEffect, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { isZ3usAdmin } from "@/utils/adminAccess";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Play, Pencil, Power, RefreshCw, Clock, Loader2,
  ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, XCircle,
  Activity, Zap, Timer, ExternalLink,
} from "lucide-react";
import { PageLayout } from "@/components/layout/PageLayout";
import { PageCard } from "@/components/layout/PageCard";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────
interface CronJob {
  jobid: number;
  jobname: string;
  schedule: string;
  active: boolean;
  command: string;
  last_run_at?: string | null;
  last_status?: string | null;
  last_return_message?: string | null;
  last_duration_seconds?: number | null;
}

interface RunHistory {
  runid: number;
  status: string;
  return_message: string;
  start_time: string;
  end_time: string;
  duration_seconds: number;
}

// ─── Metadata Map ────────────────────────────────────────────
interface CronMeta {
  description: string;
  category: string;
  categoryColor: string;
  impact: "alto" | "médio" | "baixo";
  relatedPage?: string;
}

const CRON_METADATA: Record<string, CronMeta> = {
  "leadcomex-sync-every-minute": {
    description: "Sincroniza dados de embarques aéreos via API Leadcomex (enrich-reverse-ladder). Prioriza embarques pendentes, processando 5 por ciclo.",
    category: "Aéreo",
    categoryColor: "#ffc800",
    impact: "alto",
    relatedPage: "/air-tracking",
  },
  "air-dep-transition-alert": {
    description: "Monitora transições de status DEP (departed) nos embarques aéreos e envia alertas por e-mail aos analistas responsáveis.",
    category: "Alertas",
    categoryColor: "#ef4444",
    impact: "alto",
    relatedPage: "/air-tracking",
  },
  "air-tracking-failed-alert": {
    description: "Verifica embarques aéreos com falha de rastreamento e notifica a equipe operacional para ação corretiva.",
    category: "Alertas",
    categoryColor: "#ef4444",
    impact: "alto",
    relatedPage: "/air-tracking",
  },
  "anthropic-balance-check-daily": {
    description: "Verifica diariamente o saldo disponível na API Anthropic (Claude) e envia alerta caso esteja abaixo do limiar configurado.",
    category: "Financeiro",
    categoryColor: "#22c55e",
    impact: "médio",
    relatedPage: "/admin/api-management",
  },
  "db-critical-alert-hourly": {
    description: "Monitora métricas críticas do banco de dados (conexões, tamanho, queries lentas) e dispara alertas em caso de anomalias.",
    category: "Sistema",
    categoryColor: "#8b5cf6",
    impact: "alto",
  },
  "db-status-report-hourly": {
    description: "Gera relatório horário do status geral do banco de dados incluindo uso de disco, tabelas maiores e estatísticas de performance.",
    category: "Sistema",
    categoryColor: "#8b5cf6",
    impact: "médio",
  },
  "firecrawl-monitor-alert-every-30min": {
    description: "Monitora o uso da API Firecrawl (web scraping) e envia alertas sobre consumo, limites e possíveis falhas de integração.",
    category: "Integrações",
    categoryColor: "#3b82f6",
    impact: "médio",
    relatedPage: "/admin/api-management",
  },
  "sea-analysis-watchdog-check": {
    description: "Verifica embarques marítimos pendentes de análise e identifica possíveis travamentos no pipeline de processamento.",
    category: "Marítimo",
    categoryColor: "#06b6d4",
    impact: "alto",
    relatedPage: "/sea-shipments",
  },
  "sea-tracking-weekly": {
    description: "Atualiza rastreamento de embarques marítimos via APIs das companhias navais (Hapag-Lloyd). Executa duas vezes por semana.",
    category: "Marítimo",
    categoryColor: "#06b6d4",
    impact: "médio",
    relatedPage: "/sea-shipments",
  },
};

const getMetadata = (jobname: string): CronMeta => {
  if (CRON_METADATA[jobname]) return CRON_METADATA[jobname];
  return {
    description: "Job agendado do sistema.",
    category: "Geral",
    categoryColor: "#6b7280",
    impact: "médio",
  };
};

// ─── Helpers ─────────────────────────────────────────────────
const CRON_PRESETS = [
  { label: "A cada 1 minuto", value: "* * * * *" },
  { label: "A cada 5 minutos", value: "*/5 * * * *" },
  { label: "A cada 10 minutos", value: "*/10 * * * *" },
  { label: "A cada 30 minutos", value: "*/30 * * * *" },
  { label: "A cada 1 hora", value: "0 * * * *" },
  { label: "Diário às 09:00", value: "0 9 * * *" },
  { label: "Diário às 12:00", value: "0 12 * * *" },
  { label: "Semanal (Segunda 02:00)", value: "0 2 * * 1" },
];

const cronToHuman = (cron: string): string => {
  const map: Record<string, string> = {
    "* * * * *": "A cada minuto",
    "*/5 * * * *": "A cada 5 minutos",
    "*/10 * * * *": "A cada 10 minutos",
    "*/30 * * * *": "A cada 30 minutos",
    "0 * * * *": "A cada hora",
    "0 12 * * *": "Diariamente às 12:00 UTC",
    "0 9 * * *": "Diariamente às 09:00 UTC",
  };
  if (map[cron]) return map[cron];
  const parts = cron.split(/\s+/);
  if (parts.length !== 5) return cron;
  const [min, hour, , , dow] = parts;
  if (hour.includes("-") && min === "0") return `A cada hora (${hour} UTC)`;
  if (dow !== "*" && hour !== "*") {
    const days: Record<string, string> = { "0": "Dom", "1": "Seg", "2": "Ter", "3": "Qua", "4": "Qui", "5": "Sex", "6": "Sáb" };
    const dayNames = dow.split(",").map(d => days[d] || d).join(", ");
    return `${dayNames} às ${hour.padStart(2, "0")}:${min.padStart(2, "0")} UTC`;
  }
  return cron;
};

const extractFunctionName = (command: string): string => {
  const match = command.match(/functions\/v1\/([^'"]+)/);
  return match ? match[1] : "—";
};

const formatDateTime = (iso: string): string => {
  try {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch { return iso; }
};

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const callCronManager = async (action: string, body?: Record<string, unknown>, params?: Record<string, string>) => {
  const searchParams = new URLSearchParams({ action, ...params });
  const url = `https://${PROJECT_ID}.supabase.co/functions/v1/cron-manager?${searchParams}`;
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ANON_KEY}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
};

// ─── Summary Card Component ─────────────────────────────────
function SummaryCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: number | string; color: string }) {
  return (
    <PageCard padding="md" className="flex items-center gap-4 min-w-[180px]">
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center"
        style={{ background: `${color}20` }}
      >
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <div>
        <p className="text-[0.75rem] font-medium text-[#aaaaaa] uppercase tracking-wider">{label}</p>
        <p className="text-xl font-bold text-[#f5f5f5]">{value}</p>
      </div>
    </PageCard>
  );
}

// ─── History Row Component ───────────────────────────────────
function HistoryTable({ jobid }: { jobid: number }) {
  const [history, setHistory] = useState<RunHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    callCronManager("history", undefined, { jobid: String(jobid) })
      .then(data => setHistory(data.history || []))
      .catch(() => toast.error("Erro ao carregar histórico"))
      .finally(() => setLoading(false));
  }, [jobid]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 px-6 text-[#aaaaaa]">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando histórico...
      </div>
    );
  }

  if (history.length === 0) {
    return <p className="text-[#aaaaaa] text-xs py-4 px-6">Nenhuma execução registrada.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[rgba(255,255,255,0.08)]">
            <th className="text-left py-2 px-3 text-[#aaaaaa] font-medium">Horário</th>
            <th className="text-left py-2 px-3 text-[#aaaaaa] font-medium">Status</th>
            <th className="text-left py-2 px-3 text-[#aaaaaa] font-medium">Duração</th>
            <th className="text-left py-2 px-3 text-[#aaaaaa] font-medium">Retorno</th>
          </tr>
        </thead>
        <tbody>
          {history.map((run) => (
            <tr key={run.runid} className="border-b border-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.02)]">
              <td className="py-1.5 px-3 text-[#cccccc] font-mono">{formatDateTime(run.start_time)}</td>
              <td className="py-1.5 px-3">
                {run.status === "succeeded" ? (
                  <span className="inline-flex items-center gap-1 text-green-400"><CheckCircle2 className="w-3 h-3" /> OK</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-red-400"><XCircle className="w-3 h-3" /> Falhou</span>
                )}
              </td>
              <td className="py-1.5 px-3 text-[#aaaaaa]">{run.duration_seconds != null ? `${run.duration_seconds}s` : "—"}</td>
              <td className="py-1.5 px-3 text-[#aaaaaa] max-w-[300px] truncate" title={run.return_message}>{run.return_message || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────
const WEEK_DAYS = [
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
  { value: 0, label: "Dom" },
];

const detectScheduleMode = (cron: string): "presets" | "weekly" | "manual" => {
  if (CRON_PRESETS.some(p => p.value === cron)) return "presets";
  const parts = cron.split(/\s+/);
  if (parts.length === 5 && parts[4] !== "*" && parts[2] === "*" && parts[3] === "*") return "weekly";
  return "manual";
};

const parseWeeklyCron = (cron: string) => {
  const parts = cron.split(/\s+/);
  if (parts.length !== 5) return { days: [], hour: 12, minute: 0 };
  const days = parts[4] !== "*" ? parts[4].split(",").map(Number).filter(n => !isNaN(n)) : [];
  const hour = parts[1] !== "*" ? parseInt(parts[1]) || 0 : 12;
  const minute = parseInt(parts[0]) || 0;
  return { days, hour, minute };
};

const buildWeeklyCron = (days: number[], hour: number, minute: number): string => {
  if (days.length === 0) return "";
  return `${minute} ${hour} * * ${days.sort((a, b) => a - b).join(",")}`;
};

const CronManager = () => {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [recentFailures, setRecentFailures] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editJob, setEditJob] = useState<CronJob | null>(null);
  const [newSchedule, setNewSchedule] = useState("");
  const [saving, setSaving] = useState(false);
  const [runningJob, setRunningJob] = useState<number | null>(null);
  const [togglingJob, setTogglingJob] = useState<number | null>(null);
  const [expandedJob, setExpandedJob] = useState<number | null>(null);
  const [scheduleMode, setScheduleMode] = useState<"presets" | "weekly" | "manual">("presets");
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [selectedHour, setSelectedHour] = useState(12);
  const [selectedMinute, setSelectedMinute] = useState(0);

  useEffect(() => {
    if (!isZ3usAdmin()) {
      navigate("/dashboard");
      return;
    }
    loadJobs();
  }, []);

  const loadJobs = async () => {
    setLoading(true);
    try {
      const data = await callCronManager("list");
      setJobs(data.jobs || []);
      setRecentFailures(data.recent_failures || 0);
    } catch (err: any) {
      toast.error("Erro ao carregar crons: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (job: CronJob) => {
    setTogglingJob(job.jobid);
    try {
      await callCronManager("toggle_active", { jobid: job.jobid, active: !job.active });
      toast.success(`Job "${job.jobname}" ${!job.active ? "ativado" : "desativado"}`);
      await loadJobs();
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    } finally {
      setTogglingJob(null);
    }
  };

  const handleSaveSchedule = async () => {
    if (!editJob || !newSchedule.trim()) return;
    setSaving(true);
    try {
      await callCronManager("update_schedule", { jobid: editJob.jobid, schedule: newSchedule.trim() });
      toast.success(`Schedule de "${editJob.jobname}" atualizado`);
      setEditJob(null);
      await loadJobs();
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRunNow = async (job: CronJob) => {
    setRunningJob(job.jobid);
    try {
      const res = await callCronManager("run_now", { command: job.command });
      toast.success(`"${job.jobname}" executado (status: ${res.status})`);
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    } finally {
      setRunningJob(null);
    }
  };

  const activeJobs = jobs.filter(j => j.active).length;
  const inactiveJobs = jobs.filter(j => !j.active).length;

  return (
    <PageLayout
      title="DACHSER"
      subtitle="Gerenciamento de Crons"
      pageIcon={Clock}
      backTo="/dashboard"
      rightContent={
        <Button variant="outline" size="sm" onClick={loadJobs} disabled={loading}
          className="bg-[rgba(0,0,0,.70)] border-[rgba(255,255,255,.18)] text-[#aaaaaa] hover:text-white">
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      }
    >
      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard icon={Clock} label="Total Jobs" value={jobs.length} color="#ffc800" />
        <SummaryCard icon={Zap} label="Ativos" value={activeJobs} color="#22c55e" />
        <SummaryCard icon={Power} label="Inativos" value={inactiveJobs} color="#6b7280" />
        <SummaryCard icon={AlertTriangle} label="Falhas (24h)" value={recentFailures} color={recentFailures > 0 ? "#ef4444" : "#22c55e"} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#ffc800]" />
        </div>
      ) : (
        <PageCard className="overflow-hidden" padding="sm">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-[rgba(255,255,255,0.08)]">
                <TableHead className="w-8"></TableHead>
                <TableHead className="text-[#aaaaaa]">Nome</TableHead>
                <TableHead className="text-[#aaaaaa]">Categoria</TableHead>
                <TableHead className="text-[#aaaaaa]">Schedule</TableHead>
                <TableHead className="text-[#aaaaaa]">Função Alvo</TableHead>
                <TableHead className="text-[#aaaaaa]">Última Execução</TableHead>
                <TableHead className="text-[#aaaaaa]">Status</TableHead>
                <TableHead className="text-[#aaaaaa] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => {
                const meta = getMetadata(job.jobname);
                const isExpanded = expandedJob === job.jobid;
                return (
                  <Fragment key={job.jobid}>
                    <TableRow
                      className="border-b border-[rgba(255,255,255,0.06)] cursor-pointer hover:bg-[rgba(255,255,255,0.03)] transition-colors"
                      onClick={() => setExpandedJob(isExpanded ? null : job.jobid)}
                    >
                      <TableCell className="w-8 pr-0">
                        {isExpanded
                          ? <ChevronDown className="w-4 h-4 text-[#ffc800]" />
                          : <ChevronRight className="w-4 h-4 text-[#666]" />
                        }
                      </TableCell>
                      <TableCell className="font-mono text-xs font-semibold text-[#f5f5f5]">
                        {job.jobname}
                      </TableCell>
                      <TableCell>
                        <span
                          className="text-xs font-medium px-2 py-0.5 rounded-full"
                          style={{
                            background: `${meta.categoryColor}20`,
                            color: meta.categoryColor,
                            border: `1px solid ${meta.categoryColor}30`,
                          }}
                        >
                          {meta.category}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <code className="bg-[rgba(255,255,255,0.06)] px-2 py-0.5 rounded text-xs text-[#cccccc]">
                            {job.schedule}
                          </code>
                          <span className="text-[10px] text-[#888]">{cronToHuman(job.schedule)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-[#cccccc]">
                        {extractFunctionName(job.command)}
                      </TableCell>
                      <TableCell>
                        {job.last_run_at ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs text-[#cccccc]">{formatDateTime(job.last_run_at)}</span>
                            <span className="flex items-center gap-1 text-[10px]">
                              {job.last_status === "succeeded"
                                ? <><CheckCircle2 className="w-3 h-3 text-green-400" /> <span className="text-green-400">OK</span></>
                                : <><XCircle className="w-3 h-3 text-red-400" /> <span className="text-red-400">Falhou</span></>
                              }
                              {job.last_duration_seconds != null && (
                                <span className="text-[#888] ml-1">({job.last_duration_seconds}s)</span>
                              )}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-[#666]">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className="text-xs border-0"
                          style={{
                            background: job.active ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                            color: job.active ? "#22c55e" : "#ef4444",
                          }}
                        >
                          {job.active ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                          <Button
                            variant="ghost" size="icon"
                            title={job.active ? "Desativar" : "Ativar"}
                            onClick={() => handleToggle(job)}
                            disabled={togglingJob === job.jobid}
                            className="hover:bg-[rgba(255,255,255,0.06)]"
                          >
                            {togglingJob === job.jobid
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <Power className={`h-4 w-4 ${job.active ? "text-green-500" : "text-red-400"}`} />
                            }
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            title="Editar schedule"
                            onClick={() => { setEditJob(job); setNewSchedule(job.schedule); }}
                            className="hover:bg-[rgba(255,255,255,0.06)]"
                          >
                            <Pencil className="h-4 w-4 text-[#aaaaaa]" />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            title="Executar agora"
                            onClick={() => handleRunNow(job)}
                            disabled={runningJob === job.jobid}
                            className="hover:bg-[rgba(255,255,255,0.06)]"
                          >
                            {runningJob === job.jobid
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <Play className="h-4 w-4 text-[#ffc800]" />
                            }
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>

                    {/* ── Expanded Detail Row ── */}
                    {isExpanded && (
                      <TableRow className="bg-[rgba(255,200,0,0.02)]">
                        <TableCell colSpan={8} className="p-0">
                          <div className="px-6 py-4 space-y-4">
                            {/* Description + Metadata */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div className="md:col-span-2">
                                <p className="text-xs font-medium text-[#ffc800] mb-1">Descrição</p>
                                <p className="text-sm text-[#cccccc] leading-relaxed">{meta.description}</p>
                              </div>
                              <div className="space-y-2">
                                <div>
                                  <p className="text-xs font-medium text-[#ffc800] mb-1">Criticidade</p>
                                  <Badge
                                    className="text-xs border-0"
                                    style={{
                                      background: meta.impact === "alto" ? "rgba(239,68,68,0.15)" : meta.impact === "médio" ? "rgba(245,158,11,0.15)" : "rgba(34,197,94,0.15)",
                                      color: meta.impact === "alto" ? "#ef4444" : meta.impact === "médio" ? "#f59e0b" : "#22c55e",
                                    }}
                                  >
                                    {meta.impact.toUpperCase()}
                                  </Badge>
                                </div>
                                {meta.relatedPage && (
                                  <div>
                                    <p className="text-xs font-medium text-[#ffc800] mb-1">Tela Relacionada</p>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); navigate(meta.relatedPage!); }}
                                      className="inline-flex items-center gap-1 text-xs text-[#3b82f6] hover:text-[#60a5fa] transition-colors"
                                    >
                                      <ExternalLink className="w-3 h-3" /> Abrir {meta.relatedPage}
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Execution History */}
                            <div>
                              <p className="text-xs font-medium text-[#ffc800] mb-2 flex items-center gap-1.5">
                                <Activity className="w-3.5 h-3.5" /> Últimas Execuções
                              </p>
                              <div className="rounded-xl overflow-hidden" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.06)" }}>
                                <HistoryTable jobid={job.jobid} />
                              </div>
                            </div>

                            {/* Full Command */}
                            <div>
                              <p className="text-xs font-medium text-[#ffc800] mb-1 flex items-center gap-1.5">
                                <Timer className="w-3.5 h-3.5" /> Comando SQL
                              </p>
                              <pre className="text-[10px] text-[#888] bg-[rgba(0,0,0,0.4)] rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all border border-[rgba(255,255,255,0.05)]">
                                {job.command}
                              </pre>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
              {jobs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 text-[#aaaaaa]">
                    Nenhum cron job encontrado
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </PageCard>
      )}

      {/* ── Edit Schedule Dialog ── */}
      <Dialog open={!!editJob} onOpenChange={(open) => !open && setEditJob(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Schedule</DialogTitle>
            <DialogDescription>
              Job: <span className="font-mono font-semibold">{editJob?.jobname}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-1 block">Presets</label>
              <div className="flex flex-wrap gap-2">
                {CRON_PRESETS.map((preset) => (
                  <Button
                    key={preset.value}
                    variant={newSchedule === preset.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setNewSchedule(preset.value)}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground mb-1 block">Expressão Cron</label>
              <Input
                value={newSchedule}
                onChange={(e) => setNewSchedule(e.target.value)}
                placeholder="*/5 * * * *"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground mt-1">Formato: minuto hora dia_mês mês dia_semana</p>
              {newSchedule && (
                <p className="text-xs mt-1 text-primary font-medium">→ {cronToHuman(newSchedule)}</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditJob(null)}>Cancelar</Button>
            <Button onClick={handleSaveSchedule} disabled={saving || !newSchedule.trim()}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
};

export default CronManager;
