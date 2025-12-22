import { useState } from "react";
import { Voucher, ETAPA_LABELS, calcularTempoNaEtapa, formatarTempoNaEtapa, SLA_POR_ETAPA } from "@/types/voucher";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VoucherActionsMenu } from "./VoucherActionsMenu";
import { AlertCircle, Eye, Clock, Building2, User, Plane, Ship, Package, FileCheck, FileClock, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { format, isToday, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export interface FilterValues {
  search: string;
  etapa: string;
  cobrancaEmNomeDe: string;
  formaPagamento: string;
  urgente: string;
  statusBaixa: string;
  statusComprovante: string;
  vencimentoInicio: string;
  vencimentoFim: string;
  origemCriacao: string;
}

type SortField = "numeroSPO" | "fornecedor" | "valor" | "vencimento" | "etapaAtual" | "tempoNaEtapa" | "createdAt";
type SortDirection = "asc" | "desc";

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
    RASCUNHO: "bg-gray-500/10 text-gray-400 border-gray-500/20",
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
  return labels[tipo] || tipo || "Normal";
};

const getRowClassName = (vencimento: Date | string) => {
  const venc = new Date(vencimento);
  if (isToday(venc)) {
    return "bg-warning/10 border-l-4 border-l-warning";
  }
  if (isPast(venc) && !isToday(venc)) {
    return "bg-destructive/10 border-l-4 border-l-destructive";
  }
  return "";
};

const getSlaStatus = (tempoHoras: number, etapa: string): "ok" | "warning" | "critical" => {
  const sla = SLA_POR_ETAPA[etapa as keyof typeof SLA_POR_ETAPA] || 24;
  if (sla === 0) return "ok";
  if (tempoHoras >= sla) return "critical";
  if (tempoHoras >= sla * 0.75) return "warning";
  return "ok";
};

const getSlaColor = (status: "ok" | "warning" | "critical") => {
  const colors = {
    ok: "text-green-500",
    warning: "text-warning",
    critical: "text-destructive animate-pulse",
  };
  return colors[status];
};

export const VoucherTable = ({ vouchers, onViewDetails, onEdit, onDelete, onGoBack, filters, onFilterChange }: VoucherTableProps) => {
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const handleFilterChange = (key: keyof FilterValues, value: string) => {
    onFilterChange({ ...filters, [key]: value });
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="h-3.5 w-3.5 opacity-50" />;
    return sortDirection === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />;
  };

  const sortedVouchers = [...vouchers].sort((a, b) => {
    let comparison = 0;
    
    switch (sortField) {
      case "numeroSPO":
        comparison = (a.numeroSPO || "").localeCompare(b.numeroSPO || "");
        break;
      case "fornecedor":
        comparison = (a.fornecedor || "").localeCompare(b.fornecedor || "");
        break;
      case "valor":
        comparison = (a.valor || 0) - (b.valor || 0);
        break;
      case "vencimento":
        comparison = new Date(a.vencimento).getTime() - new Date(b.vencimento).getTime();
        break;
      case "etapaAtual":
        comparison = (a.etapaAtual || "").localeCompare(b.etapaAtual || "");
        break;
      case "tempoNaEtapa":
        comparison = calcularTempoNaEtapa(a) - calcularTempoNaEtapa(b);
        break;
      case "createdAt":
        comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        break;
    }
    
    return sortDirection === "asc" ? comparison : -comparison;
  });

  const canGoBack = (voucher: Voucher): boolean => {
    if (voucher.etapaAtual === "OPERACAO" || voucher.etapaAtual === "CONCLUIDO") {
      return false;
    }
    return true;
  };

  const SortableHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <Button
      variant="ghost"
      size="sm"
      className="h-auto p-0 font-medium hover:bg-transparent flex items-center gap-1"
      onClick={() => handleSort(field)}
    >
      {children}
      {getSortIcon(field)}
    </Button>
  );

  return (
    <TooltipProvider>
      <div className="border border-primary/20 rounded-xl overflow-hidden bg-card/80 backdrop-blur-sm shadow-lg shadow-primary/5">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b-primary/30">
                <TableHead>
                  <SortableHeader field="numeroSPO">Nº Voucher (SPO)</SortableHeader>
                </TableHead>
                <TableHead>Processo / Origem</TableHead>
                <TableHead>Cobrança em Nome de</TableHead>
                <TableHead>
                  <SortableHeader field="fornecedor">Fornecedor</SortableHeader>
                </TableHead>
                <TableHead>
                  <SortableHeader field="valor">Valor Total</SortableHeader>
                </TableHead>
                <TableHead>
                  <SortableHeader field="vencimento">Data Vencimento</SortableHeader>
                </TableHead>
                <TableHead>Classificação</TableHead>
                <TableHead>
                  <SortableHeader field="etapaAtual">Etapa Atual</SortableHeader>
                </TableHead>
                <TableHead>
                  <SortableHeader field="tempoNaEtapa">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      Tempo na Etapa
                    </div>
                  </SortableHeader>
                </TableHead>
                <TableHead>Comprovante</TableHead>
                <TableHead>Responsável Atual</TableHead>
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
                <TableHead className="py-2">
                  <Select value={filters.cobrancaEmNomeDe} onValueChange={(value) => handleFilterChange("cobrancaEmNomeDe", value)}>
                    <SelectTrigger className="h-8 text-xs bg-card">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="DACHSER">Dachser</SelectItem>
                      <SelectItem value="CLIENTE">Cliente</SelectItem>
                    </SelectContent>
                  </Select>
                </TableHead>
                <TableHead className="py-2"></TableHead>
                <TableHead className="py-2"></TableHead>
                <TableHead className="py-2"></TableHead>
                <TableHead className="py-2">
                  <Select value={filters.urgente} onValueChange={(value) => handleFilterChange("urgente", value)}>
                    <SelectTrigger className="h-8 text-xs bg-card">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="URGENTE_REAL">Urgente Real</SelectItem>
                      <SelectItem value="URGENTE_AUTOMATICO">Urgente Auto</SelectItem>
                      <SelectItem value="NORMAL">Normal</SelectItem>
                    </SelectContent>
                  </Select>
                </TableHead>
                <TableHead className="py-2">
                  <Select value={filters.etapa} onValueChange={(value) => handleFilterChange("etapa", value)}>
                    <SelectTrigger className="h-8 text-xs bg-card">
                      <SelectValue placeholder="Todas" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      <SelectItem value="all">Todas</SelectItem>
                      <SelectItem value="OPERACAO">Voucher</SelectItem>
                      <SelectItem value="FISCAL">Fiscal</SelectItem>
                      <SelectItem value="SUPERVISOR">Supervisor</SelectItem>
                      <SelectItem value="FINANCEIRO">Financeiro</SelectItem>
                      <SelectItem value="ROBO">Robô</SelectItem>
                      <SelectItem value="CONCLUIDO">Concluído</SelectItem>
                      <SelectItem value="AJUSTE_OPERACAO">Ajuste Voucher</SelectItem>
                      <SelectItem value="AJUSTE_FISCAL">Ajuste Fiscal</SelectItem>
                    </SelectContent>
                  </Select>
                </TableHead>
                <TableHead className="py-2"></TableHead>
                <TableHead className="py-2">
                  <Select value={filters.statusComprovante || "all"} onValueChange={(value) => handleFilterChange("statusComprovante", value)}>
                    <SelectTrigger className="h-8 text-xs bg-card">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="PENDENTE">Pendente</SelectItem>
                      <SelectItem value="ANEXADO">Anexado</SelectItem>
                      <SelectItem value="VALIDADO">Validado</SelectItem>
                    </SelectContent>
                  </Select>
                </TableHead>
                <TableHead className="py-2"></TableHead>
                <TableHead className="py-2"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedVouchers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                    Nenhum voucher encontrado
                  </TableCell>
                </TableRow>
              ) : (
                sortedVouchers.map((voucher) => {
                  const tempoNaEtapa = calcularTempoNaEtapa(voucher);
                  const slaStatus = getSlaStatus(tempoNaEtapa, voucher.etapaAtual);
                  const slaLimit = SLA_POR_ETAPA[voucher.etapaAtual as keyof typeof SLA_POR_ETAPA] || 24;
                  
                  return (
                    <TableRow 
                      key={voucher.id} 
                      className={cn(
                        "hover:bg-primary/5 transition-all duration-200 cursor-pointer", 
                        getRowClassName(voucher.vencimento)
                      )}
                      onClick={() => onViewDetails(voucher)}
                    >
                      <TableCell className="font-mono font-medium">
                        <div className="flex items-center gap-2">
                          {voucher.numeroSPO}
                          {voucher.fonteDados === "RM_PENDENTE" && (
                            <Tooltip>
                              <TooltipTrigger onClick={(e) => e.stopPropagation()}>
                                <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30 text-[10px] px-1.5 py-0">
                                  RM Pendente
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs">Dados do RM ainda não sincronizados.</p>
                                <p className="text-xs text-warning">Voucher bloqueado até sincronização.</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {voucher.origemProcesso ? (
                          <Tooltip>
                            <TooltipTrigger onClick={(e) => e.stopPropagation()}>
                              <Badge 
                                variant="outline" 
                                className={cn(
                                  "gap-1",
                                  voucher.origemProcesso === "AIR" 
                                    ? "bg-sky-500/10 text-sky-500 border-sky-500/30" 
                                    : voucher.origemProcesso === "SEA"
                                      ? "bg-blue-500/10 text-blue-500 border-blue-500/30"
                                      : "bg-amber-500/10 text-amber-500 border-amber-500/30"
                                )}
                              >
                                {voucher.origemProcesso === "AIR" && <Plane className="h-3 w-3" />}
                                {voucher.origemProcesso === "SEA" && <Ship className="h-3 w-3" />}
                                {voucher.origemProcesso === "CHB" && <Package className="h-3 w-3" />}
                                {voucher.origemProcesso}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="text-xs">
                                <p className="font-medium">Processo: {voucher.processoId || "-"}</p>
                                <p>Origem: {voucher.origemProcesso === "AIR" ? "Aéreo" : voucher.origemProcesso === "SEA" ? "Marítimo" : "Customhouse Broker"}</p>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-muted-foreground text-xs">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger onClick={(e) => e.stopPropagation()}>
                            <Badge 
                              variant="outline" 
                              className={cn(
                                "gap-1",
                                voucher.cobrancaEmNomeDe === "DACHSER" 
                                  ? "bg-primary/10 text-primary border-primary/30" 
                                  : "bg-blue-500/10 text-blue-500 border-blue-500/30"
                              )}
                            >
                              {voucher.cobrancaEmNomeDe === "DACHSER" ? (
                                <Building2 className="h-3 w-3" />
                              ) : (
                                <User className="h-3 w-3" />
                              )}
                              {voucher.cobrancaEmNomeDe}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            Cobrança em nome de: {voucher.cobrancaEmNomeDe === "DACHSER" ? "Dachser" : "Cliente"}
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="text-sm max-w-[150px] truncate">{voucher.fornecedor || "-"}</TableCell>
                      <TableCell className="text-sm font-medium">
                        {voucher.valor ? `${voucher.moeda} ${voucher.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {format(new Date(voucher.vencimento), "dd/MM/yyyy", { locale: ptBR })}
                          {isToday(new Date(voucher.vencimento)) && (
                            <Tooltip>
                              <TooltipTrigger onClick={(e) => e.stopPropagation()}>
                                <AlertCircle className="h-4 w-4 text-warning" />
                              </TooltipTrigger>
                              <TooltipContent>Vence hoje!</TooltipContent>
                            </Tooltip>
                          )}
                          {isPast(new Date(voucher.vencimento)) && !isToday(new Date(voucher.vencimento)) && (
                            <Tooltip>
                              <TooltipTrigger onClick={(e) => e.stopPropagation()}>
                                <AlertCircle className="h-4 w-4 text-destructive" />
                              </TooltipTrigger>
                              <TooltipContent>Vencido!</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger onClick={(e) => e.stopPropagation()}>
                            <Badge className={getUrgenciaTipoColor(voucher.urgenciaTipo)}>
                              {getUrgenciaTipoLabel(voucher.urgenciaTipo)}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            {voucher.urgenciaMotivo || (voucher.urgenciaTipo === "URGENTE_AUTOMATICO" 
                              ? "Urgência automática (ICMS/Armazenagem)" 
                              : voucher.urgenciaTipo === "URGENTE_REAL" 
                                ? "Urgência manual aprovada" 
                                : "Prioridade normal"
                            )}
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <Badge className={getEtapaColor(voucher.etapaAtual)}>
                          {ETAPA_LABELS[voucher.etapaAtual] || voucher.etapaAtual}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {voucher.etapaAtual !== "CONCLUIDO" ? (
                          <Tooltip>
                            <TooltipTrigger onClick={(e) => e.stopPropagation()}>
                              <div className={cn("flex items-center gap-1 text-sm font-medium", getSlaColor(slaStatus))}>
                                <Clock className="h-3.5 w-3.5" />
                                {formatarTempoNaEtapa(tempoNaEtapa)}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="text-xs">
                                <p>Tempo na etapa: {formatarTempoNaEtapa(tempoNaEtapa)}</p>
                                <p>SLA: {slaLimit}h</p>
                                <p className={slaStatus === "critical" ? "text-destructive" : slaStatus === "warning" ? "text-warning" : "text-green-500"}>
                                  {slaStatus === "critical" ? "⚠️ SLA estourado!" : slaStatus === "warning" ? "⚡ Atenção ao SLA" : "✓ Dentro do SLA"}
                                </p>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const status = voucher.statusComprovante || "PENDENTE";
                          const config = {
                            PENDENTE: { icon: FileClock, label: "Pendente", className: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30" },
                            ANEXADO: { icon: FileCheck, label: "Anexado", className: "bg-blue-500/10 text-blue-500 border-blue-500/30" },
                            VALIDADO: { icon: FileCheck, label: "Validado", className: "bg-green-500/10 text-green-500 border-green-500/30" },
                          };
                          const { icon: Icon, label, className } = config[status as keyof typeof config] || config.PENDENTE;
                          return (
                            <Badge variant="outline" className={cn("gap-1", className)}>
                              <Icon className="h-3 w-3" />
                              {label}
                            </Badge>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-sm">
                        {voucher.etapaAtual === "OPERACAO" && (voucher.responsavelOperacaoUserName || "-")}
                        {voucher.etapaAtual === "FISCAL" && (voucher.responsavelFiscalUserName || "-")}
                        {voucher.etapaAtual === "SUPERVISOR" && (voucher.responsavelSupervisorUserName || "-")}
                        {voucher.etapaAtual === "FINANCEIRO" && (voucher.responsavelFinanceiroUserName || "-")}
                        {(voucher.etapaAtual === "ROBO" || voucher.etapaAtual === "CONCLUIDO") && "Sistema"}
                        {voucher.etapaAtual === "AJUSTE_OPERACAO" && (voucher.responsavelOperacaoUserName || "-")}
                        {voucher.etapaAtual === "AJUSTE_FISCAL" && (voucher.responsavelFiscalUserName || "-")}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
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
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </TooltipProvider>
  );
};