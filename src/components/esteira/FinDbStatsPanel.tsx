import { Database, ChevronDown, RefreshCw, Receipt, Users, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface EtapaBreakdown {
  etapa: string;
  label: string;
  count: number;
}

export interface FinDbStats {
  lastUpdate: string | null;
  totalVouchers: number;
  totalValor: number;
  etapaBreakdown: EtapaBreakdown[];
}

interface FinDbStatsPanelProps {
  stats: FinDbStats | null;
  isLoading: boolean;
  onRefresh?: () => void;
}

export const FinDbStatsPanel = ({ stats, isLoading, onRefresh }: FinDbStatsPanelProps) => {

  const formatRelativeTime = (dateString: string | null) => {
    if (!dateString) return "N/A";
    try {
      const localDateString = dateString.replace('Z', '');
      const date = new Date(localDateString);
      return formatDistanceToNow(date, { addSuffix: true, locale: ptBR });
    } catch {
      return "N/A";
    }
  };

  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return "N/A";
    try {
      const localDateString = dateString.replace('Z', '');
      const date = new Date(localDateString);
      return format(date, "dd/MM/yyyy HH:mm", { locale: ptBR });
    } catch {
      return "N/A";
    }
  };

  const getEtapaColor = (etapa: string) => {
    const colors: Record<string, string> = {
      OPERACAO: "#3b82f6",
      FISCAL: "#a855f7",
      SUPERVISOR: "#f97316",
      FINANCEIRO: "#eab308",
      ROBO: "#06b6d4",
      CONCLUIDO: "#22c55e",
      A_PROCESSAR: "#6366f1",
    };
    return colors[etapa] || "#888";
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className="gap-2 bg-[rgba(0,0,0,.70)] backdrop-blur-sm border-[rgba(255,255,255,.18)] hover:bg-[rgba(0,0,0,.85)] hover:border-[#ffc800]/50 text-[#aaaaaa] hover:text-[#f5f5f5]"
          disabled={isLoading}
        >
          {isLoading ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Database className="h-4 w-4 text-[#ffc800]" />
          )}
          <span className="hidden sm:inline text-xs">Base de Dados</span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      
      <PopoverContent 
        className="w-80 p-0 bg-[rgba(5,6,18,.95)] border-[rgba(255,255,255,.12)] backdrop-blur-xl" 
        align="end"
      >
        <div className="p-4 border-b border-[rgba(255,255,255,.08)]">
          <div className="flex items-center gap-2 mb-3">
            <Receipt className="h-4 w-4 text-[#ffc800]" />
            <span className="text-sm font-medium text-[#f5f5f5]">Esteira de Vouchers/SPO</span>
          </div>
          
          {stats && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[#888]">Última atualização:</span>
                <span className="font-medium text-[#f5f5f5]">{formatRelativeTime(stats.lastUpdate)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span></span>
                <span className="text-[#666]">{formatDateTime(stats.lastUpdate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#888]">Total Vouchers/SPO:</span>
                <span className="font-medium text-[#ffc800]">{stats.totalVouchers.toLocaleString('pt-BR')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#888]">Valor Total:</span>
                <span className="font-medium text-[#22c55e]">
                  R$ {stats.totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          )}
          
          {onRefresh && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-3 gap-1.5 h-7 px-2 text-xs text-[#888] hover:text-[#ffc800] hover:bg-[rgba(255,200,0,.1)]"
              onClick={onRefresh}
              disabled={isLoading}
            >
              <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
              Atualizar Dados
            </Button>
          )}
        </div>
        
        {stats && stats.etapaBreakdown.length > 0 && (
          <div className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-3.5 w-3.5 text-[#888]" />
              <span className="text-xs font-medium text-[#888]">Distribuição por Etapa</span>
            </div>
            
            <ScrollArea className="h-48">
              <div className="space-y-1.5 pr-3">
                {stats.etapaBreakdown.map((etapa) => {
                  const percentage = stats.totalVouchers > 0 
                    ? ((etapa.count / stats.totalVouchers) * 100).toFixed(1) 
                    : "0";
                  const color = getEtapaColor(etapa.etapa);
                  return (
                    <div key={etapa.etapa} className="text-xs">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="truncate flex-1">
                          <span className="text-[#f5f5f5]">{etapa.label}</span>
                        </span>
                        <span className="text-[#666] ml-2 whitespace-nowrap">
                          {etapa.count} ({percentage}%)
                        </span>
                      </div>
                      <div className="h-1 bg-[rgba(255,255,255,.08)] rounded-full overflow-hidden">
                        <div 
                          className="h-full rounded-full transition-all"
                          style={{ width: `${percentage}%`, backgroundColor: color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default FinDbStatsPanel;
