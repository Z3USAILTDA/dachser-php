import { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  value: number | string;
  icon: LucideIcon;
  subtitle?: string;
  variant?: "default" | "warning" | "critical" | "success" | "info";
  onClick?: () => void;
  active?: boolean;
}

const variantStyles = {
  default: {
    bg: "bg-card/50",
    icon: "bg-primary/20 text-primary",
    border: "border-border",
  },
  warning: {
    bg: "bg-yellow-500/10",
    icon: "bg-yellow-500/20 text-yellow-400",
    border: "border-yellow-500/30",
  },
  critical: {
    bg: "bg-destructive/10",
    icon: "bg-destructive/20 text-destructive",
    border: "border-destructive/30",
  },
  success: {
    bg: "bg-emerald-500/10",
    icon: "bg-emerald-500/20 text-emerald-400",
    border: "border-emerald-500/30",
  },
  info: {
    bg: "bg-blue-500/10",
    icon: "bg-blue-500/20 text-blue-400",
    border: "border-blue-500/30",
  },
};

export function MetricCard({
  title,
  value,
  icon: Icon,
  subtitle,
  variant = "default",
  onClick,
  active,
}: MetricCardProps) {
  const styles = variantStyles[variant];

  return (
    <Card
      className={cn(
        "transition-all duration-200 backdrop-blur-sm",
        styles.bg,
        styles.border,
        onClick && "cursor-pointer hover:scale-[1.02]",
        active && "ring-2 ring-primary"
      )}
      onClick={onClick}
    >
      <CardContent className="p-4 flex items-center gap-4">
        <div className={cn("p-3 rounded-lg", styles.icon)}>
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <p className="text-2xl font-bold text-foreground">{value}</p>
          <p className="text-sm text-muted-foreground">{title}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground/70">{subtitle}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
