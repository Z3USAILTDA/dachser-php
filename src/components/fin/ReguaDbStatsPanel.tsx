import { Database, ChevronDown, RefreshCw, Receipt } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

export interface ReguaDbStats {
  lastUpdate: string | null;
  totalRecords: number;
}

interface ReguaDbStatsPanelProps {
  stats: ReguaDbStats | null;
  isLoading: boolean;
  onRefresh?: () => void;
}

export const ReguaDbStatsPanel = ({ stats, isLoading, onRefresh }: ReguaDbStatsPanelProps) => {
  if (!stats && !isLoading) return null;

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
        className="w-72 p-0 bg-[rgba(5,6,18,.95)] border-[rgba(255,255,255,.12)] backdrop-blur-xl" 
        align="end"
      >
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Receipt className="h-4 w-4 text-[#ffc800]" />
            <span className="text-sm font-medium text-[#f5f5f5]">Financeiro NFs</span>
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
                <span className="text-[#888]">Total Registros:</span>
                <span className="font-medium text-[#ffc800]">{stats.totalRecords.toLocaleString('pt-BR')}</span>
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
              Atualizar
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default ReguaDbStatsPanel;
