import { ContainerInfo } from "@/types/draft";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Package } from "lucide-react";
import { useState } from "react";

interface ContainersTableProps {
  containers: ContainerInfo[];
}

const ITEMS_PER_PAGE = 5;

export const ContainersTable = ({ containers }: ContainersTableProps) => {
  const [currentPage, setCurrentPage] = useState(1);
  
  const totalPages = Math.ceil(containers.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedContainers = containers.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const getTypeColor = (type: string) => {
    if (type?.includes('45')) return 'text-[#ffc800]';
    if (type?.includes('40')) return 'text-blue-400';
    if (type?.includes('20')) return 'text-emerald-400';
    return 'text-[#888]';
  };

  const getTypeDot = (type: string) => {
    if (type?.includes('45')) return 'bg-[#ffc800]';
    if (type?.includes('40')) return 'bg-blue-400';
    if (type?.includes('20')) return 'bg-emerald-400';
    return 'bg-[#888]';
  };

  return (
    <div 
      className="rounded-2xl overflow-hidden backdrop-blur-[18px]"
      style={{
        background: 'rgba(5,6,18,0.9)',
        border: '1px solid rgba(255,255,255,0.12)',
        boxShadow: '0 18px 40px rgba(0,0,0,0.85)'
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-4 border-b border-[rgba(255,255,255,0.08)]">
        <Package className="h-5 w-5 text-[#ffc800]" />
        <span className="text-[0.85rem] font-medium text-white">Containers ({containers.length})</span>
      </div>

      <Table>
        <TableHeader>
          <TableRow className="border-[rgba(255,255,255,0.06)] hover:bg-transparent">
            <TableHead className="text-[#888] text-[0.7rem] uppercase tracking-wider font-medium px-5 py-3">TYPE</TableHead>
            <TableHead className="text-[#888] text-[0.7rem] uppercase tracking-wider font-medium">CONTAINER NO.</TableHead>
            <TableHead className="text-[#888] text-[0.7rem] uppercase tracking-wider font-medium">STATUS</TableHead>
            <TableHead className="text-[#888] text-[0.7rem] uppercase tracking-wider font-medium">DATE</TableHead>
            <TableHead className="text-[#888] text-[0.7rem] uppercase tracking-wider font-medium">PLACE OF ACTIVITY</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedContainers.map((container, index) => (
            <TableRow 
              key={index} 
              className="border-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.03)] transition-colors"
            >
              <TableCell className="px-5 py-3.5">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${getTypeDot(container.type)}`} />
                  <span className={`font-medium text-[0.85rem] ${getTypeColor(container.type)}`}>
                    {container.type || '-'}
                  </span>
                </div>
              </TableCell>
              <TableCell className="font-mono text-[#ffc800] text-[0.85rem]">
                {container.containerNo || '-'}
              </TableCell>
              <TableCell className="text-white text-[0.85rem]">
                {container.status || '-'}
              </TableCell>
              <TableCell className="text-white/80 text-[0.85rem]">
                {container.date || '-'}
              </TableCell>
              <TableCell className="text-white/80 text-[0.85rem]">
                {container.placeOfActivity || '-'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Pagination - Dachser Style */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-[rgba(255,255,255,0.08)]">
          <span className="text-[0.75rem] text-[#888]">
            Página {currentPage} de {totalPages} | Total: {containers.length} registros
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="h-8 px-3 rounded-full text-[0.75rem] text-[#888] hover:text-white hover:bg-[rgba(255,255,255,0.05)] disabled:opacity-40"
            >
              Anterior
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="h-8 px-3 rounded-full text-[0.75rem] text-[#888] hover:text-white hover:bg-[rgba(255,255,255,0.05)] disabled:opacity-40"
            >
              Próxima
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
