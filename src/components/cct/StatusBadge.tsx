import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { StatusCCTOficial, SLAStatus } from "@/types/cct";

interface StatusBadgeProps {
  status: StatusCCTOficial | string;
  className?: string;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  AGUARDANDO_MANIFESTACAO: { label: "Aguard. Manif.", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  MANIFESTADO: { label: "Manifestado", color: "bg-primary/20 text-primary border-primary/30" },
  AREA_TRANSFERENCIA: { label: "Área Transf.", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  CHEGADA_INFORMADA: { label: "Chegada Inf.", color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30" },
  RECEPCIONADO: { label: "Recepcionado", color: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30" },
  EM_TRANSITO: { label: "Em Trânsito", color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  ENTREGUE: { label: "Entregue", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  BLOQUEIO: { label: "Bloqueio", color: "bg-destructive/20 text-destructive border-destructive/30" },
  OK: { label: "OK", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  ALERTA: { label: "Alerta", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  CRITICO: { label: "Crítico", color: "bg-destructive/20 text-destructive border-destructive/30" },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] || { label: status, color: "bg-muted text-muted-foreground border-border" };

  return (
    <Badge variant="outline" className={cn(config.color, "font-medium", className)}>
      {config.label}
    </Badge>
  );
}

interface SLABadgeProps {
  status: SLAStatus;
  className?: string;
}

export function SLABadge({ status, className }: SLABadgeProps) {
  const config = statusConfig[status];
  
  return (
    <Badge variant="outline" className={cn(config?.color, "font-medium text-xs", className)}>
      SLA: {config?.label || status}
    </Badge>
  );
}
