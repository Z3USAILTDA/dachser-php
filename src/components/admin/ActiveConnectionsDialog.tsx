import { useEffect, useState } from "react";
import { RefreshCw, Users, Wifi } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { parseDBDate } from "@/utils/timezone";
import { prettifyEndpoint } from "@/utils/endpointLabels";

interface ActiveConnection {
  sessionId: string;
  username: string;
  sessionStartedAt: string;
  lastActivityAt: string;
  eventCount: number;
  currentEndpoint: string;
}

interface ActiveConnectionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requesterUsername?: string;
  onCountChange?: (uniqueUsers: number, totalSessions: number) => void;
}

const formatDuration = (sec: number) => {
  if (!sec || sec <= 0) return "agora";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

const relativeFromDb = (dateStr: string | null) => {
  if (!dateStr) return "—";
  const d = parseDBDate(dateStr);
  if (!d) return "—";
  try {
    return formatDistanceToNow(d, { addSuffix: true, locale: ptBR });
  } catch {
    return "—";
  }
};

const durationFromDb = (dateStr: string | null, serverNow: Date) => {
  if (!dateStr) return "—";
  const d = parseDBDate(dateStr);
  if (!d) return "—";
  const sec = Math.max(0, Math.floor((serverNow.getTime() - d.getTime()) / 1000));
  return formatDuration(sec);
};

export const ActiveConnectionsDialog = ({
  open,
  onOpenChange,
  requesterUsername,
  onCountChange,
}: ActiveConnectionsDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [connections, setConnections] = useState<ActiveConnection[]>([]);
  const [uniqueUsers, setUniqueUsers] = useState(0);
  const [activityWindowMin, setActivityWindowMin] = useState(20);
  const [serverNow, setServerNow] = useState<Date>(new Date());
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { action: "get_active_connections", requesterUsername },
      });
      if (!error && data?.success) {
        const conns: ActiveConnection[] = data.connections || [];
        setConnections(conns);
        setUniqueUsers(Number(data.uniqueUsers || 0));
        setActivityWindowMin(Number(data.activityWindowMin || 20));
        setServerNow(data.serverNow ? new Date(data.serverNow) : new Date());
        setLastFetchedAt(new Date());
        onCountChange?.(Number(data.uniqueUsers || 0), conns.length);
      }
    } catch (err) {
      console.error("Failed to fetch active connections:", err);
    } finally {
      setLoading(false);
    }
  };

  // Carrega apenas ao abrir o modal — sem auto-refresh.
  useEffect(() => {
    if (open) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl bg-[#0a0b10] border-white/12 text-foreground">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Wifi className="h-4 w-4 text-primary" />
            Conexões Ativas
            <span className="text-[11px] font-normal text-muted-foreground ml-2">
              Janela de {activityWindowMin} minutos · alinhado ao logout por inatividade
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Resumo + botão atualizar */}
        <div className="flex items-center justify-between flex-wrap gap-3 px-1">
          <div className="flex items-center gap-3 text-sm">
            <span className="px-3 py-1.5 rounded-full border border-white/12 bg-white/5 flex items-center gap-2">
              <Users className="h-3.5 w-3.5 text-primary" />
              <strong className="text-primary">{uniqueUsers}</strong>
              <span className="text-muted-foreground">usuários ativos</span>
            </span>
            <span className="px-3 py-1.5 rounded-full border border-white/12 bg-white/5">
              <strong>{connections.length}</strong>{" "}
              <span className="text-muted-foreground">sessões</span>
            </span>
            <span className="text-[11px] text-muted-foreground">
              {lastFetchedAt
                ? `Atualizado ${formatDistanceToNow(lastFetchedAt, { addSuffix: true, locale: ptBR })}`
                : "Nunca atualizado"}
            </span>
          </div>
          <Button size="sm" variant="outline" onClick={fetchData} disabled={loading} className="gap-2">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        {/* Tabela */}
        <div className="max-h-[60vh] overflow-auto rounded-xl border border-white/12 mt-2">
          <table className="w-full text-sm">
            <thead className="bg-[#14151c] sticky top-0 z-10">
              <tr>
                <th className="py-2.5 px-3 text-left text-[11px] uppercase tracking-[0.12em] font-medium text-muted-foreground">Usuário</th>
                <th className="py-2.5 px-3 text-left text-[11px] uppercase tracking-[0.12em] font-medium text-muted-foreground">Sessão</th>
                <th className="py-2.5 px-3 text-left text-[11px] uppercase tracking-[0.12em] font-medium text-muted-foreground">Conectado há</th>
                <th className="py-2.5 px-3 text-left text-[11px] uppercase tracking-[0.12em] font-medium text-muted-foreground">Última atividade</th>
                <th className="py-2.5 px-3 text-left text-[11px] uppercase tracking-[0.12em] font-medium text-muted-foreground">Tela atual</th>
                <th className="py-2.5 px-3 text-right text-[11px] uppercase tracking-[0.12em] font-medium text-muted-foreground">Eventos</th>
              </tr>
            </thead>
            <tbody>
              {loading && connections.length === 0 ? (
                <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Carregando...</td></tr>
              ) : connections.length === 0 ? (
                <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">
                  Nenhum usuário com conexão ativa nos últimos {activityWindowMin} minutos.
                </td></tr>
              ) : (
                connections.map((c) => {
                  const pretty = c.currentEndpoint ? prettifyEndpoint(c.currentEndpoint) : null;
                  return (
                    <tr key={c.sessionId} className="border-t border-white/5 hover:bg-white/5">
                      <td className="py-2.5 px-3 font-medium">{c.username}</td>
                      <td className="py-2.5 px-3 text-[11px] text-muted-foreground font-mono">
                        …{c.sessionId.slice(-6)}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="text-primary font-semibold">
                          {durationFromDb(c.sessionStartedAt, serverNow)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground">
                        {relativeFromDb(c.lastActivityAt)}
                      </td>
                      <td className="py-2.5 px-3 max-w-[280px]">
                        {pretty ? (
                          <span className="truncate block" title={c.currentEndpoint}>
                            {pretty.label}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">{c.eventCount}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ActiveConnectionsDialog;
