import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plane, Ship, FileText, ExternalLink, Building2, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProcessoOrigemCardProps {
  processoId?: string | null;
  origemProcesso?: string | null;
  clienteNome?: string | null;
  cnpjFornecedor?: string | null;
  centroCusto?: string | null;
  tipoOperacao?: string | null;
  fonteDados?: string | null;
}

const ORIGEM_CONFIG = {
  AIR: {
    label: "AIR",
    fullLabel: "Aéreo",
    icon: Plane,
    className: "bg-info/10 text-info border-info/30",
  },
  SEA: {
    label: "SEA",
    fullLabel: "Marítimo",
    icon: Ship,
    className: "bg-primary/10 text-primary border-primary/30",
  },
  CHB: {
    label: "CHB",
    fullLabel: "Customs House Broker",
    icon: FileText,
    className: "bg-warning/10 text-warning border-warning/30",
  },
};

const FONTE_LABELS: Record<string, string> = {
  MANUAL: "Entrada Manual",
  RM: "Importado do RM",
  NOVA: "Importado do NOVA",
  OTHELLO: "Via Webhook OTHELLO",
};

export const ProcessoOrigemCard = ({
  processoId,
  origemProcesso,
  clienteNome,
  cnpjFornecedor,
  centroCusto,
  tipoOperacao,
  fonteDados,
}: ProcessoOrigemCardProps) => {
  const config = origemProcesso
    ? ORIGEM_CONFIG[origemProcesso as keyof typeof ORIGEM_CONFIG]
    : null;
  const Icon = config?.icon || FileText;

  if (!processoId && !origemProcesso && !fonteDados) {
    return null;
  }

  return (
    <Card className="bg-card/60 border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          Origem Operacional
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Processo vinculado */}
        {processoId && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {config && (
                <div className={cn("p-2 rounded-lg", config.className)}>
                  <Icon className="h-5 w-5" />
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground">Processo</p>
                <div className="flex items-center gap-2">
                  <p className="font-mono font-medium">{processoId}</p>
                  {config && (
                    <Badge variant="outline" className={config.className}>
                      {config.fullLabel}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <button className="text-primary hover:text-primary/80 transition-colors">
              <ExternalLink className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Dados herdados do processo */}
        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border/50">
          {clienteNome && (
            <div className="flex items-start gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground">Cliente</p>
                <p className="text-sm font-medium">{clienteNome}</p>
              </div>
            </div>
          )}
          {cnpjFornecedor && (
            <div>
              <p className="text-xs text-muted-foreground">CNPJ</p>
              <p className="text-sm font-mono">{cnpjFornecedor}</p>
            </div>
          )}
          {tipoOperacao && (
            <div>
              <p className="text-xs text-muted-foreground">Tipo Operação</p>
              <p className="text-sm">{tipoOperacao}</p>
            </div>
          )}
          {centroCusto && (
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground">Centro de Custo</p>
                <p className="text-sm font-medium">{centroCusto}</p>
              </div>
            </div>
          )}
        </div>

        {/* Fonte dos dados */}
        {fonteDados && (
          <div className="pt-2 border-t border-border/50">
            <p className="text-xs text-muted-foreground">Fonte dos Dados</p>
            <Badge variant="secondary" className="mt-1">
              {FONTE_LABELS[fonteDados] || fonteDados}
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
