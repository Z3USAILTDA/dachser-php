import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Clock } from "lucide-react";

interface LeadComexStatusBadgeProps {
  status: 'success' | 'failed' | 'pending';
  attempts?: number | null;
}

import { RefreshCw } from "lucide-react";

const config = {
  success: {
    label: 'Consultado',
    icon: CheckCircle2,
    className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  },
  failed: {
    label: 'Aguardando nova consulta',
    icon: RefreshCw,
    className: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  },
  pending: {
    label: 'Aguardando...',
    icon: Clock,
    className: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
  },
};

export function LeadComexStatusBadge({ status, attempts }: LeadComexStatusBadgeProps) {
  const c = config[status] || config.pending;
  const Icon = c.icon;
  const showAttempts = status === 'failed' && attempts && attempts > 0;

  return (
    <Badge variant="outline" className={`${c.className} gap-1 font-medium text-[0.7rem] whitespace-nowrap`}>
      <Icon className="h-3 w-3" />
      {c.label}
      {showAttempts && <span className="opacity-70">({attempts}x)</span>}
    </Badge>
  );
}
