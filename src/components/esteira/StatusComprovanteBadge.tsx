import { Badge } from "@/components/ui/badge";
import { FileCheck, Clock, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatusComprovanteBadgeProps {
  status: string | null | undefined;
}

const STATUS_CONFIG = {
  PENDENTE: {
    label: "Comprovante Pendente",
    icon: Clock,
    className: "bg-warning/10 text-warning border-warning/30",
  },
  ANEXADO: {
    label: "Comprovante Anexado",
    icon: FileCheck,
    className: "bg-info/10 text-info border-info/30",
  },
  VALIDADO: {
    label: "Comprovante Validado",
    icon: CheckCircle,
    className: "bg-green-500/10 text-green-500 border-green-500/30",
  },
};

export const StatusComprovanteBadge = ({ status }: StatusComprovanteBadgeProps) => {
  const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.PENDENTE;
  const Icon = config.icon;

  return (
    <Badge variant="outline" className={cn("gap-1", config.className)}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
};
