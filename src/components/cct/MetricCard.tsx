import { LucideIcon } from "lucide-react";
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
    iconBg: "bg-primary/20",
    iconColor: "text-primary",
    valueBorder: "",
  },
  warning: {
    iconBg: "bg-yellow-500/20",
    iconColor: "text-yellow-400",
    valueBorder: "border-l-2 border-l-yellow-500/50",
  },
  critical: {
    iconBg: "bg-rose-500/20",
    iconColor: "text-rose-400",
    valueBorder: "border-l-2 border-l-rose-500/50",
  },
  success: {
    iconBg: "bg-emerald-500/20",
    iconColor: "text-emerald-400",
    valueBorder: "border-l-2 border-l-emerald-500/50",
  },
  info: {
    iconBg: "bg-blue-500/20",
    iconColor: "text-blue-400",
    valueBorder: "border-l-2 border-l-blue-500/50",
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
    <div
      onClick={onClick}
      className={cn(
        "relative rounded-2xl p-5 transition-all duration-200",
        "bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)]",
        "backdrop-blur-[18px]",
        "shadow-[0_18px_40px_rgba(0,0,0,0.85)]",
        onClick && "cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_22px_50px_rgba(0,0,0,0.9)]",
        active && "ring-2 ring-primary/60 shadow-[0_0_20px_rgba(255,200,0,0.3)]"
      )}
    >
      <div className="flex items-start justify-between">
        <div className={cn("flex-1", styles.valueBorder, styles.valueBorder && "pl-4")}>
          <p className="text-[0.75rem] uppercase tracking-wider text-[#aaaaaa] mb-1">{title}</p>
          <p className={cn(
            "text-3xl font-bold text-white",
            variant === "warning" && "text-yellow-400",
            variant === "critical" && "text-rose-400",
            variant === "success" && "text-emerald-400",
          )}>
            {value}
          </p>
          {subtitle && (
            <p className="text-[0.7rem] text-[#888888] mt-1">{subtitle}</p>
          )}
        </div>
        
        <div className={cn(
          "w-12 h-12 rounded-xl flex items-center justify-center",
          styles.iconBg
        )}>
          <Icon className={cn("h-6 w-6", styles.iconColor)} />
        </div>
      </div>
    </div>
  );
}
