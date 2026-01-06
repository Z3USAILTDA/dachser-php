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
import { ChevronLeft, ChevronRight } from "lucide-react";
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
    if (type?.includes('45')) return 'text-primary';
    if (type?.includes('40')) return 'text-blue-400';
    if (type?.includes('20')) return 'text-green-400';
    return 'text-muted-foreground';
  };

  return (
    <div className="bg-[hsl(var(--card))]/60 border border-border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            <TableHead className="text-muted-foreground text-xs font-medium uppercase tracking-wider">TYPE</TableHead>
            <TableHead className="text-muted-foreground text-xs font-medium uppercase tracking-wider">CONTAINER NO.</TableHead>
            <TableHead className="text-muted-foreground text-xs font-medium uppercase tracking-wider">STATUS</TableHead>
            <TableHead className="text-muted-foreground text-xs font-medium uppercase tracking-wider">DATE</TableHead>
            <TableHead className="text-muted-foreground text-xs font-medium uppercase tracking-wider">PLACE OF ACTIVITY</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedContainers.map((container, index) => (
            <TableRow key={index} className="border-border hover:bg-muted/30">
              <TableCell>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${container.type?.includes('45') ? 'bg-primary' : 'bg-blue-400'}`} />
                  <span className={`font-medium ${getTypeColor(container.type)}`}>
                    {container.type || '-'}
                  </span>
                </div>
              </TableCell>
              <TableCell className="font-mono text-foreground">
                {container.containerNo || '-'}
              </TableCell>
              <TableCell className="text-foreground">
                {container.status || '-'}
              </TableCell>
              <TableCell className="text-foreground">
                {container.date || '-'}
              </TableCell>
              <TableCell className="text-foreground">
                {container.placeOfActivity || '-'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <span className="text-sm text-muted-foreground">
            Página {currentPage} de {totalPages} | Total: {containers.length} registros
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="text-muted-foreground hover:text-foreground"
            >
              Anterior
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="text-muted-foreground hover:text-foreground"
            >
              Próxima
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
