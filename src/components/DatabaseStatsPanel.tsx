import { Database, ChevronDown, RefreshCw, Plane } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface AirlineBreakdown {
  code: string;
  name: string;
  count: number;
}

export interface DbStats {
  lastUpdate: string | null;
  totalRecords: number;
  airlineBreakdown: AirlineBreakdown[];
}

interface DatabaseStatsPanelProps {
  stats: DbStats | null;
  isLoading: boolean;
  onRefresh?: () => void;
}

export const DatabaseStatsPanel = ({ stats, isLoading, onRefresh }: DatabaseStatsPanelProps) => {
  if (!stats && !isLoading) return null;

  const formatRelativeTime = (dateString: string | null) => {
    if (!dateString) return "N/A";
    try {
      const date = new Date(dateString);
      return formatDistanceToNow(date, { addSuffix: true, locale: ptBR });
    } catch {
      return "N/A";
    }
  };

  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return "N/A";
    try {
      const date = new Date(dateString);
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
          size="icon"
          className="w-8 h-8 rounded-full bg-[rgba(0,0,0,.70)] backdrop-blur-sm border-[rgba(255,255,255,.18)] hover:bg-[rgba(0,0,0,.85)] hover:border-[#ffc800]/50 text-[#aaaaaa] hover:text-[#f5f5f5]"
          disabled={isLoading}
        >
          {isLoading ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Database className="h-4 w-4 text-[#ffc800]" />
          )}
        </Button>
      </PopoverTrigger>
      
      <PopoverContent 
        className="w-80 p-0 bg-[rgba(5,6,18,.95)] border-[rgba(255,255,255,.12)] backdrop-blur-xl" 
        align="start"
      >
        <div className="p-4 border-b border-[rgba(255,255,255,.08)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-[#ffc800]" />
              <span className="font-medium text-sm text-[#f5f5f5]">Base de Dados</span>
            </div>
            {onRefresh && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-[#aaaaaa] hover:text-[#ffc800] hover:bg-[rgba(255,255,255,.05)]"
                onClick={onRefresh}
                disabled={isLoading}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            )}
          </div>
          
          {stats && (
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[#888]">Última atualização:</span>
                <span className="font-medium text-[#f5f5f5]">{formatRelativeTime(stats.lastUpdate)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span></span>
                <span className="text-[#666]">{formatDateTime(stats.lastUpdate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#888]">Total AWBs:</span>
                <span className="font-medium text-[#ffc800]">{stats.totalRecords.toLocaleString('pt-BR')}</span>
              </div>
            </div>
          )}
        </div>
        
        {stats && stats.airlineBreakdown.length > 0 && (
          <div className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <Plane className="h-3.5 w-3.5 text-[#888]" />
              <span className="text-xs font-medium text-[#888]">Distribuição por CIA</span>
            </div>
            
            <ScrollArea className="h-48">
              <div className="space-y-1.5 pr-3">
                {stats.airlineBreakdown.map((airline) => {
                  const percentage = ((airline.count / stats.totalRecords) * 100).toFixed(1);
                  return (
                    <div key={airline.code} className="text-xs">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="truncate flex-1">
                          <span className="font-mono text-[#ffc800]">{airline.code}</span>
                          <span className="text-[#888] ml-1.5">{airline.name}</span>
                        </span>
                        <span className="text-[#666] ml-2 whitespace-nowrap">
                          {airline.count} ({percentage}%)
                        </span>
                      </div>
                      <div className="h-1 bg-[rgba(255,255,255,.08)] rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-[#ffc800]/60 rounded-full transition-all"
                          style={{ width: `${percentage}%` }}
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

export default DatabaseStatsPanel;