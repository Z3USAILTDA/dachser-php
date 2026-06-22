import { useState, useEffect, useRef } from "react";
import { VoucherFilho } from "@/types/voucher";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Unlink, Loader2 } from "lucide-react";

interface DesmembrarMasterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  masterId: string;
  onConfirm: (selectedChildIds: string[], keepMaster: boolean) => Promise<void>;
  loading?: boolean;
}

export const DesmembrarMasterDialog = ({
  open,
  onOpenChange,
  masterId,
  onConfirm,
  loading = false,
}: DesmembrarMasterDialogProps) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState(false);
  const [vouchersFilhos, setVouchersFilhos] = useState<VoucherFilho[]>([]);
  const [loadingFilhos, setLoadingFilhos] = useState(false);
  const loadedMasterIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (open && masterId) {
      if (loadedMasterIdRef.current === masterId) return;
      loadedMasterIdRef.current = masterId;
      loadFilhos();
    } else if (!open) {
      loadedMasterIdRef.current = null;
    }
  }, [open, masterId]);

  const loadFilhos = async () => {
    try {
      setLoadingFilhos(true);
      const resp = await fetch(`/api/fin/vouchers/${masterId}/filhos`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      if (data?.data) {
        setVouchersFilhos(data.data.map((f: any) => ({
          id: f.id,
          numeroSPO: f.numero_spo,
          fornecedor: f.fornecedor,
          valor: f.valor,
          moeda: f.moeda,
          vencimento: f.vencimento,
          etapaAtual: f.etapa_atual,
        })));
      }
    } catch (err) {
      console.error("Erro ao carregar filhos:", err);
    } finally {
      setLoadingFilhos(false);
    }
  };

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedIds([]);
    } else {
      setSelectedIds(vouchersFilhos.map(v => v.id));
    }
    setSelectAll(!selectAll);
  };

  const handleToggle = (id: string, checked: boolean) => {
    if (checked) {
      const newSelected = [...selectedIds, id];
      setSelectedIds(newSelected);
      if (newSelected.length === vouchersFilhos.length) {
        setSelectAll(true);
      }
    } else {
      setSelectedIds(selectedIds.filter(sid => sid !== id));
      setSelectAll(false);
    }
  };

  const keepMaster = selectedIds.length > 0 && selectedIds.length < vouchersFilhos.length;

  const handleConfirm = async () => {
    await onConfirm(selectedIds, keepMaster);
    setSelectedIds([]);
    setSelectAll(false);
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      setSelectedIds([]);
      setSelectAll(false);
      setVouchersFilhos([]);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Unlink className="h-5 w-5 text-orange-500" />
            Desmembrar Voucher/SPO Master
          </DialogTitle>
          <DialogDescription>
            {loadingFilhos ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando vouchers filhos...
              </span>
            ) : vouchersFilhos.length === 0 ? (
              <span>Nenhum voucher filho encontrado para este master.</span>
            ) : (
              <>
                Selecione os vouchers/SPO filhos que deseja restaurar como individuais.
                {keepMaster ? (
                  <span className="block mt-1 text-amber-500 font-medium">
                    O master será mantido com os filhos restantes.
                  </span>
                ) : selectedIds.length === vouchersFilhos.length ? (
                  <span className="block mt-1 text-destructive font-medium">
                    O master será excluído pois todos os filhos serão desmembrados.
                  </span>
                ) : null}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {!loadingFilhos && vouchersFilhos.length > 0 && (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-3 px-1">
              <Checkbox
                id="select-all"
                checked={selectAll}
                onCheckedChange={handleSelectAll}
              />
              <Label htmlFor="select-all" className="font-medium cursor-pointer">
                Selecionar todos ({vouchersFilhos.length})
              </Label>
            </div>

            <ScrollArea className="h-[300px] border rounded-lg">
              <div className="divide-y divide-border">
                {vouchersFilhos.map((filho) => (
                  <div
                    key={filho.id}
                    className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors"
                  >
                    <Checkbox
                      id={`filho-${filho.id}`}
                      checked={selectedIds.includes(filho.id)}
                      onCheckedChange={(checked) => handleToggle(filho.id, !!checked)}
                    />
                    <label
                      htmlFor={`filho-${filho.id}`}
                      className="flex-1 flex items-center justify-between cursor-pointer"
                    >
                      <div>
                        <span className="font-mono font-medium text-sm">
                          {filho.numeroSPO}
                        </span>
                        {filho.fornecedor && (
                          <span className="text-sm text-muted-foreground ml-2">
                            - {filho.fornecedor}
                          </span>
                        )}
                      </div>
                      <div className="text-right text-sm">
                        <span className="font-medium">
                          {filho.moeda || "BRL"}{" "}
                          {Number(filho.valor || 0).toLocaleString("pt-BR", {
                            minimumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                    </label>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={selectedIds.length === 0 || loading || loadingFilhos}
            className="bg-orange-600 hover:bg-orange-700"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Desmembrando...
              </>
            ) : keepMaster ? (
              `Desmembrar ${selectedIds.length} Selecionado${selectedIds.length > 1 ? "s" : ""}`
            ) : (
              "Desmembrar Todos"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
