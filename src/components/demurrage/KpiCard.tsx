import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  variant?: "default" | "primary" | "success" | "warning" | "danger" | "info";
  className?: string;
  onClick?: () => void;
}

const variantStyles = {
  default: "border-[rgba(255,255,255,0.1)]",
  primary: "border-primary/30 bg-primary/5",
  success: "border-green-500/30 bg-green-500/5",
  warning: "border-yellow-500/30 bg-yellow-500/5",
  danger: "border-red-500/30 bg-red-500/5",
  info: "border-blue-500/30 bg-blue-500/5",
};

const iconStyles = {
  default: "text-muted-foreground",
  primary: "text-primary",
  success: "text-green-500",
  warning: "text-yellow-500",
  danger: "text-red-500",
  info: "text-blue-500",
};

export function KpiCard({ 
  title, 
  value, 
  subtitle, 
  icon, 
  variant = "default",
  className,
  onClick
}: KpiCardProps) {
  return (
    <div 
      className={cn(
        "rounded-xl border bg-[rgba(0,0,0,0.5)] p-4 backdrop-blur-sm transition-all duration-200",
        variantStyles[variant],
        onClick && "cursor-pointer hover:-translate-y-0.5 hover:border-primary/50",
        className
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {title}
          </p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {icon && (
          <div className={cn("opacity-80", iconStyles[variant])}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
