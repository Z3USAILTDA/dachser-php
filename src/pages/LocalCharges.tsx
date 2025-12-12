import { useState, useEffect, useMemo } from "react";
import { Search, RefreshCw } from "lucide-react";
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

// Company Table Component
interface CompanyTableProps {
  title: string;
  data: CompanyData;
  isLoading: boolean;
}

function CompanyTable({ title, data, isLoading }: CompanyTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const pageSize = 5;

  const filteredRows = useMemo(() => {
    if (!searchTerm) return data.rows;
    const q = searchTerm.toLowerCase();
    return data.rows.filter(row => 
      Object.values(row).some(val => 
        String(val).toLowerCase().includes(q)
      )
    );
  }, [data.rows, searchTerm]);

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

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const paginatedRows = sortedRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : prev === 'desc' ? null : 'asc');
      if (sortDirection === 'desc') setSortColumn(null);
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };


  return (
    <PageCard>
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-widest text-foreground">{title}</h3>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <Badge variant="outline" className="text-[0.68rem] border-border/50 bg-white/5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary mr-1.5" />
              Atualizado: {data.meta.updated_at ? fmtDate(data.meta.updated_at) : '-'}
            </Badge>
            <Badge variant="outline" className="text-[0.68rem] border-border/50 bg-white/5">
              Effective: {data.meta.effective || '-'}
            </Badge>
            <Badge variant="outline" className="text-[0.68rem] border-border/50 bg-white/5">
              Origem: {data.source || '-'}
            </Badge>
          </div>
        </div>
        <div className="relative w-full lg:w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por qualquer coluna"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-9 text-sm rounded-full bg-[#13141a] border-border/50"
          />
        </div>
      </div>

      {/* Table */}
      <div className="border border-border/30 rounded-xl overflow-hidden">
        <ScrollArea className="h-[280px]">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#15151f] hover:bg-[#15151f]">
                {[
                  { key: 'empresa', label: 'Empresa' },
                  { key: 'charge_description', label: 'Charge Description' },
                  { key: 'charge_code', label: 'Charge Code' },
                  { key: 'container_type', label: 'Container Type' },
                  { key: 'currency', label: 'Currency' },
                  { key: 'fee', label: 'Fee', align: 'right' },
                  { key: 'unit_of_measure', label: 'Unit of Measure' },
                  { key: 'effective_date', label: 'Effective Date' },
                  { key: 'expiry_date', label: 'Expiry Date' },
                  { key: 'effective', label: 'Effective (Header)' },
                  { key: 'user_atualizacao', label: 'User' },
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
                  <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Carregando...
                    </div>
                  </TableCell>
                </TableRow>
              ) : paginatedRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                    Nenhum registro encontrado
                  </TableCell>
                </TableRow>
              ) : (
                paginatedRows.map((row, idx) => (
                  <TableRow key={row.id || idx} className="text-sm hover:bg-white/5">
                    <TableCell className="whitespace-nowrap">{row.empresa || '-'}</TableCell>
                    <TableCell>{row.charge_description || '-'}</TableCell>
                    <TableCell>{row.charge_code || '-'}</TableCell>
                    <TableCell>{row.container_type || '-'}</TableCell>
                    <TableCell>{row.currency || '-'}</TableCell>
                    <TableCell className="text-right font-mono">{fmtMoney(row.fee)}</TableCell>
                    <TableCell>{row.unit_of_measure || '-'}</TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDateOnly(row.effective_date)}</TableCell>
                    <TableCell className="whitespace-nowrap">{row.expiry_date || '-'}</TableCell>
                    <TableCell>{row.effective || '-'}</TableCell>
                    <TableCell>{row.user_atualizacao || '-'}</TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDate(row.data_atualizacao)}</TableCell>
                  </TableRow>
                ))
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
        showFirstLast={false}
      />
    </PageCard>
  );
}

// Main Component
export default function LocalCharges() {
  const [isLoading, setIsLoading] = useState(true);
  
  const [hapagData, setHapagData] = useState<CompanyData>({ rows: [], meta: { updated_at: null, effective: null }, source: '' });
  const [mscData, setMscData] = useState<CompanyData>({ rows: [], meta: { updated_at: null, effective: null }, source: '' });
  const [cmaData, setCmaData] = useState<CompanyData>({ rows: [], meta: { updated_at: null, effective: null }, source: '' });
  const [hmmData, setHmmData] = useState<CompanyData>({ rows: [], meta: { updated_at: null, effective: null }, source: '' });
  const [oneData, setOneData] = useState<CompanyData>({ rows: [], meta: { updated_at: null, effective: null }, source: '' });

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
    <Button
      onClick={fetchLocalCharges}
      disabled={isLoading}
      className="h-8 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_20px_rgba(255,200,0,0.4)]"
    >
      <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
      Atualizar
    </Button>
  );

  return (
    <PageLayout 
      title="DACHSER" 
      subtitle="Local Charges – Tabelas consolidadas"
      rightContent={rightContent}
    >
      <CompanyTable title="HAPAG-LLOYD" data={hapagData} isLoading={isLoading} />
      <CompanyTable title="CMA" data={cmaData} isLoading={isLoading} />
      <CompanyTable title="HMM" data={hmmData} isLoading={isLoading} />
      <CompanyTable title="ONE" data={oneData} isLoading={isLoading} />
      <CompanyTable title="MSC" data={mscData} isLoading={isLoading} />
    </PageLayout>
  );
}
