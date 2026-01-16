import { Badge } from "@/components/ui/badge";

interface BadgeStatusProps {
  status: string;
}

export const BadgeStatus = ({ status }: BadgeStatusProps) => {
  const getStatusConfig = (status: string) => {
    // Map all statuses to either "REALIZADO" or "PENDENTE"
    if (status === 'completed' || status === 'realizado') {
      return {
        label: 'REALIZADO',
        variant: 'default' as const,
        className: 'sea-badge-realizado bg-emerald-500/15 text-emerald-400 border-emerald-500/40 px-3 py-1 rounded-full text-xs font-semibold'
      };
    }
    
    // All other statuses show as "PENDENTE"
    return {
      label: 'PENDENTE',
      variant: 'secondary' as const,
      className: 'sea-badge-pendente bg-amber-500/15 text-amber-400 border-amber-500/40 px-3 py-1 rounded-full text-xs font-semibold'
    };
  };

  const config = getStatusConfig(status);

  return (
    <Badge
      variant={config.variant}
      className={config.className}
    >
      {config.label}
    </Badge>
  );
};
