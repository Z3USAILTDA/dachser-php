import { useEffect, useMemo, useState } from "react";
import { Info, Search, Plus, Trash2, Loader2 } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";

interface FornecedorRow {
  id: number;
  cnpj: string;
  nome: string;
  created_by?: string | null;
  created_at?: string | null;
}

interface FornecedoresSemFiscalDialogProps {
  /** Optional custom trigger; defaults to a small "Ver lista" button */
  trigger?: React.ReactNode;
}

export const FornecedoresSemFiscalDialog = ({ trigger }: FornecedoresSemFiscalDialogProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<FornecedorRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newCnpj, setNewCnpj] = useState("");
  const [newNome, setNewNome] = useState("");
  const { toast } = useToast();
  const { isFiscal, isGestorFiscal, isAdmin, isSupervisor, isFinanceiro } = useUserRole();

  // Quem pode adicionar/remover: Fiscal, Gestor Fiscal, Admin (mantemos Supervisor/Financeiro por hierarquia)
  const canManage = isFiscal || isGestorFiscal || isAdmin || isSupervisor || isFinanceiro;

  const loadRows = async () => {
    setLoading(true);
    try {
      const resp = await fetch('/api/fin/fornecedores-sem-fiscal');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      if (data?.success && Array.isArray(data.data)) {
        setRows(data.data);
      } else {
        throw new Error(data?.error || 'Resposta inesperada da API');
      }
    } catch (err: any) {
      console.error("Erro ao carregar fornecedores sem fiscal:", err);
      toast({
        title: "Erro ao carregar lista",
        description: err?.message || "Não foi possível buscar os fornecedores.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) loadRows();
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (f) =>
        f.cnpj.toLowerCase().includes(q) ||
        f.nome.toLowerCase().includes(q),
    );
  }, [query, rows]);

  const handleAdd = async () => {
    const cnpj = newCnpj.trim();
    const nome = newNome.trim();
    if (!cnpj || !nome) {
      toast({
        title: "Campos obrigatórios",
        description: "Informe CNPJ e Razão Social.",
        variant: "destructive",
      });
      return;
    }
    setAdding(true);
    try {
      const storedUser = localStorage.getItem("user") || localStorage.getItem("dachser_user");
      const userName = storedUser ? (JSON.parse(storedUser).name || JSON.parse(storedUser).email) : null;

      const resp = await fetch('/api/fin/fornecedores-sem-fiscal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cnpj, nome, created_by: userName }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data?.success) throw new Error(data?.error || `HTTP ${resp.status}`);
      toast({ title: "Fornecedor adicionado" });
      setNewCnpj("");
      setNewNome("");
      await loadRows();
    } catch (err: any) {
      toast({
        title: "Erro ao adicionar",
        description: err?.message || "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (id: number) => {
    try {
      const resp = await fetch(`/api/fin/fornecedores-sem-fiscal/${id}`, { method: 'DELETE' });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data?.success) throw new Error(data?.error || `HTTP ${resp.status}`);
      toast({ title: "Fornecedor removido" });
      await loadRows();
    } catch (err: any) {
      toast({
        title: "Erro ao remover",
        description: err?.message || "Tente novamente.",
        variant: "destructive",
      });
    }
  };

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
            Documentos em nome do cliente - Ver fornecedores que não precisam da etapa Fiscal
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            Documentos em nome do cliente - Fornecedores que não necessitam de ação fiscal
          </DialogTitle>
          <DialogDescription>
            Para os fornecedores listados abaixo, selecione "Não" no campo "É necessário
            contabilização com o fiscal?" para enviar o voucher diretamente ao Financeiro.
          </DialogDescription>
        </DialogHeader>

        {canManage && (
          <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-2">
            <div className="text-xs font-medium text-foreground">
              Adicionar novo fornecedor
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[180px_1fr_auto] gap-2">
              <Input
                placeholder="CNPJ (00.000.000/0000-00)"
                value={newCnpj}
                onChange={(e) => setNewCnpj(e.target.value)}
                disabled={adding}
              />
              <Input
                placeholder="Razão Social"
                value={newNome}
                onChange={(e) => setNewNome(e.target.value)}
                disabled={adding}
              />
              <Button onClick={handleAdd} disabled={adding} size="sm" className="gap-1">
                {adding ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                Adicionar
              </Button>
            </div>
          </div>
        )}

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
                {canManage && <TableHead className="w-[60px]" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={canManage ? 3 : 2} className="text-center py-6 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canManage ? 3 : 2} className="text-center py-6 text-muted-foreground">
                    Nenhum fornecedor encontrado
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((f) => (
                  <TableRow key={`${f.id}-${f.cnpj}`}>
                    <TableCell className="font-mono text-xs">{f.cnpj}</TableCell>
                    <TableCell className="text-sm">{f.nome}</TableCell>
                    {canManage && (
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => handleRemove(f.id)}
                          title="Remover"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="text-xs text-muted-foreground">
          Total: {filtered.length} de {rows.length} fornecedores
        </div>
      </DialogContent>
    </Dialog>
  );
};
