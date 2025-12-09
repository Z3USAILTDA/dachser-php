import { Voucher } from "@/types/voucher";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VoucherActionsMenu } from "./VoucherActionsMenu";
import { AlertCircle, Eye } from "lucide-react";
import { format, isToday, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

export interface FilterValues {
  search: string;
  etapa: string;
  cobrancaEmNomeDe: string;
  formaPagamento: string;
  urgente: string;
}

interface VoucherTableProps {
  vouchers: Voucher[];
  onViewDetails: (voucher: Voucher) => void;
  onEdit: (voucher: Voucher) => void;
  onDelete: (voucher: Voucher) => void;
  onGoBack: (voucher: Voucher) => void;
  filters: FilterValues;
  onFilterChange: (filters: FilterValues) => void;
}

const getEtapaColor = (etapa: string) => {
  const colors: Record<string, string> = {
    OPERACAO: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    FISCAL: "bg-purple-500/10 text-purple-500 border-purple-500/20",
    SUPERVISOR: "bg-orange-500/10 text-orange-500 border-orange-500/20",
    FINANCEIRO: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    ROBO: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
    CONCLUIDO: "bg-green-500/10 text-green-500 border-green-500/20",
    AJUSTE_OPERACAO: "bg-orange-500/10 text-orange-500 border-orange-500/20",
    AJUSTE_FISCAL: "bg-red-500/10 text-red-500 border-red-500/20",
  };
  return colors[etapa] || "bg-gray-500/10 text-gray-500";
};

const getUrgenciaTipoColor = (tipo: string) => {
  const colors: Record<string, string> = {
    NORMAL: "bg-slate-500/10 text-slate-600 border-slate-500/20",
    URGENTE_REAL: "bg-red-500/10 text-red-600 border-red-500/20",
    URGENTE_AUTOMATICO: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  };
  return colors[tipo] || "bg-slate-500/10 text-slate-600";
};

const getUrgenciaTipoLabel = (tipo: string) => {
  const labels: Record<string, string> = {
    NORMAL: "Normal",
    URGENTE_REAL: "Urgente Real",
    URGENTE_AUTOMATICO: "Urgente Auto",
  };
  return labels[tipo] || tipo;
};

const getStatusBaixaColor = (status: string) => {
  const colors: Record<string, string> = {
    PENDENTE: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    BAIXA_MANUAL: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    BAIXA_REMESSA: "bg-purple-500/10 text-purple-500 border-purple-500/20",
    BAIXADO_RM: "bg-green-500/10 text-green-500 border-green-500/20",
  };
  return colors[status] || "";
};

const getRowClassName = (vencimento: Date) => {
  if (isToday(vencimento)) {
    return "bg-amber-500/10 border-l-4 border-l-amber-500";
  }
  if (isPast(vencimento) && !isToday(vencimento)) {
    return "bg-destructive/10 border-l-4 border-l-destructive";
  }
  return "";
};

export const VoucherTable = ({ vouchers, onViewDetails, onEdit, onDelete, onGoBack, filters, onFilterChange }: VoucherTableProps) => {
  const handleFilterChange = (key: keyof FilterValues, value: string) => {
    onFilterChange({ ...filters, [key]: value });
  };

  const canGoBack = (voucher: Voucher): boolean => {
    // Não pode voltar se estiver em OPERACAO ou CONCLUIDO
    if (voucher.etapaAtual === "OPERACAO" || voucher.etapaAtual === "CONCLUIDO") {
      return false;
    }
    return true;
  };

  return (
    <div className="border border-primary/20 rounded-xl overflow-hidden bg-card/80 backdrop-blur-sm shadow-lg shadow-primary/5">
      <Table>
        <TableHeader>
          <TableRow className="border-b-primary/30">
            <TableHead>Nº SPO</TableHead>
            <TableHead>Fornecedor</TableHead>
            <TableHead>Valor</TableHead>
            <TableHead>Vencimento</TableHead>
            <TableHead>Tipo Doc</TableHead>
            <TableHead>Cobrança</TableHead>
            <TableHead>Urgência</TableHead>
            <TableHead>Etapa</TableHead>
            <TableHead>Status Baixa</TableHead>
            <TableHead>Responsável</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
          <TableRow className="bg-background/50 border-b-primary/10">
            <TableHead className="py-2">
              <Input
                placeholder="Buscar..."
                value={filters.search}
                onChange={(e) => handleFilterChange("search", e.target.value)}
                className="h-8 text-xs"
              />
            </TableHead>
            <TableHead className="py-2"></TableHead>
            <TableHead className="py-2"></TableHead>
            <TableHead className="py-2"></TableHead>
            <TableHead className="py-2"></TableHead>
            <TableHead className="py-2">
              <Select value={filters.cobrancaEmNomeDe} onValueChange={(value) => handleFilterChange("cobrancaEmNomeDe", value)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="DACHSER">Dachser</SelectItem>
                  <SelectItem value="CLIENTE">Cliente</SelectItem>
                </SelectContent>
              </Select>
            </TableHead>
            <TableHead className="py-2">
              <Select value={filters.urgente} onValueChange={(value) => handleFilterChange("urgente", value)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="true">Urgente</SelectItem>
                  <SelectItem value="false">Normal</SelectItem>
                </SelectContent>
              </Select>
            </TableHead>
            <TableHead className="py-2">
              <Select value={filters.etapa} onValueChange={(value) => handleFilterChange("etapa", value)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="OPERACAO">Operação</SelectItem>
                  <SelectItem value="FISCAL">Fiscal</SelectItem>
                  <SelectItem value="SUPERVISOR">Supervisor</SelectItem>
                  <SelectItem value="FINANCEIRO">Financeiro</SelectItem>
                  <SelectItem value="ROBO">Robô</SelectItem>
                  <SelectItem value="CONCLUIDO">Concluído</SelectItem>
                  <SelectItem value="AJUSTE_OPERACAO">Ajuste Operação</SelectItem>
                  <SelectItem value="AJUSTE_FISCAL">Ajuste Fiscal</SelectItem>
                </SelectContent>
              </Select>
            </TableHead>
            <TableHead className="py-2"></TableHead>
            <TableHead className="py-2"></TableHead>
            <TableHead className="py-2"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {vouchers.length === 0 ? (
            <TableRow>
              <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                Nenhum voucher encontrado
              </TableCell>
            </TableRow>
          ) : (
            vouchers.map((voucher) => (
              <TableRow key={voucher.id} className={cn("hover:bg-primary/5 transition-all duration-200", getRowClassName(voucher.vencimento))}>
                <TableCell className="font-mono font-medium">{voucher.numeroSPO}</TableCell>
                <TableCell className="text-sm">{voucher.fornecedor || "-"}</TableCell>
                <TableCell className="text-sm font-medium">
                  {voucher.valor ? `${voucher.moeda} ${voucher.valor.toFixed(2)}` : "-"}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {format(voucher.vencimento, "dd/MM/yyyy", { locale: ptBR })}
                    {isToday(voucher.vencimento) && (
                      <AlertCircle className="h-4 w-4 text-amber-500" />
                    )}
                    {isPast(voucher.vencimento) && !isToday(voucher.vencimento) && (
                      <AlertCircle className="h-4 w-4 text-destructive" />
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-xs">
                  {voucher.tipoDocumento ? voucher.tipoDocumento.replace("_", " ") : "-"}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {voucher.cobrancaEmNomeDe}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge className={getUrgenciaTipoColor(voucher.urgenciaTipo)}>
                    {getUrgenciaTipoLabel(voucher.urgenciaTipo)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge className={getEtapaColor(voucher.etapaAtual)}>
                    {voucher.etapaAtual.replace("_", " ")}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={getStatusBaixaColor(voucher.statusBaixa)}>
                    {voucher.statusBaixa.replace("_", " ")}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">
                  {voucher.etapaAtual === "OPERACAO" && voucher.responsavelOperacaoUserName}
                  {voucher.etapaAtual === "FISCAL" && voucher.responsavelFiscalUserName}
                  {voucher.etapaAtual === "SUPERVISOR" && voucher.responsavelSupervisorUserName}
                  {voucher.etapaAtual === "FINANCEIRO" && voucher.responsavelFinanceiroUserName}
                  {(voucher.etapaAtual === "ROBO" || voucher.etapaAtual === "CONCLUIDO") && "Sistema"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onViewDetails(voucher)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <VoucherActionsMenu
                      onEdit={() => onEdit(voucher)}
                      onDelete={() => onDelete(voucher)}
                      onGoBack={() => onGoBack(voucher)}
                      canGoBack={canGoBack(voucher)}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
};
