import { useState, useEffect, useMemo } from "react";
import { Search, RefreshCw, TrendingUp, TrendingDown, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PageLayout } from "@/components/layout/PageLayout";
import { PageCard } from "@/components/layout/PageCard";
import { TablePagination } from "@/components/layout/TablePagination";

// Types
interface FeeChange {
  chave: string | null;
  empresa: string;
  charge_description: string;
  charge_code: string;
  container_type: string;
  currency: string;
  unit_of_measure: string;
  fee_anterior: number | null;
  fee_atual: number | null;
  diff_abs: number | null;
  diff_pct: number | null;
  effective_anterior: string | null;
  effective_atual: string | null;
  dt_chave_anterior: string | null;
  dt_chave_atual: string | null;
  dt_ordenacao_anterior: string | null;
  dt_ordenacao_atual: string | null;
  src_anterior: string | null;
  src_atual: string | null;
  is_latest?: boolean;
  is_latest_empresa?: boolean;
}

// Helper functions
const fmtMoney = (v: number | string | null): string => {
  if (v === null || v === '' || v === undefined) return '-';
  const num = typeof v === 'string' ? parseFloat(v) : v;
  if (isNaN(num)) return '-';
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const fmtDate = (v: string | null): string => {
  if (!v) return '-';
  const date = new Date(v);
  if (isNaN(date.getTime())) return v;
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const fmtPct = (v: number | null): string => {
  if (v === null || v === undefined) return '-';
  return `${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
};

export default function AlteracoesFee() {
  const [isLoading, setIsLoading] = useState(true);
  const [changes, setChanges] = useState<FeeChange[]>([]);
  const [latestMarked, setLatestMarked] = useState<FeeChange[]>([]);
  const [empresas, setEmpresas] = useState<string[]>([]);
  
  // Filters
  const [empresaFilter, setEmpresaFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  const fetchChanges = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: { action: 'get_fee_changes' }
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Erro ao carregar dados');

      const changesData: FeeChange[] = data.changes || [];
      setChanges(changesData);
      setLatestMarked(data.latestMarked || []);
      
      // Extract unique empresas
      const uniqueEmpresas = [...new Set(changesData.map(c => c.empresa).filter(Boolean))].sort();
      setEmpresas(uniqueEmpresas);

      toast.success(`${changesData.length} alterações carregadas`);
    } catch (error: any) {
      console.error('Error fetching fee changes:', error);
      toast.error('Erro ao carregar alterações: ' + (error.message || 'Erro desconhecido'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchChanges();
  }, []);

  // Filtered and paginated data
  const filteredChanges = useMemo(() => {
    let result = changes;
    
    if (empresaFilter && empresaFilter !== "all") {
      result = result.filter(c => c.empresa?.toLowerCase() === empresaFilter.toLowerCase());
    }
    
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter(c => 
        Object.values(c).some(val => 
          String(val ?? '').toLowerCase().includes(q)
        )
      );
    }
    
    return result;
  }, [changes, empresaFilter, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredChanges.length / pageSize));
  const paginatedChanges = filteredChanges.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [empresaFilter, searchTerm]);

  const clearFilters = () => {
    setEmpresaFilter("all");
    setSearchTerm("");
    setCurrentPage(1);
  };

  const rightContent = (
    <Button
      onClick={fetchChanges}
      disabled={isLoading}
      variant="outline"
      className="h-8 rounded-full text-xs"
    >
      <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
      Atualizar
    </Button>
  );

  return (
    <PageLayout 
      title="DACHSER" 
      subtitle="Alterações de Fee – Histórico consolidado"
      rightContent={rightContent}
      backTo="/sea/local-charges"
    >
      <PageCard>
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-widest text-foreground">
              Resumo de Alterações
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Histórico consolidado por empresa, charge, container e currency.
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-[0.68rem] border-border/50 bg-white/5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary mr-1.5" />
              Empresa
            </Badge>
            <Select value={empresaFilter} onValueChange={setEmpresaFilter}>
              <SelectTrigger className="h-8 w-[150px] text-xs rounded-full bg-[#13141a] border-border/50">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {empresas.map(emp => (
                  <SelectItem key={emp} value={emp.toLowerCase()}>{emp}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por qualquer coluna"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-8 w-[200px] text-xs rounded-full bg-[#13141a] border-border/50"
              />
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={clearFilters}
              className="h-8 rounded-full text-xs"
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              Limpar
            </Button>
          </div>
        </div>

        {/* Latest changes highlight */}
        {latestMarked.length > 0 && (
          <div className="mb-4 p-3 rounded-xl bg-white/[0.02] border border-border/30">
            <div className="flex items-center gap-2 mb-2">
              <Badge className="bg-primary text-primary-foreground text-[0.65rem]">
                Mais recentes
              </Badge>
              <span className="text-xs text-muted-foreground">
                Última alteração global e última por empresa.
              </span>
            </div>
            <div className="space-y-1">
              {latestMarked.slice(0, 5).map((item, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold">{item.empresa}</span>
                  <span className="text-muted-foreground">—</span>
                  <span>{item.charge_description}</span>
                  {item.charge_code && (
                    <Badge variant="outline" className="text-[0.65rem] px-2 py-0">
                      {item.charge_code.toUpperCase()}
                    </Badge>
                  )}
                  {item.dt_ordenacao_atual && (
                    <span className="text-xs text-muted-foreground">
                      {fmtDate(item.dt_ordenacao_atual)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Table */}
        <div className="border border-border/30 rounded-xl overflow-hidden">
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#15151f] hover:bg-[#15151f]">
                  <TableHead className="text-[0.7rem] uppercase tracking-wider whitespace-nowrap">Empresa</TableHead>
                  <TableHead className="text-[0.7rem] uppercase tracking-wider">Charge Description</TableHead>
                  <TableHead className="text-[0.7rem] uppercase tracking-wider whitespace-nowrap">Code</TableHead>
                  <TableHead className="text-[0.7rem] uppercase tracking-wider whitespace-nowrap">Container</TableHead>
                  <TableHead className="text-[0.7rem] uppercase tracking-wider whitespace-nowrap">Currency</TableHead>
                  <TableHead className="text-[0.7rem] uppercase tracking-wider text-right whitespace-nowrap">Fee Anterior</TableHead>
                  <TableHead className="text-[0.7rem] uppercase tracking-wider text-right whitespace-nowrap">Fee Atual</TableHead>
                  <TableHead className="text-[0.7rem] uppercase tracking-wider text-right whitespace-nowrap">Δ (Abs)</TableHead>
                  <TableHead className="text-[0.7rem] uppercase tracking-wider text-right whitespace-nowrap">Δ (%)</TableHead>
                  <TableHead className="text-[0.7rem] uppercase tracking-wider whitespace-nowrap">Effective Anterior</TableHead>
                  <TableHead className="text-[0.7rem] uppercase tracking-wider whitespace-nowrap">Effective Atual</TableHead>
                  <TableHead className="text-[0.7rem] uppercase tracking-wider whitespace-nowrap">dt_chave Anterior</TableHead>
                  <TableHead className="text-[0.7rem] uppercase tracking-wider whitespace-nowrap">dt_chave Atual</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={13} className="text-center py-8 text-muted-foreground">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Carregando...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : paginatedChanges.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={13} className="text-center py-8 text-muted-foreground">
                      Nenhuma alteração de fee encontrada
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedChanges.map((row, idx) => {
                    const isPositive = (row.diff_abs ?? 0) >= 0;
                    const isLatest = row.is_latest || row.is_latest_empresa;
                    
                    return (
                      <TableRow 
                        key={idx} 
                        className={`text-sm hover:bg-white/5 ${isLatest ? 'border-l-2 border-l-primary bg-white/[0.03]' : ''}`}
                      >
                        <TableCell className="whitespace-nowrap font-medium">{row.empresa || '-'}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {row.charge_description || '-'}
                            {isLatest && (
                              <Badge className="bg-primary text-primary-foreground text-[0.6rem] px-1.5 py-0">
                                Mais recente
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{row.charge_code || '-'}</TableCell>
                        <TableCell className="whitespace-nowrap">{row.container_type || '-'}</TableCell>
                        <TableCell className="whitespace-nowrap">{row.currency || '-'}</TableCell>
                        <TableCell className="text-right font-mono whitespace-nowrap">{fmtMoney(row.fee_anterior)}</TableCell>
                        <TableCell className="text-right font-mono whitespace-nowrap">{fmtMoney(row.fee_atual)}</TableCell>
                        <TableCell className={`text-right font-mono whitespace-nowrap ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                          <div className="flex items-center justify-end gap-1">
                            {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            {fmtMoney(row.diff_abs)}
                          </div>
                        </TableCell>
                        <TableCell className={`text-right font-mono whitespace-nowrap ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                          {fmtPct(row.diff_pct)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{row.effective_anterior || '-'}</TableCell>
                        <TableCell className="whitespace-nowrap">{row.effective_atual || '-'}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{row.dt_chave_anterior || '-'}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{row.dt_chave_atual || '-'}</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>

        {/* Pagination */}
        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          showFirstLast={true}
        />
      </PageCard>
    </PageLayout>
  );
}
