import { useState } from "react";
import { Database, ChevronDown, ChevronUp, Plane, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

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
  isLoading?: boolean;
}

export const DatabaseStatsPanel = ({ stats, isLoading }: DatabaseStatsPanelProps) => {
  const [isOpen, setIsOpen] = useState(false);

  if (isLoading) {
    return (
      <Card className="bg-card/80 backdrop-blur-sm border-border/50">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="animate-pulse flex items-center gap-2">
              <div className="h-5 w-5 bg-muted rounded"></div>
              <div className="h-4 w-48 bg-muted rounded"></div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!stats) {
    return null;
  }

  const formatLastUpdate = (dateString: string | null) => {
    if (!dateString) return "Não disponível";
    
    try {
      const date = new Date(dateString);
      const formattedDate = date.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      const relativeTime = formatDistanceToNow(date, { addSuffix: true, locale: ptBR });
      return `${formattedDate} (${relativeTime})`;
    } catch {
      return dateString;
    }
  };

  const getPercentage = (count: number) => {
    if (stats.totalRecords === 0) return 0;
    return ((count / stats.totalRecords) * 100).toFixed(1);
  };

  return (
    <Card className="bg-card/80 backdrop-blur-sm border-border/50">
      <CardContent className="p-4">
        <div className="flex flex-col gap-3">
          {/* Header row */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              <span className="font-medium text-foreground">Base de Dados</span>
            </div>
            <Badge variant="secondary" className="text-sm">
              <Plane className="h-3 w-3 mr-1" />
              {stats.totalRecords.toLocaleString("pt-BR")} AWBs
            </Badge>
          </div>

          {/* Last update */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>Última atualização: {formatLastUpdate(stats.lastUpdate)}</span>
          </div>

          {/* Airlines breakdown - Collapsible */}
          {stats.airlineBreakdown.length > 0 && (
            <Collapsible open={isOpen} onOpenChange={setIsOpen}>
              <CollapsibleTrigger className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors w-full justify-start">
                {isOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
                <span>Distribuição por Companhia ({stats.airlineBreakdown.length})</span>
              </CollapsibleTrigger>
              
              <CollapsibleContent className="mt-3">
                <div className="grid gap-2 max-h-64 overflow-y-auto pr-2">
                  {stats.airlineBreakdown.map((airline) => (
                    <div
                      key={airline.code}
                      className="flex items-center justify-between text-sm bg-muted/50 rounded-lg px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs bg-background px-1.5 py-0.5 rounded">
                          {airline.code}
                        </span>
                        <span className="text-foreground">{airline.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${Math.min(100, parseFloat(String(getPercentage(airline.count))))}%` }}
                          />
                        </div>
                        <span className="text-muted-foreground text-xs w-16 text-right">
                          {airline.count.toLocaleString("pt-BR")} ({String(getPercentage(airline.count))}%)
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
