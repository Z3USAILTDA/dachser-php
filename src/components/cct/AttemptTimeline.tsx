import { CheckCircle2, XCircle, AlertCircle, Loader2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AttemptLog {
  attempt_number: number;
  date: string;
  status: 'pending' | 'processing' | 'not_found' | 'error' | 'found';
  http_status?: number;
  response_time_ms?: number;
  error_message?: string;
}

interface AttemptTimelineProps {
  attempts: AttemptLog[];
  isProcessing?: boolean;
}

const statusConfig = {
  pending: {
    icon: Clock,
    color: 'text-gray-400',
    bgColor: 'bg-gray-500',
    borderColor: 'border-gray-500/40',
    label: 'Aguardando',
  },
  processing: {
    icon: Loader2,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500',
    borderColor: 'border-blue-500/40',
    label: 'Processando',
  },
  not_found: {
    icon: AlertCircle,
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500',
    borderColor: 'border-yellow-500/40',
    label: 'Não encontrado',
  },
  error: {
    icon: XCircle,
    color: 'text-red-400',
    bgColor: 'bg-red-500',
    borderColor: 'border-red-500/40',
    label: 'Erro',
  },
  found: {
    icon: CheckCircle2,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500',
    borderColor: 'border-emerald-500/40',
    label: 'Encontrado',
  },
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function AttemptTimeline({ attempts, isProcessing }: AttemptTimelineProps) {
  if (attempts.length === 0 && !isProcessing) {
    return null;
  }

  return (
    <div className="relative space-y-0">
      {attempts.map((attempt, index) => {
        const config = statusConfig[attempt.status];
        const Icon = config.icon;
        const isLast = index === attempts.length - 1;
        const isFound = attempt.status === 'found';

        return (
          <div
            key={attempt.attempt_number}
            className={cn(
              "relative pl-8 pb-6 animate-fade-in",
              isFound && "pb-2"
            )}
            style={{ animationDelay: `${index * 150}ms` }}
          >
            {/* Vertical line */}
            {!isLast && (
              <div 
                className={cn(
                  "absolute left-[11px] top-6 w-0.5 h-[calc(100%-12px)]",
                  isFound 
                    ? "bg-gradient-to-b from-emerald-500 to-emerald-500/20"
                    : "bg-gradient-to-b from-white/20 to-white/5"
                )}
              />
            )}

            {/* Status dot */}
            <div 
              className={cn(
                "absolute left-0 top-0 w-6 h-6 rounded-full flex items-center justify-center",
                config.bgColor + '/20',
                "border",
                config.borderColor
              )}
            >
              <Icon 
                className={cn(
                  "h-3.5 w-3.5",
                  config.color,
                  attempt.status === 'processing' && "animate-spin"
                )} 
              />
            </div>

            {/* Content */}
            <div 
              className={cn(
                "rounded-xl border p-4 transition-all",
                isFound 
                  ? "bg-emerald-500/10 border-emerald-500/30" 
                  : "bg-[rgba(5,6,18,0.7)] border-white/10"
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-white/80">
                  Tentativa {attempt.attempt_number}
                </span>
                <span className={cn("text-xs font-mono", config.color)}>
                  {formatDate(attempt.date)}
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs">
                <span className={cn(
                  "px-2 py-0.5 rounded-full border",
                  config.color,
                  config.borderColor,
                  config.bgColor + '/10'
                )}>
                  {config.label}
                </span>

                {attempt.http_status && (
                  <span className="text-white/50 font-mono">
                    HTTP {attempt.http_status}
                  </span>
                )}

                {attempt.response_time_ms && (
                  <span className="text-white/50 font-mono">
                    {(attempt.response_time_ms / 1000).toFixed(2)}s
                  </span>
                )}
              </div>

              {attempt.error_message && (
                <p className="mt-2 text-xs text-red-400/80 font-mono truncate">
                  {attempt.error_message}
                </p>
              )}
            </div>
          </div>
        );
      })}

      {/* Processing indicator for next attempt */}
      {isProcessing && (
        <div className="relative pl-8 animate-pulse">
          <div 
            className="absolute left-0 top-0 w-6 h-6 rounded-full flex items-center justify-center bg-blue-500/20 border border-blue-500/40"
          >
            <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin" />
          </div>
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
            <span className="text-sm text-blue-400">Processando próxima tentativa...</span>
          </div>
        </div>
      )}
    </div>
  );
}
