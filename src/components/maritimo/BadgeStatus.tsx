import { cn } from "@/lib/utils";

interface BadgeStatusProps {
  status: string;
}

export function BadgeStatus({ status }: BadgeStatusProps) {
  const getStatusConfig = (status: string) => {
    switch (status?.toLowerCase()) {
      case "completed":
      case "realizado":
        return { label: "Realizado", className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" };
      case "processing":
        return { label: "Processando", className: "bg-blue-500/20 text-blue-400 border-blue-500/30" };
      case "queued":
        return { label: "Na fila", className: "bg-amber-500/20 text-amber-400 border-amber-500/30" };
      case "error":
      case "failed":
        return { label: "Erro", className: "bg-rose-500/20 text-rose-400 border-rose-500/30" };
      default:
        return { label: "Pendente", className: "bg-neutral-500/20 text-neutral-400 border-neutral-500/30" };
    }
  };

  const config = getStatusConfig(status);

  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-medium uppercase tracking-wider border",
        config.className
      )}
    >
      {config.label}
    </span>
  );
}
