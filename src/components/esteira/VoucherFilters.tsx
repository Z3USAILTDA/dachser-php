import * as React from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";

interface VoucherFiltersProps {
  onSearch: (filters: FilterValues) => void;
}

export interface FilterValues {
  search: string;
  etapa: string;
  cobrancaEmNomeDe: string;
  formaPagamento: string;
  urgente: string;
}

export const VoucherFilters = ({ onSearch }: VoucherFiltersProps) => {
  const [filters, setFilters] = React.useState<FilterValues>({
    search: "",
    etapa: "all",
    cobrancaEmNomeDe: "all",
    formaPagamento: "all",
    urgente: "all",
  });

  const handleFilterChange = (key: keyof FilterValues, value: string) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    onSearch(newFilters);
  };

  const handleClear = () => {
    const clearedFilters = {
      search: "",
      etapa: "all",
      cobrancaEmNomeDe: "all",
      formaPagamento: "all",
      urgente: "all",
    };
    setFilters(clearedFilters);
    onSearch(clearedFilters);
  };

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div>
          <Label htmlFor="search">Buscar por SPO/Voucher</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="search"
              placeholder="Nº SPO"
              value={filters.search}
              onChange={(e) => handleFilterChange("search", e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <div>
          <Label>Etapa</Label>
          <Select value={filters.etapa} onValueChange={(v) => handleFilterChange("etapa", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
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
        </div>

        <div>
          <Label>Cobrança em nome de</Label>
          <Select value={filters.cobrancaEmNomeDe} onValueChange={(v) => handleFilterChange("cobrancaEmNomeDe", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="DACHSER">Dachser</SelectItem>
              <SelectItem value="CLIENTE">Cliente</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Forma de Pagamento</Label>
          <Select value={filters.formaPagamento} onValueChange={(v) => handleFilterChange("formaPagamento", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="BOLETO">Boleto</SelectItem>
              <SelectItem value="TRANSFERENCIA_PIX">Transferência/Pix</SelectItem>
              <SelectItem value="DEBITO">Débito</SelectItem>
              <SelectItem value="CAMBIO">Câmbio</SelectItem>
              <SelectItem value="ADF">ADF</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Urgente</Label>
          <Select value={filters.urgente} onValueChange={(v) => handleFilterChange("urgente", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="true">Sim</SelectItem>
              <SelectItem value="false">Não</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={handleClear} className="gap-2">
          <X className="h-4 w-4" />
          Limpar Filtros
        </Button>
      </div>
    </div>
  );
};
