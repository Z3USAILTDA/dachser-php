import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { RefreshCw, Search, Download, Calendar, DollarSign, CreditCard, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { TablePagination } from "@/components/layout/TablePagination";

interface BaixaRecord {
  IdLancamentoRM: number;
  IdBaixa: number;
  tipo_pag_rec: string;
  nd: string;
  documento: string;
  nome_beneficiario: string;
  nome_cobranca: string;
  numero_processo: string;
  forma_pag: string;
  data_vencimento: string;
  valor_nf: number;
  moeda: string;
  data_baixa: string;
  valor_baixa: number;
  usuario_baixa: string;
  status_lan: string;
}

export const HistoricoBaixasTab = () => {
  const [baixas, setBaixas] = useState<BaixaRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterFormaPag, setFilterFormaPag] = useState("all");
  const [filterPeriodo, setFilterPeriodo] = useState<"all" | "hoje" | "7dias" | "30dias" | "90dias">("30dias");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  const { toast } = useToast();

  const loadBaixas = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { action: "get_historico_baixas", periodo: filterPeriodo }
      });

      if (error) throw error;
      setBaixas(data?.data || []);
    } catch (err) {
      console.error("Erro ao carregar histórico de baixas:", err);
      toast({
        title: "Erro",
        description: "Falha ao carregar histórico de baixas",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBaixas();
  }, [filterPeriodo]);

  const filteredBaixas = useMemo(() => {
    return baixas.filter(b => {
      // Filtrar valores zerados
      const valor = b.valor_baixa || b.valor_nf || 0;
      if (valor === 0) return false;
      
      // Filtrar registros com moeda "null" ou inválida
      if (!b.moeda || b.moeda.toLowerCase() === "null") return false;
      
      // Filtrar registros com valores que começam com "null"
      if (b.nd?.toLowerCase().startsWith("null")) return false;
      if (b.nome_beneficiario?.toLowerCase().startsWith("null")) return false;
      if (b.numero_processo?.toLowerCase().startsWith("null")) return false;
      
      const matchesSearch = searchTerm === "" || 
        b.nd?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.documento?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.nome_beneficiario?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.numero_processo?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesFormaPag = filterFormaPag === "all" || b.forma_pag === filterFormaPag;
      
      return matchesSearch && matchesFormaPag;
    });
  }, [baixas, searchTerm, filterFormaPag]);

  const totalPages = Math.ceil(filteredBaixas.length / itemsPerPage);
  
  const paginatedBaixas = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredBaixas.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredBaixas, currentPage, itemsPerPage]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterFormaPag, filterPeriodo]);

  const totalValor = useMemo(() => {
    return filteredBaixas.reduce((acc, b) => acc + (b.valor_baixa || b.valor_nf || 0), 0);
  }, [filteredBaixas]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    try {
      const date = parseISO(dateStr);
      return format(date, "dd/MM/yyyy", { locale: ptBR });
    } catch {
      return dateStr;
    }
  };

  const formatCurrency = (value: number | null, moeda: string = "BRL") => {
    if (value == null) return "-";
    const currencyMap: Record<string, string> = {
      BRL: "R$",
      USD: "US$",
      EUR: "€"
    };
    const symbol = currencyMap[moeda] || moeda;
    return `${symbol} ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
  };

  const formasPagamento = useMemo(() => {
    const formas = new Set(baixas.map(b => b.forma_pag).filter(Boolean));
    return Array.from(formas).sort();
  }, [baixas]);

  const exportToExcel = () => {
    toast({
      title: "Em desenvolvimento",
      description: "Exportação para Excel será implementada em breve"
    });
  };

  return (
    <div className="space-y-4">
      {/* Header com KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl bg-[#0a0b10] border border-white/10">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
            Total Baixas
          </div>
          <div className="text-xl font-bold mt-1 text-green-400">{filteredBaixas.length}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">No período selecionado</div>
        </div>
        <div className="p-3 rounded-xl bg-[#0a0b10] border border-white/10">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            <DollarSign className="h-3.5 w-3.5 text-primary" />
            Valor Total
          </div>
          <div className="text-xl font-bold mt-1">
            {formatCurrency(totalValor, "BRL")}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Soma dos valores baixados</div>
        </div>
        <div className="p-3 rounded-xl bg-[#0a0b10] border border-white/10">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            <CreditCard className="h-3.5 w-3.5 text-blue-400" />
            Formas Pagamento
          </div>
          <div className="text-xl font-bold mt-1">{formasPagamento.length}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Tipos utilizados</div>
        </div>
        <div className="p-3 rounded-xl bg-[#0a0b10] border border-white/10">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            <Calendar className="h-3.5 w-3.5 text-amber-400" />
            Média por Baixa
          </div>
          <div className="text-xl font-bold mt-1">
            {filteredBaixas.length > 0 ? formatCurrency(totalValor / filteredBaixas.length, "BRL") : "-"}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Valor médio</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por ND, documento, beneficiário, processo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 bg-[#0a0b10] border-white/10 rounded-full"
          />
        </div>

        <Select value={filterPeriodo} onValueChange={(v: typeof filterPeriodo) => setFilterPeriodo(v)}>
          <SelectTrigger className="w-[140px] bg-[#0a0b10] border-white/10 rounded-full">
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hoje">Hoje</SelectItem>
            <SelectItem value="7dias">Últimos 7 dias</SelectItem>
            <SelectItem value="30dias">Últimos 30 dias</SelectItem>
            <SelectItem value="90dias">Últimos 90 dias</SelectItem>
            <SelectItem value="all">Todo período</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterFormaPag} onValueChange={setFilterFormaPag}>
          <SelectTrigger className="w-[150px] bg-[#0a0b10] border-white/10 rounded-full">
            <SelectValue placeholder="Forma Pagamento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas Formas</SelectItem>
            {formasPagamento.map(fp => (
              <SelectItem key={fp} value={fp}>{fp}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="sm"
          onClick={loadBaixas}
          disabled={loading}
          className="rounded-full border-white/10"
        >
          <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
          Atualizar
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={exportToExcel}
          className="rounded-full border-white/10"
        >
          <Download className="h-4 w-4 mr-2" />
          Exportar
        </Button>
      </div>

      {/* Tabela */}
      <div className="rounded-xl bg-[#05060c] border border-white/10 overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full bg-white/5" />
            ))}
          </div>
        ) : filteredBaixas.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-white/10" />
            <p className="text-sm">Nenhuma baixa encontrada no período selecionado</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="text-muted-foreground text-xs">ND</TableHead>
                <TableHead className="text-muted-foreground text-xs">Beneficiário</TableHead>
                <TableHead className="text-muted-foreground text-xs">Processo</TableHead>
                <TableHead className="text-muted-foreground text-xs text-right">Valor</TableHead>
                <TableHead className="text-muted-foreground text-xs">Vencimento</TableHead>
                <TableHead className="text-muted-foreground text-xs">Data Baixa</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedBaixas.map((baixa, index) => (
                <TableRow key={`${baixa.IdLancamentoRM}-${index}`} className="border-white/5 hover:bg-white/5">
                  <TableCell className="font-mono text-xs">{baixa.nd || "-"}</TableCell>
                  <TableCell className="max-w-[200px] truncate text-xs" title={baixa.nome_beneficiario}>
                    {baixa.nome_beneficiario || "-"}
                  </TableCell>
                  <TableCell className="text-xs">{baixa.numero_processo || "-"}</TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {formatCurrency(baixa.valor_baixa || baixa.valor_nf, baixa.moeda)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(baixa.data_vencimento)}
                  </TableCell>
                  <TableCell className="text-xs">
                    <span className="text-green-400">{formatDate(baixa.data_baixa)}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Paginação */}
      {!loading && filteredBaixas.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            Exibindo {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, filteredBaixas.length)} de {filteredBaixas.length} baixas
          </div>
          <TablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </div>
      )}
    </div>
  );
};
