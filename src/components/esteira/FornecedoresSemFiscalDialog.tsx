import { useMemo, useState } from "react";
import { Info, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FORNECEDORES_SEM_FISCAL } from "@/data/fornecedoresSemFiscal";

interface FornecedoresSemFiscalDialogProps {
  /** Optional custom trigger; defaults to a small "Ver lista" button */
  trigger?: React.ReactNode;
}

export const FornecedoresSemFiscalDialog = ({ trigger }: FornecedoresSemFiscalDialogProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FORNECEDORES_SEM_FISCAL;
    return FORNECEDORES_SEM_FISCAL.filter(
      (f) =>
        f.cnpj.toLowerCase().includes(q) ||
        f.nome.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Info className="h-3.5 w-3.5" />
            Ver fornecedores que não precisam da etapa Fiscal
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Fornecedores que não necessitam de ação fiscal</DialogTitle>
          <DialogDescription>
            Para os fornecedores listados abaixo, selecione "Não" no campo "É necessário
            contabilização com o fiscal?" para enviar o voucher diretamente ao Financeiro.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por CNPJ ou nome..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="overflow-auto rounded-lg border border-border/50">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="w-[180px] font-semibold">CNPJ</TableHead>
                <TableHead className="font-semibold">Razão Social</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2} className="text-center py-6 text-muted-foreground">
                    Nenhum fornecedor encontrado
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((f) => (
                  <TableRow key={`${f.cnpj}-${f.nome}`}>
                    <TableCell className="font-mono text-xs">{f.cnpj}</TableCell>
                    <TableCell className="text-sm">{f.nome}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="text-xs text-muted-foreground">
          Total: {filtered.length} de {FORNECEDORES_SEM_FISCAL.length} fornecedores
        </div>
      </DialogContent>
    </Dialog>
  );
};
