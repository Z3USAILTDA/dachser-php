import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { StatusCCTOficial, SLAStatus, SLAInfo } from "@/types/cct";
import { formatSLARestante } from "@/types/cct";

interface StatusBadgeProps {
  status: StatusCCTOficial | string;
  className?: string;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  // Status de Manifestação CCT (Nomenclatura Aduaneira)
  INFORMADA: { label: "Informada", color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30" },
  MANIFESTADA: { label: "Manifestada", color: "bg-primary/20 text-primary border-primary/30" },
  EM_AREA_TRANSFERENCIA: { label: "Em área de Transferência", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  RECEPCIONADA: { label: "Recepcionada", color: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30" },
  EM_TROCA_RECINTOS: { label: "Em Troca entre Recintos", color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  EM_TRANSITO_TERRESTRE: { label: "Em Trânsito Terrestre", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  ENTREGUE: { label: "Entregue", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  BLOQUEIO: { label: "Bloqueio", color: "bg-destructive/20 text-destructive border-destructive/30" },
  
  // SLA Status (for compatibility)
  OK: { label: "OK", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  ALERTA: { label: "Alerta", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  CRITICO: { label: "Crítico", color: "bg-destructive/20 text-destructive border-destructive/30" },
  VENCIDO: { label: "Vencido", color: "bg-red-600/20 text-red-500 border-red-600/30" },
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
  showTipoVoo?: boolean;
}

export function SLAInfoBadge({ slaInfo, className, showTipoVoo = false }: SLAInfoBadgeProps) {
  const { status, horasRestantes, tipoVoo, slaLimite } = slaInfo;
  
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
  
  // Format remaining hours
  const displayValue = formatSLARestante(horasRestantes);
  
  // Tipo de voo label
  const tipoVooIcon = tipoVoo === 'VOO_CURTO' ? '✈️' : '🌍';
  const tipoVooLabel = tipoVoo === 'VOO_CURTO' ? 'Curto' : 'Longo';
  
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {showTipoVoo && tipoVoo && (
        <Badge 
          variant="outline" 
          className="bg-muted/30 text-muted-foreground border-border text-[0.65rem] px-1.5"
          title={tipoVoo === 'VOO_CURTO' ? 'América do Sul (+30min)' : 'Intercontinental (ETA -4h)'}
        >
          {tipoVooIcon} {tipoVooLabel}
        </Badge>
      )}
      <Badge variant="outline" className={cn(getColor(), "font-mono text-xs")}>
        {displayValue}
      </Badge>
    </div>
  );
}
