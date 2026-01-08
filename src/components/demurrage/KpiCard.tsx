import { cn } from "@/lib/utils";

export type KpiVariant = "default" | "warning" | "success" | "critical" | "info";

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  variant?: KpiVariant;
  isActive?: boolean;
  onClick?: () => void;
}

const variantStyles: Record<KpiVariant, { icon: string; border: string }> = {
  default: {
    icon: "bg-[#ffc800]/20 text-[#ffc800]",
    border: "border-l-[#ffc800]",
  },
  warning: {
    icon: "bg-yellow-500/20 text-yellow-500",
    border: "border-l-yellow-500",
  },
  success: {
    icon: "bg-green-500/20 text-green-500",
    border: "border-l-green-500",
  },
  critical: {
    icon: "bg-red-500/20 text-red-500",
    border: "border-l-red-500",
  },
  info: {
    icon: "bg-blue-500/20 text-blue-500",
    border: "border-l-blue-500",
  },
};

export function KpiCard({
  title,
  value,
  subtitle,
  icon,
  variant = "default",
  isActive = false,
  onClick,
}: KpiCardProps) {
  const styles = variantStyles[variant];

  return (
    <div
      onClick={onClick}
      className={cn(
        "relative flex items-center justify-between p-5 rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] backdrop-blur-sm transition-all",
        `border-l-4 ${styles.border}`,
        onClick && "cursor-pointer hover:bg-[rgba(5,6,18,0.95)]",
        isActive && "ring-1 ring-[#ffc800]/70"
      )}
    >
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wider text-[#aaaaaa]">
          {title}
        </p>
        <p className="text-2xl font-bold text-white">{value}</p>
        {subtitle && (
          <p className="text-xs text-[#888888]">{subtitle}</p>
        )}
      </div>
      {icon && (
        <div
          className={cn(
            "flex items-center justify-center w-12 h-12 rounded-xl",
            styles.icon
          )}
        >
          {icon}
        </div>
      )}
    </div>
  );
}
