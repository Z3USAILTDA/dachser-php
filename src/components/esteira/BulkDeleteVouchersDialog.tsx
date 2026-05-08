import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Search, AlertTriangle, Loader2 } from "lucide-react";
import { Voucher, calcularTempoNaEtapa, formatarTempoNaEtapa, ETAPA_LABELS, SLA_POR_ETAPA } from "@/types/voucher";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface BulkDeleteVouchersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vouchers: Voucher[];
  onDeleted: () => void;
}

export const BulkDeleteVouchersDialog = ({
  open,
  onOpenChange,
  vouchers,
  onDeleted,
}: BulkDeleteVouchersDialogProps) => {
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [etapaFilter, setEtapaFilter] = useState<string>("all");
  const [enviadoPorFilter, setEnviadoPorFilter] = useState<string>("all");
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  useEffect(() => {
    if (!open) {
      setSelected(new Set());
      setSearch("");
      setEtapaFilter("all");
      setEnviadoPorFilter("all");
      setConfirming(false);
      setDeleting(false);
      setProgress({ done: 0, total: 0 });
    }
  }, [open]);

  const uniqueEtapas = useMemo(
    () =>
      Array.from(new Set(vouchers.map((v) => v.etapaAtual).filter(Boolean))).sort(),
    [vouchers]
  );
  const uniqueEnviadoPor = useMemo(
    () =>
      Array.from(
        new Set(vouchers.map((v) => v.enviadoPorUserName).filter(Boolean) as string[])
      ).sort(),
    [vouchers]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vouchers.filter((v) => {
      if (etapaFilter !== "all" && v.etapaAtual !== etapaFilter) return false;
      if (enviadoPorFilter !== "all" && v.enviadoPorUserName !== enviadoPorFilter)
        return false;
      if (q) {
        const hit = [v.numeroSPO, v.fornecedor, (v as any).processoNumero]
          .filter(Boolean)
          .some((s) => String(s).toLowerCase().includes(q));
        if (!hit) return false;
      }
      return true;
    });
  }, [vouchers, search, etapaFilter, enviadoPorFilter]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((v) => selected.has(v.id));

  const toggleAllFiltered = () => {
    const next = new Set(selected);
    if (allFilteredSelected) {
      filtered.forEach((v) => next.delete(v.id));
    } else {
      filtered.forEach((v) => next.add(v.id));
    }
    setSelected(next);
  };

  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const handleConfirmDelete = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;

    setDeleting(true);
    setProgress({ done: 0, total: ids.length });

    let okCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      try {
        const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
          body: { action: "delete_voucher_esteira", voucher_id: id },
        });
        if (error || !data?.success) {
          throw new Error(data?.error || error?.message || "Erro ao excluir");
        }
        okCount++;
      } catch (e: any) {
        const v = vouchers.find((x) => x.id === id);
        errors.push(`${v?.numeroSPO || id}: ${e.message}`);
      }
      setProgress({ done: i + 1, total: ids.length });
    }

    setDeleting(false);

    if (errors.length === 0) {
      toast({
        title: "Vouchers excluídos",
        description: `${okCount} voucher(s) excluído(s) com sucesso.`,
      });
    } else {
      toast({
        title: `Concluído com erros (${okCount}/${ids.length})`,
        description: errors.slice(0, 3).join(" • ") + (errors.length > 3 ? "…" : ""),
        variant: "destructive",
      });
    }

    onDeleted();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !deleting && onOpenChange(o)}>
      <DialogContent className="max-w-2xl bg-[rgba(5,6,18,0.98)] border-white/10 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" />
            Excluir Vouchers em Lote (Admin)
          </DialogTitle>
          <DialogDescription>
            Selecione os vouchers/SPOs que deseja excluir permanentemente.
            Esta ação não pode ser desfeita.
          </DialogDescription>
        </DialogHeader>

        {!confirming && (
          <>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por SPO, fornecedor ou processo..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 bg-[#0a0b10] border-white/10 rounded-full"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={toggleAllFiltered}
                disabled={filtered.length === 0}
              >
                {allFilteredSelected ? "Desmarcar todos" : "Selecionar todos"}
              </Button>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Select value={etapaFilter} onValueChange={setEtapaFilter}>
                <SelectTrigger className="w-[200px] bg-[#0a0b10] border-white/10 rounded-full">
                  <SelectValue placeholder="Etapa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as Etapas</SelectItem>
                  {uniqueEtapas.map((e) => (
                    <SelectItem key={e} value={e}>
                      {e}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={enviadoPorFilter} onValueChange={setEnviadoPorFilter}>
                <SelectTrigger className="w-[220px] bg-[#0a0b10] border-white/10 rounded-full">
                  <SelectValue placeholder="Enviado por" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos (Enviado por)</SelectItem>
                  {uniqueEnviadoPor.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {(etapaFilter !== "all" || enviadoPorFilter !== "all") && (
                <button
                  onClick={() => {
                    setEtapaFilter("all");
                    setEnviadoPorFilter("all");
                  }}
                  className="text-[#ffc800] hover:text-white text-xs"
                >
                  ✕ Limpar filtros
                </button>
              )}
            </div>

            <ScrollArea className="h-[50vh] border border-white/10 rounded-md">
              <div className="divide-y divide-white/5">
                {filtered.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    Nenhum voucher encontrado.
                  </div>
                ) : (
                  filtered.map((v) => {
                    const checked = selected.has(v.id);
                    const horas = calcularTempoNaEtapa(v);
                    const sla = SLA_POR_ETAPA[v.etapaAtual] || 0;
                    const overSla = sla > 0 && horas > sla;
                    return (
                      <label
                        key={v.id}
                        className="flex items-center gap-3 px-3 py-2 hover:bg-white/5 cursor-pointer"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleOne(v.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-mono text-sm text-[#ffc800] flex items-center gap-2 flex-wrap">
                            <span>SPO {v.numeroSPO}</span>
                            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-white/5 text-muted-foreground border border-white/10">
                              {ETAPA_LABELS[v.etapaAtual] || v.etapaAtual}
                            </span>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                                overSla
                                  ? "bg-destructive/15 text-destructive border-destructive/30"
                                  : "bg-white/5 text-muted-foreground border-white/10"
                              }`}
                              title={sla > 0 ? `SLA: ${sla}h` : "Sem SLA"}
                            >
                              ⏱ {formatarTempoNaEtapa(horas)}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {v.fornecedor || "—"}
                            {v.valor != null && (
                              <span className="ml-2">
                                · {v.moeda || "BRL"}{" "}
                                {Number(v.valor).toLocaleString("pt-BR", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </span>
                            )}
                            {v.enviadoPorUserName && (
                              <span className="ml-2">· por {v.enviadoPorUserName}</span>
                            )}
                          </div>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </ScrollArea>

            <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
              <div className="text-xs text-muted-foreground">
                {selected.size} selecionado(s) de {filtered.length} exibido(s)
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  disabled={selected.size === 0}
                  onClick={() => setConfirming(true)}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Excluir {selected.size}
                </Button>
              </div>
            </DialogFooter>
          </>
        )}

        {confirming && (
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="text-sm">
                Você está prestes a excluir <b>{selected.size}</b> voucher(s).
                Todos os anexos e o histórico serão removidos permanentemente.
                Confirma?
              </div>
            </div>

            {deleting && (
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                Excluindo {progress.done}/{progress.total}...
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                disabled={deleting}
                onClick={() => setConfirming(false)}
              >
                Voltar
              </Button>
              <Button
                variant="destructive"
                disabled={deleting}
                onClick={handleConfirmDelete}
              >
                {deleting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Excluindo...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-1" />
                    Confirmar exclusão
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
