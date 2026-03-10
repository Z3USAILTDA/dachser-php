import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge, SLAInfoBadge } from "./StatusBadge";
import { LeadComexStatusBadge } from "./LeadComexStatusBadge";
import { TablePagination } from "@/components/layout/TablePagination";
import { Search, Eye, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { parseDBDate } from "@/utils/timezone";
import type { ProcessoCCT } from "@/types/cct";

export type MetricFilterType = "total" | "alerta" | "critico" | "eventos24h" | null;

const ITEMS_PER_PAGE = 15;

interface ProcessosTableProps {
  processos: ProcessoCCT[];
  onAssignAnalista?: (processo: ProcessoCCT) => void;
  metricFilter?: MetricFilterType;
}

export function ProcessosTable({ processos, onAssignAnalista, metricFilter }: ProcessosTableProps) {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const filteredProcessos = useMemo(() => {
    let filtered = processos;

    // Apply metric filter
    if (metricFilter === "alerta") {
      filtered = filtered.filter(p => p.status_atual?.sla_status === "ALERTA");
    } else if (metricFilter === "critico") {
      // CRITICO inclui tanto CRITICO quanto VENCIDO
      filtered = filtered.filter(p => 
        p.status_atual?.sla_status === "CRITICO" || p.status_atual?.sla_status === "VENCIDO"
      );
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

    // Sort: processos com status AGUARDANDO ficam por último
    filtered = [...filtered].sort((a, b) => {
      const statusA = a.status_atual?.status_cct_oficial || '';
      const statusB = b.status_atual?.status_cct_oficial || '';
      const isAguardandoA = statusA.startsWith('AGUARDANDO');
      const isAguardandoB = statusB.startsWith('AGUARDANDO');
      
      if (isAguardandoA && !isAguardandoB) return 1;
      if (!isAguardandoA && isAguardandoB) return -1;
      return 0;
    });

    return filtered;
  }, [processos, searchTerm, metricFilter]);

  // Reset to page 1 when filters change
  useMemo(() => {
    setCurrentPage(1);
  }, [searchTerm, metricFilter]);

  const totalPages = Math.ceil(filteredProcessos.length / ITEMS_PER_PAGE);
  const paginatedProcessos = filteredProcessos.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return "-";
    const parsed = parseDBDate(dateStr);
    if (!parsed) return "-";
    return format(parsed, "dd/MM HH:mm", { locale: ptBR });
  };

  if (processos.length === 0) {
    return (
      <div className="rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] backdrop-blur-[18px] shadow-[0_18px_40px_rgba(0,0,0,0.85)] p-10 text-center">
        <AlertTriangle className="h-10 w-10 text-[#666] mx-auto mb-4" />
        <p className="text-[#aaaaaa]">Nenhum processo encontrado.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] backdrop-blur-[18px] shadow-[0_18px_40px_rgba(0,0,0,0.85)] overflow-hidden">
      {/* Search Header */}
      <div className="p-4 border-b border-[rgba(255,255,255,0.08)] flex items-center justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#666]" />
          <input
            type="text"
            placeholder="Buscar em todas as colunas..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-[rgba(0,0,0,0.5)] border border-[rgba(255,255,255,0.1)] text-white placeholder:text-[#666] text-[0.85rem] focus:outline-none focus:border-[#ffc800]/50"
          />
        </div>
        <span className="text-[0.8rem] text-[#aaaaaa] ml-4">
          {filteredProcessos.length} de {processos.length} processos
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-[rgba(255,255,255,0.08)]">
              <TableHead className="text-[#888] text-[0.75rem] uppercase tracking-wider font-medium">Cliente</TableHead>
              <TableHead className="text-[#888] text-[0.75rem] uppercase tracking-wider font-medium">House</TableHead>
              <TableHead className="text-[#888] text-[0.75rem] uppercase tracking-wider font-medium">Master</TableHead>
              <TableHead className="text-[#888] text-[0.75rem] uppercase tracking-wider font-medium">Rota</TableHead>
              <TableHead className="text-[#888] text-[0.75rem] uppercase tracking-wider font-medium">Manifestação</TableHead>
              <TableHead className="text-[#888] text-[0.75rem] uppercase tracking-wider font-medium">Status</TableHead>
              <TableHead className="text-[#888] text-[0.75rem] uppercase tracking-wider font-medium">SLA</TableHead>
              <TableHead className="text-[#888] text-[0.75rem] uppercase tracking-wider font-medium">Analista</TableHead>
              <TableHead className="text-[#888] text-[0.75rem] uppercase tracking-wider font-medium">Atualização</TableHead>
              <TableHead className="text-[#888] text-[0.75rem] uppercase tracking-wider font-medium text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedProcessos.map((processo, index) => {
              // Format tratamentos for display
              const tratamentosDisplay = Array.isArray(processo.shipment.tratamentos_especiais) 
                ? processo.shipment.tratamentos_especiais.join(", ") 
                : processo.shipment.tratamentos_especiais;

              return (
                <TableRow 
                  key={`${processo.shipment.id}-${processo.shipment.master}-${index}`}
                  className={`border-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.03)] ${index % 2 === 0 ? "bg-[rgba(255,255,255,0.02)]" : ""}`}
                >
                  <TableCell>
                    <span className="text-white text-[0.85rem] max-w-[150px] truncate block">{processo.shipment.cliente}</span>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-[#ffc800] text-[0.85rem]">{processo.shipment.house}</span>
                  </TableCell>
                  <TableCell className="text-[#aaaaaa] text-[0.85rem] font-mono">
                    {processo.shipment.master}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded bg-[rgba(255,255,255,0.1)] text-white text-[0.75rem] font-medium">
                        {processo.shipment.aeroporto_origem}
                      </span>
                      <span className="text-[#666]">→</span>
                      <span className="px-2 py-0.5 rounded bg-[rgba(255,255,255,0.1)] text-white text-[0.75rem] font-medium">
                        {processo.shipment.aeroporto_destino}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {(() => {
                      // Use the consolidated status_cct_oficial from backend (already merges tracking + LeadComex + RFB)
                      const effectiveManifestacao = processo.status_atual?.status_cct_oficial || 'INFORMADA';
                      
                      const manifestacaoDots: Record<string, { label: string; bgColor: string }> = {
                        'INFORMADA': { label: 'Informada', bgColor: 'bg-cyan-500' },
                        'MANIFESTADA': { label: 'Manifestada', bgColor: 'bg-primary' },
                        'EM_AREA_TRANSFERENCIA': { label: 'Em área de Transferência', bgColor: 'bg-blue-500' },
                        'RECEPCIONADA': { label: 'Recepcionada', bgColor: 'bg-indigo-500' },
                        'EM_TROCA_RECINTOS': { label: 'Em Troca entre Recintos', bgColor: 'bg-orange-500' },
                        'EM_TRANSITO_TERRESTRE': { label: 'Em Trânsito Terrestre', bgColor: 'bg-amber-500' },
                        'ENTREGUE': { label: 'Entregue', bgColor: 'bg-emerald-500' },
                        'BLOQUEIO': { label: 'Bloqueio', bgColor: 'bg-destructive' },
                      };
                      const isAguardando = !effectiveManifestacao || 
                        effectiveManifestacao === 'AGUARDANDO_CONSULTA' || 
                        effectiveManifestacao === 'AGUARDANDO_MANIFESTACAO';
                      const dotKey = isAguardando ? 'INFORMADA' : effectiveManifestacao;
                      const { label, bgColor } = manifestacaoDots[dotKey] || manifestacaoDots['INFORMADA'];
                      return (
                        <div className="flex justify-center">
                          <span 
                            className={`w-3 h-3 rounded-full ${bgColor}`} 
                            title={label}
                          />
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const statusOficial = String(processo.status_atual?.status_cct_oficial || '');
                      const isAguardando = !statusOficial || 
                        statusOficial === 'AGUARDANDO_CONSULTA' || 
                        statusOficial === 'AGUARDANDO_MANIFESTACAO';

                      if (isAguardando) {
                        return (
                          <LeadComexStatusBadge 
                            status={processo.shipment.leadcomex_status || 'pending'} 
                            attempts={processo.shipment.leadcomex_attempts}
                          />
                        );
                      }
                      return <StatusBadge status={statusOficial} />;
                    })()}
                  </TableCell>
                  <TableCell>
                    <SLAInfoBadge 
                      slaInfo={(processo.status_atual as any)?.sla_info || { 
                        status: processo.status_atual?.sla_status || 'OK', 
                        horasRestantes: null,
                        tipoVoo: processo.status_atual?.tipo_voo || null,
                      }} 
                      showTipoVoo={true}
                    />
                  </TableCell>
                  <TableCell className="text-[#aaaaaa] text-[0.85rem]">
                    <div className="flex items-center gap-1.5 max-w-[120px] truncate">
                      <span>{processo.shipment.analista?.nome || processo.shipment.nome_analista_legado || "-"}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-[#888] text-[0.8rem]">
                    {formatDate(processo.status_atual?.updated_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <button
                      onClick={() => navigate(`/air/cct/processo/${processo.shipment.id}`)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[rgba(255,255,255,0.15)] text-[#aaaaaa] hover:text-[#ffc800] hover:border-[#ffc800]/40 transition text-[0.75rem]"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Ver
                    </button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="p-4 border-t border-[rgba(255,255,255,0.08)]">
        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
      </div>

      {/* Empty state for filtered results */}
      {filteredProcessos.length === 0 && processos.length > 0 && (
        <div className="p-10 text-center">
          <p className="text-[#aaaaaa]">Nenhum resultado para a busca "{searchTerm}"</p>
        </div>
      )}
    </div>
  );
}
