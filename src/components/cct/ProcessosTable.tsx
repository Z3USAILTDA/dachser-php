import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge, SLABadge } from "./StatusBadge";
import { Search, Eye, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { ProcessoCCT } from "@/types/cct";

export type MetricFilterType = "total" | "alerta" | "critico" | "eventos24h" | null;

interface ProcessosTableProps {
  processos: ProcessoCCT[];
  onAssignAnalista?: (processo: ProcessoCCT) => void;
  metricFilter?: MetricFilterType;
}

export function ProcessosTable({ processos, onAssignAnalista, metricFilter }: ProcessosTableProps) {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");

  const filteredProcessos = useMemo(() => {
    let filtered = processos;

    // Apply metric filter
    if (metricFilter === "alerta") {
      filtered = filtered.filter(p => p.status_atual?.sla_status === "ALERTA");
    } else if (metricFilter === "critico") {
      filtered = filtered.filter(p => p.status_atual?.sla_status === "CRITICO");
    } else if (metricFilter === "eventos24h") {
      const now = new Date();
      filtered = filtered.filter(p => 
        p.eventos.some(e => {
          const eventDate = new Date(e.data_hora_evento);
          return now.getTime() - eventDate.getTime() < 24 * 60 * 60 * 1000;
        })
      );
    }

    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(p =>
        p.shipment.house.toLowerCase().includes(term) ||
        p.shipment.master.toLowerCase().includes(term) ||
        p.shipment.cliente.toLowerCase().includes(term) ||
        p.shipment.analista?.nome?.toLowerCase().includes(term)
      );
    }

    return filtered;
  }, [processos, searchTerm, metricFilter]);

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return "-";
    return format(new Date(dateStr), "dd/MM HH:mm", { locale: ptBR });
  };

  if (processos.length === 0) {
    return (
      <Card className="bg-card/50 border-border p-10 text-center">
        <AlertTriangle className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">Nenhum processo encontrado.</p>
      </Card>
    );
  }

  return (
    <Card className="bg-card/50 border-border backdrop-blur-sm overflow-hidden">
      {/* Search */}
      <div className="p-4 border-b border-border">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por house, master, cliente ou analista..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-background/50"
          />
        </div>
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-border">
            <TableHead className="text-muted-foreground">Manif.</TableHead>
            <TableHead className="text-muted-foreground">House</TableHead>
            <TableHead className="text-muted-foreground">Cliente</TableHead>
            <TableHead className="text-muted-foreground">Rota</TableHead>
            <TableHead className="text-muted-foreground">Status</TableHead>
            <TableHead className="text-muted-foreground">SLA</TableHead>
            <TableHead className="text-muted-foreground">Analista</TableHead>
            <TableHead className="text-muted-foreground text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredProcessos.map((processo, index) => {
            const isCCT = processo.status_atual?.status_cct_oficial !== "AGUARDANDO_MANIFESTACAO";
            const excecoesAbertas = processo.excecoes.filter(e => e.status_excecao !== "RESOLVIDA").length;

            return (
              <TableRow 
                key={processo.shipment.id}
                className={`border-border ${index % 2 === 0 ? "bg-muted/5" : "bg-transparent"}`}
              >
                <TableCell>
                  <Badge 
                    variant="outline" 
                    className={isCCT 
                      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" 
                      : "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                    }
                  >
                    {isCCT ? "CCT" : "DEP"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div>
                    <p className="font-mono font-medium text-foreground">{processo.shipment.house}</p>
                    <p className="text-xs text-muted-foreground">{processo.shipment.master}</p>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {processo.shipment.cliente}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {processo.shipment.aeroporto_origem} → {processo.shipment.aeroporto_destino}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={processo.status_atual?.status_cct_oficial || "AGUARDANDO_MANIFESTACAO"} />
                    {excecoesAbertas > 0 && (
                      <Badge variant="destructive" className="text-xs">
                        {excecoesAbertas}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <SLABadge status={processo.status_atual?.sla_status || "OK"} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {processo.shipment.analista?.nome || processo.shipment.nome_analista_legado || "-"}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(`/air/cct/processo/${processo.shipment.id}`)}
                    className="text-primary hover:text-primary hover:bg-primary/10"
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    Ver
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* Empty state for filtered results */}
      {filteredProcessos.length === 0 && processos.length > 0 && (
        <div className="p-10 text-center">
          <p className="text-muted-foreground">Nenhum resultado para a busca "{searchTerm}"</p>
        </div>
      )}
    </Card>
  );
}
