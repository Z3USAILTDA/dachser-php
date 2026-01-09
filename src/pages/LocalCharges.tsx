import { useState, useEffect, useMemo } from "react";
import { Search, RefreshCw, TrendingUp, Receipt, Filter } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useUsageLog } from "@/hooks/useUsageLog";
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
interface LocalChargeRow {
  id?: number;
  empresa: string;
  charge_description: string;
  charge_code: string;
  container_type: string;
  currency: string;
  fee: number | string;
  unit_of_measure: string;
  effective_date: string;
  expiry_date: string;
  effective: string;
  data_atualizacao: string;
  user_atualizacao: string;
}

interface CompanyData {
  rows: LocalChargeRow[];
  meta: { updated_at: string | null; effective: string | null };
  source: string;
}

type SortDirection = 'asc' | 'desc' | null;

// Helper functions
const fmtDate = (v: string | null): string => {
  if (!v) return '-';
  const date = new Date(v);
  if (isNaN(date.getTime())) return v;
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const fmtDateOnly = (v: string | null): string => {
  if (!v) return '-';
  const date = new Date(v);
  if (isNaN(date.getTime())) return v;
  return date.toLocaleDateString('pt-BR');
};

const fmtMoney = (v: number | string | null): string => {
  if (v === null || v === '') return '-';
  const num = typeof v === 'string' ? parseFloat(v) : v;
  if (isNaN(num)) return '-';
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Armador colors for badges
const armadorColors: Record<string, string> = {
  'HAPAG-LLOYD': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  'MSC': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'CMA': 'bg-red-500/20 text-red-400 border-red-500/30',
  'HMM': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'ONE': 'bg-pink-500/20 text-pink-400 border-pink-500/30',
};

// Main Component
export default function LocalCharges() {
  useUsageLog({ endpoint: "/sea/local-charges" });
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [armadorFilter, setArmadorFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const pageSize = 15;
  
  const [hapagData, setHapagData] = useState<CompanyData>({ rows: [], meta: { updated_at: null, effective: null }, source: '' });
  const [mscData, setMscData] = useState<CompanyData>({ rows: [], meta: { updated_at: null, effective: null }, source: '' });
  const [cmaData, setCmaData] = useState<CompanyData>({ rows: [], meta: { updated_at: null, effective: null }, source: '' });
  const [hmmData, setHmmData] = useState<CompanyData>({ rows: [], meta: { updated_at: null, effective: null }, source: '' });
  const [oneData, setOneData] = useState<CompanyData>({ rows: [], meta: { updated_at: null, effective: null }, source: '' });

  // Combine all data into a single array with armador field
  const allData = useMemo(() => {
    return [
      ...hapagData.rows.map(r => ({ ...r, empresa: 'HAPAG-LLOYD' })),
      ...mscData.rows.map(r => ({ ...r, empresa: 'MSC' })),
      ...cmaData.rows.map(r => ({ ...r, empresa: 'CMA' })),
      ...hmmData.rows.map(r => ({ ...r, empresa: 'HMM' })),
      ...oneData.rows.map(r => ({ ...r, empresa: 'ONE' })),
    ];
  }, [hapagData, mscData, cmaData, hmmData, oneData]);

  // Stats by armador
  const statsByArmador = useMemo(() => {
    const stats: Record<string, number> = {
      'HAPAG-LLOYD': hapagData.rows.length,
      'MSC': mscData.rows.length,
      'CMA': cmaData.rows.length,
      'HMM': hmmData.rows.length,
      'ONE': oneData.rows.length,
    };
    return stats;
  }, [hapagData, mscData, cmaData, hmmData, oneData]);

  // Filter data
  const filteredRows = useMemo(() => {
    let filtered = allData;
    
    // Filter by armador
    if (armadorFilter !== "all") {
      filtered = filtered.filter(r => r.empresa === armadorFilter);
    }
    
    // Filter by search term
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      filtered = filtered.filter(row => 
        Object.values(row).some(val => 
          String(val).toLowerCase().includes(q)
        )
      );
    }
    
    return filtered;
  }, [allData, armadorFilter, searchTerm]);

  // Sort data
  const sortedRows = useMemo(() => {
    if (!sortColumn || !sortDirection) return filteredRows;
    
    return [...filteredRows].sort((a, b) => {
      const aVal = a[sortColumn as keyof LocalChargeRow] ?? '';
      const bVal = b[sortColumn as keyof LocalChargeRow] ?? '';
      
      const aNum = typeof aVal === 'number' ? aVal : parseFloat(String(aVal).replace(/\./g, '').replace(',', '.'));
      const bNum = typeof bVal === 'number' ? bVal : parseFloat(String(bVal).replace(/\./g, '').replace(',', '.'));
      
      if (!isNaN(aNum) && !isNaN(bNum)) {
        return sortDirection === 'asc' ? aNum - bNum : bNum - aNum;
      }
      
      const comparison = String(aVal).localeCompare(String(bVal));
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredRows, sortColumn, sortDirection]);

  // Paginate
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const paginatedRows = sortedRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, armadorFilter]);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : prev === 'desc' ? null : 'asc');
      if (sortDirection === 'desc') setSortColumn(null);
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const fetchLocalCharges = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: { action: 'get_local_charges' }
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Erro ao carregar dados');

      if (data.hapag) setHapagData(data.hapag);
      if (data.msc) setMscData(data.msc);
      if (data.cma) setCmaData(data.cma);
      if (data.hmm) setHmmData(data.hmm);
      if (data.one) setOneData(data.one);

      toast.success('Dados carregados com sucesso');
    } catch (error: any) {
      console.error('Error fetching local charges:', error);
      toast.error('Erro ao carregar local charges: ' + (error.message || 'Erro desconhecido'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLocalCharges();
  }, []);

  const rightContent = (
    <div className="flex items-center gap-2">
      <Button
        onClick={() => navigate('/sea/alteracoes-fee')}
        className="h-8 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_20px_rgba(255,200,0,0.4)]"
      >
        <TrendingUp className="h-4 w-4 mr-2" />
        Alterações de Fee
      </Button>
      <Button
        onClick={fetchLocalCharges}
        disabled={isLoading}
        variant="outline"
        className="h-8 rounded-full text-xs"
      >
        <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
        Atualizar
      </Button>
    </div>
  );

  return (
    <PageLayout 
      title="DACHSER" 
      subtitle="Local Charges – Tabela Consolidada"
      rightContent={rightContent}
      pageIcon={Receipt}
      backTo="/dashboard"
    >
      <PageCard>
        {/* Header with filters */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-[0.72rem] border-border/50 bg-white/5 px-3 py-1">
              Total: <span className="font-bold ml-1">{allData.length}</span> registros
            </Badge>
            {Object.entries(statsByArmador).map(([armador, count]) => (
              count > 0 && (
                <Badge 
                  key={armador} 
                  variant="outline" 
                  className={`text-[0.68rem] cursor-pointer transition-all ${
                    armadorFilter === armador 
                      ? armadorColors[armador] + ' ring-1 ring-offset-1 ring-offset-background' 
                      : 'border-border/50 bg-white/5 hover:bg-white/10'
                  }`}
                  onClick={() => setArmadorFilter(armadorFilter === armador ? 'all' : armador)}
                >
                  {armador}: {count}
                </Badge>
              )
            ))}
          </div>
          
          <div className="flex items-center gap-3">
            {/* Armador Filter Dropdown */}
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={armadorFilter} onValueChange={setArmadorFilter}>
                <SelectTrigger className="w-[160px] h-9 text-sm rounded-full bg-[#13141a] border-border/50">
                  <SelectValue placeholder="Filtrar Armador" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Armadores</SelectItem>
                  <SelectItem value="HAPAG-LLOYD">Hapag-Lloyd</SelectItem>
                  <SelectItem value="MSC">MSC</SelectItem>
                  <SelectItem value="CMA">CMA</SelectItem>
                  <SelectItem value="HMM">HMM</SelectItem>
                  <SelectItem value="ONE">ONE</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Search */}
            <div className="relative w-full lg:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por qualquer coluna..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9 text-sm rounded-full bg-[#13141a] border-border/50"
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="border border-border/30 rounded-xl overflow-hidden">
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#15151f] hover:bg-[#15151f]">
                  {[
                    { key: 'empresa', label: 'Armador' },
                    { key: 'charge_description', label: 'Charge Description' },
                    { key: 'charge_code', label: 'Charge Code' },
                    { key: 'container_type', label: 'Container Type' },
                    { key: 'currency', label: 'Currency' },
                    { key: 'fee', label: 'Fee', align: 'right' },
                    { key: 'unit_of_measure', label: 'Unit of Measure' },
                    { key: 'effective_date', label: 'Effective Date' },
                    { key: 'expiry_date', label: 'Expiry Date' },
                    { key: 'data_atualizacao', label: 'Data Atualização' },
                  ].map(col => (
                    <TableHead
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className={`text-[0.7rem] uppercase tracking-wider cursor-pointer hover:text-primary whitespace-nowrap ${
                        col.align === 'right' ? 'text-right' : ''
                      } ${sortColumn === col.key ? 'text-primary' : ''}`}
                    >
                      {col.label}
                      {sortColumn === col.key && (
                        <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Carregando...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : paginatedRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      Nenhum registro encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedRows.map((row, idx) => (
                    <TableRow key={row.id || idx} className="text-sm hover:bg-white/5">
                      <TableCell className="whitespace-nowrap">
                        <Badge 
                          variant="outline" 
                          className={`text-[0.68rem] ${armadorColors[row.empresa] || 'border-border/50'}`}
                        >
                          {row.empresa || '-'}
                        </Badge>
                      </TableCell>
                      <TableCell>{row.charge_description || '-'}</TableCell>
                      <TableCell>{row.charge_code || '-'}</TableCell>
                      <TableCell>{row.container_type || '-'}</TableCell>
                      <TableCell>{row.currency || '-'}</TableCell>
                      <TableCell className="text-right font-mono">{fmtMoney(row.fee)}</TableCell>
                      <TableCell>{row.unit_of_measure || '-'}</TableCell>
                      <TableCell className="whitespace-nowrap">{fmtDateOnly(row.effective_date)}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.expiry_date || '-'}</TableCell>
                      <TableCell className="whitespace-nowrap">{fmtDate(row.data_atualizacao)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between mt-4">
          <span className="text-[0.78rem] text-muted-foreground">
            Mostrando {paginatedRows.length} de {sortedRows.length} registros
            {armadorFilter !== 'all' && ` (filtrado por ${armadorFilter})`}
          </span>
          <TablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            showFirstLast={false}
          />
        </div>
      </PageCard>
    </PageLayout>
  );
}
