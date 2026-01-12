import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Scale, Search, AlertTriangle } from "lucide-react";
import { DemurrageContainer } from "@/hooks/useDemurrageData";

interface SelectContainerForDisputeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  containers: DemurrageContainer[];
  onSelect: (container: DemurrageContainer) => void;
}

export function SelectContainerForDisputeDialog({ open, onOpenChange, containers, onSelect }: SelectContainerForDisputeDialogProps) {
  const [search, setSearch] = useState("");

  // Filter containers that don't already have a dispute open
  // Include containers with calculated cost, carrier cost, or excess days
  const availableContainers = useMemo(() => {
    return containers.filter(c => 
      !c.dispute_status && (
        c.expected_cost_usd > 0 ||      // Has calculated cost
        c.armador_cost_usd > 0 ||       // Has carrier invoice cost
        c.excedente_dias > 0            // Has excess days (potential demurrage)
      )
    );
  }, [containers]);

  const filteredContainers = useMemo(() => {
    if (!search) return availableContainers;
    const lowerSearch = search.toLowerCase();
    return availableContainers.filter(c =>
      c.numero.toLowerCase().includes(lowerSearch) ||
      c.mbl?.toLowerCase().includes(lowerSearch) ||
      c.cliente?.toLowerCase().includes(lowerSearch) ||
      c.armador?.toLowerCase().includes(lowerSearch)
    );
  }, [availableContainers, search]);

  const formatCurrency = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(value);

  const handleSelect = (container: DemurrageContainer) => {
    onSelect(container);
    onOpenChange(false);
    setSearch("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[rgba(5,6,18,0.95)] border-[rgba(255,255,255,0.1)] max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Scale className="h-5 w-5 text-[#ffc800]" />
            Selecionar Container para Disputa
          </DialogTitle>
          <DialogDescription>
            Selecione um container para abrir uma nova disputa
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por container, MBL, cliente ou armador..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-[rgba(255,255,255,0.05)] border-[rgba(255,255,255,0.1)]"
            />
          </div>

          {filteredContainers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <AlertTriangle className="h-12 w-12 mb-4 opacity-50" />
              <p>Nenhum container disponível para disputa</p>
              <p className="text-sm">Containers já em disputa não aparecem aqui</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow className="border-[rgba(255,255,255,0.1)]">
                    <TableHead>Container</TableHead>
                    <TableHead>MBL</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Armador</TableHead>
                    <TableHead className="text-right">Custo Esperado</TableHead>
                    <TableHead className="text-right">Custo Armador</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredContainers.map((container) => (
                    <TableRow key={container.id} className="border-[rgba(255,255,255,0.1)] cursor-pointer hover:bg-[rgba(255,255,255,0.05)]">
                      <TableCell className="font-mono">{container.numero}</TableCell>
                      <TableCell className="font-mono text-sm">{container.mbl || '-'}</TableCell>
                      <TableCell>{container.cliente || '-'}</TableCell>
                      <TableCell>{container.armador || '-'}</TableCell>
                      <TableCell className="text-right">{formatCurrency(container.expected_cost_usd)}</TableCell>
                      <TableCell className="text-right">{container.armador_cost_usd ? formatCurrency(container.armador_cost_usd) : '-'}</TableCell>
                      <TableCell>
                        <Button 
                          size="sm" 
                          onClick={() => handleSelect(container)}
                          className="bg-[#ffc800] text-black hover:bg-[#e6b400]"
                        >
                          Selecionar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
