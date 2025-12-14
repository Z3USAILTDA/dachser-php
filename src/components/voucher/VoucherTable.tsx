import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Voucher, EtapaAtual, ETAPA_LABELS } from "@/types/voucher";
import { Eye, Pencil, Trash2, Search, ChevronLeft, ChevronRight, AlertTriangle, Clock } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

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
  onGoBack?: (voucher: Voucher) => void;
  filters: FilterValues;
  onFilterChange: (filters: FilterValues) => void;
}

const ITEMS_PER_PAGE = 15;

export const VoucherTable = ({
  vouchers,
  onViewDetails,
  onEdit,
  onDelete,
  filters,
  onFilterChange,
}: VoucherTableProps) => {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(vouchers.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedVouchers = vouchers.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const getEtapaBadgeColor = (etapa: EtapaAtual) => {
    switch (etapa) {
      case "OPERACAO": return "bg-info text-info-foreground";
      case "FISCAL": return "bg-warning text-warning-foreground";
      case "SUPERVISOR": return "bg-primary text-primary-foreground";
      case "FINANCEIRO": return "bg-green-600 text-white";
      case "ROBO": return "bg-muted text-muted-foreground";
      case "CONCLUIDO": return "bg-green-500 text-white";
      case "AJUSTE_OPERACAO": return "bg-orange-500 text-white";
      case "AJUSTE_FISCAL": return "bg-orange-400 text-white";
      default: return "bg-secondary text-secondary-foreground";
    }
  };

  const getUrgenciaBadge = (urgenciaTipo: string) => {
    switch (urgenciaTipo) {
      case "URGENTE_REAL":
        return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />Real</Badge>;
      case "URGENTE_AUTOMATICO":
        return <Badge className="bg-warning text-warning-foreground gap-1"><Clock className="h-3 w-3" />Auto</Badge>;
      default:
        return null;
    }
  };

  const isVencido = (vencimento: Date) => {
    return new Date(vencimento) < new Date();
  };

  const isVencendo = (vencimento: Date) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return new Date(vencimento) <= tomorrow && new Date(vencimento) >= new Date();
  };

  return (
    <div className="space-y-4">
      {/* Filters Row */}
      <div className="flex flex-wrap gap-3 p-4 bg-muted/20 rounded-lg">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(e) => onFilterChange({ ...filters, search: e.target.value })}
            placeholder="Buscar por SPO..."
            className="pl-9 bg-background/50"
          />
        </div>
        
        <Select value={filters.etapa} onValueChange={(v) => onFilterChange({ ...filters, etapa: v })}>
          <SelectTrigger className="w-[150px] bg-background/50">
            <SelectValue placeholder="Etapa" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas Etapas</SelectItem>
            {Object.entries(ETAPA_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.cobrancaEmNomeDe} onValueChange={(v) => onFilterChange({ ...filters, cobrancaEmNomeDe: v })}>
          <SelectTrigger className="w-[140px] bg-background/50">
            <SelectValue placeholder="Cobrança" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="DACHSER">DACHSER</SelectItem>
            <SelectItem value="CLIENTE">CLIENTE</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filters.urgente} onValueChange={(v) => onFilterChange({ ...filters, urgente: v })}>
          <SelectTrigger className="w-[140px] bg-background/50">
            <SelectValue placeholder="Urgência" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="NORMAL">Normal</SelectItem>
            <SelectItem value="URGENTE_REAL">Urgente Real</SelectItem>
            <SelectItem value="URGENTE_AUTOMATICO">Urgente Auto</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border/50 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="font-semibold">SPO</TableHead>
              <TableHead className="font-semibold">Fornecedor</TableHead>
              <TableHead className="font-semibold">Valor</TableHead>
              <TableHead className="font-semibold">Vencimento</TableHead>
              <TableHead className="font-semibold">Etapa</TableHead>
              <TableHead className="font-semibold">Urgência</TableHead>
              <TableHead className="font-semibold">Cobrança</TableHead>
              <TableHead className="text-right font-semibold">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedVouchers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  Nenhum voucher encontrado
                </TableCell>
              </TableRow>
            ) : (
              paginatedVouchers.map((voucher, index) => (
                <TableRow 
                  key={voucher.id} 
                  className="even:bg-muted/10 hover:bg-muted/20 transition-colors animate-fade-in"
                  style={{ animationDelay: `${index * 30}ms` }}
                >
                  <TableCell className="font-mono font-medium">{voucher.numeroSPO}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{voucher.fornecedor}</TableCell>
                  <TableCell>
                    {voucher.valor ? `${voucher.moeda} ${voucher.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'}
                  </TableCell>
                  <TableCell>
                    <span className={
                      isVencido(voucher.vencimento) ? "text-destructive font-medium" :
                      isVencendo(voucher.vencimento) ? "text-warning font-medium" : ""
                    }>
                      {format(new Date(voucher.vencimento), "dd/MM/yyyy", { locale: ptBR })}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge className={getEtapaBadgeColor(voucher.etapaAtual)}>
                      {ETAPA_LABELS[voucher.etapaAtual]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {getUrgenciaBadge(voucher.urgenciaTipo)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{voucher.cobrancaEmNomeDe}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => onViewDetails(voucher)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => onEdit(voucher)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => onDelete(voucher)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4">
          <p className="text-sm text-muted-foreground">
            Mostrando {startIndex + 1} - {Math.min(startIndex + ITEMS_PER_PAGE, vouchers.length)} de {vouchers.length}
          </p>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm px-2">
              Página {currentPage} de {totalPages}
            </span>
            <Button 
              variant="outline" 
              size="sm" 
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(p => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
