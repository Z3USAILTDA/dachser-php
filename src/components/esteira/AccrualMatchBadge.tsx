import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertTriangle, XCircle, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface AccrualMatchBadgeProps {
  status: string | null | undefined;
  valorFatura?: number;
  valorAccrual?: number;
  diferenca?: number;
}

const STATUS_CONFIG = {
  MATCH_OK: {
    label: "Match OK",
    icon: CheckCircle,
    className: "bg-green-500/10 text-green-500 border-green-500/30",
    description: "Valor da fatura confere com a provisão",
  },
  MATCH_PARCIAL: {
    label: "Match Parcial",
    icon: AlertTriangle,
    className: "bg-warning/10 text-warning border-warning/30",
    description: "Há diferença entre fatura e provisão",
  },
  SEM_ACCRUAL: {
    label: "Sem Accrual",
    icon: XCircle,
    className: "bg-destructive/10 text-destructive border-destructive/30",
    description: "Não foi encontrada provisão correspondente",
  },
  PENDENTE: {
    label: "Pendente",
    icon: HelpCircle,
    className: "bg-muted/50 text-muted-foreground border-border",
    description: "Aguardando verificação de accrual",
  },
};

export const AccrualMatchBadge = ({
  status,
  valorFatura,
  valorAccrual,
  diferenca,
}: AccrualMatchBadgeProps) => {
  const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.PENDENTE;
  const Icon = config.icon;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn("gap-1 cursor-help", config.className)}
          >
            <Icon className="h-3 w-3" />
            {config.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="font-medium mb-1">{config.description}</p>
          {status !== "PENDENTE" && valorFatura !== undefined && (
            <div className="text-xs space-y-1">
              <p>Valor Fatura: R$ {valorFatura.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
              {valorAccrual !== undefined && (
                <p>Valor Accrual: R$ {valorAccrual.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
              )}
              {diferenca !== undefined && diferenca !== 0 && (
                <p className={diferenca > 0 ? "text-destructive" : "text-green-500"}>
                  Diferença: R$ {diferenca.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </p>
              )}
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
