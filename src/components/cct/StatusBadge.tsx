import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { StatusCCTOficial, SLAStatus, SLAInfo } from "@/types/cct";
import { formatSLARestante } from "@/types/cct";

interface StatusBadgeProps {
  status: StatusCCTOficial | string;
  className?: string;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  // Main CCT Status
  AGUARDANDO_MANIFESTACAO: { label: "Aguard. Manif.", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  COLETA_REALIZADA: { label: "Coleta", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  CARGA_RECEBIDA_TECA: { label: "TECA", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  MANIFESTADO: { label: "Manifestado", color: "bg-primary/20 text-primary border-primary/30" },
  AREA_TRANSFERENCIA: { label: "Área Transf.", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  CHEGADA_INFORMADA: { label: "Chegada Inf.", color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30" },
  RECEPCIONADO: { label: "Recepcionado", color: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30" },
  DISPONIVEL_RETIRADA: { label: "Disponível", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  EM_TRANSITO: { label: "Em Trânsito", color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  EM_TRANSITO_LAST_MILE: { label: "Last Mile", color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  ENTREGUE: { label: "Entregue", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  BLOQUEIO: { label: "Bloqueio", color: "bg-destructive/20 text-destructive border-destructive/30" },
  FROZEN: { label: "Congelado", color: "bg-sky-500/20 text-sky-400 border-sky-500/30" },
  
  // Legacy SLA Status (for compatibility)
  OK: { label: "OK", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  ALERTA: { label: "Alerta", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  CRITICO: { label: "Crítico", color: "bg-destructive/20 text-destructive border-destructive/30" },
  VENCIDO: { label: "Vencido", color: "bg-red-600/20 text-red-500 border-red-600/30" },
  
  // Raw tracking codes
  DEP: { label: "Embarcado", color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  ARR: { label: "Chegada", color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30" },
  RCF: { label: "Recepcionado", color: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30" },
  NFD: { label: "Notificado", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  AWD: { label: "Em Espera", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  DLV: { label: "Entregue", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  POD: { label: "Comprovado", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  FRO: { label: "Congelado", color: "bg-sky-500/20 text-sky-400 border-sky-500/30" },
  DIS: { label: "Divergência", color: "bg-destructive/20 text-destructive border-destructive/30" },
  OFLD: { label: "Descarregado", color: "bg-destructive/20 text-destructive border-destructive/30" },
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

interface SLAInfoBadgeProps {
  slaInfo: SLAInfo;
  className?: string;
}

export function SLAInfoBadge({ slaInfo, className }: SLAInfoBadgeProps) {
  const { status, horasRestantes } = slaInfo;
  
  const getColor = () => {
    switch (status) {
      case 'OK':
        return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
      case 'ALERTA':
        return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      case 'CRITICO':
        return "bg-orange-500/20 text-orange-400 border-orange-500/30";
      case 'VENCIDO':
        return "bg-red-600/20 text-red-500 border-red-600/30";
      default:
        return "bg-muted text-muted-foreground border-border";
    }
  };
  
  const formattedTime = formatSLARestante(horasRestantes);
  
  return (
    <Badge variant="outline" className={cn(getColor(), "font-mono text-xs", className)}>
      {formattedTime}
    </Badge>
  );
}
