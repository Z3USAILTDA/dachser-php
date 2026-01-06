import { SyncStatus } from "@/types/draft";
import { Badge } from "@/components/ui/badge";
import { 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  XCircle, 
  Timer,
  HelpCircle,
  Circle
} from "lucide-react";

interface TrackingStatusBadgeProps {
  status: SyncStatus;
  showIcon?: boolean;
}

const statusConfig: Record<SyncStatus, {
  label: string;
  className: string;
  icon: React.ComponentType<{ className?: string }>;
}> = {
  'Completed': {
    label: 'Completed',
    className: 'bg-green-500/20 text-green-400 border-green-500/30',
    icon: CheckCircle2
  },
  'In Progress': {
    label: 'In Progress',
    className: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    icon: Clock
  },
  'Pending': {
    label: 'Pending',
    className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    icon: Timer
  },
  'Error': {
    label: 'Error',
    className: 'bg-red-500/20 text-red-400 border-red-500/30',
    icon: XCircle
  },
  'Rate Limited': {
    label: 'Rate Limited',
    className: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    icon: AlertCircle
  },
  'Unknown': {
    label: 'Unknown',
    className: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    icon: HelpCircle
  },
  'Nunca Consultado': {
    label: 'Nunca Consultado',
    className: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    icon: Circle
  }
};

export const TrackingStatusBadge = ({ status, showIcon = true }: TrackingStatusBadgeProps) => {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <Badge 
      variant="outline" 
      className={`${config.className} gap-1.5 font-medium`}
    >
      {showIcon && <Icon className="h-3 w-3" />}
      {config.label}
    </Badge>
  );
};
