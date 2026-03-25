import { useState, useEffect } from "react";
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
import { Play, Pencil, Power, RefreshCw, Clock, Loader2 } from "lucide-react";
import { PageLayout } from "@/components/layout/PageLayout";
import { PageCard } from "@/components/layout/PageCard";
import { toast } from "sonner";

interface CronJob {
  jobid: number;
  jobname: string;
  schedule: string;
  active: boolean;
  command: string;
}

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

  if (hour.includes("-") && min === "0") {
    return `A cada hora (${hour} UTC)`;
  }
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

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const callCronManager = async (action: string, body?: Record<string, unknown>) => {
  const url = `https://${PROJECT_ID}.supabase.co/functions/v1/cron-manager?action=${action}`;
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

const CronManager = () => {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [editJob, setEditJob] = useState<CronJob | null>(null);
  const [newSchedule, setNewSchedule] = useState("");
  const [saving, setSaving] = useState(false);
  const [runningJob, setRunningJob] = useState<number | null>(null);
  const [togglingJob, setTogglingJob] = useState<number | null>(null);

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
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#ffc800]" />
        </div>
      ) : (
        <PageCard className="overflow-hidden">
          <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Função Alvo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job.jobid}>
                    <TableCell className="font-mono text-xs font-semibold">
                      {job.jobname}
                    </TableCell>
                    <TableCell>
                      <code className="bg-muted px-2 py-0.5 rounded text-xs">
                        {job.schedule}
                      </code>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {cronToHuman(job.schedule)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {extractFunctionName(job.command)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={job.active ? "default" : "destructive"} className="text-xs">
                        {job.active ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title={job.active ? "Desativar" : "Ativar"}
                          onClick={() => handleToggle(job)}
                          disabled={togglingJob === job.jobid}
                        >
                          {togglingJob === job.jobid ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Power className={`h-4 w-4 ${job.active ? "text-green-500" : "text-destructive"}`} />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Editar schedule"
                          onClick={() => {
                            setEditJob(job);
                            setNewSchedule(job.schedule);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Executar agora"
                          onClick={() => handleRunNow(job)}
                          disabled={runningJob === job.jobid}
                        >
                          {runningJob === job.jobid ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {jobs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                      Nenhum cron job encontrado
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
        </PageCard>
      )}

      {/* Edit Schedule Dialog */}
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
              <label className="text-sm font-medium text-muted-foreground mb-1 block">
                Presets
              </label>
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
              <label className="text-sm font-medium text-muted-foreground mb-1 block">
                Expressão Cron
              </label>
              <Input
                value={newSchedule}
                onChange={(e) => setNewSchedule(e.target.value)}
                placeholder="*/5 * * * *"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Formato: minuto hora dia_mês mês dia_semana
              </p>
              {newSchedule && (
                <p className="text-xs mt-1 text-primary font-medium">
                  → {cronToHuman(newSchedule)}
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditJob(null)}>
              Cancelar
            </Button>
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
