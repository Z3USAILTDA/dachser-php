import { useState, useMemo, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Layers, Search, AlertTriangle } from "lucide-react";
import { Voucher } from "@/types/voucher";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";

interface ConsolidarVouchersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vouchers: Voucher[];
  onSuccess: () => void;
  /** Opcional: Restringir a uma etapa específica */
  etapaFiltro?: "OPERACAO" | "FISCAL";
}

export const ConsolidarVouchersDialog = ({
  open,
  onOpenChange,
  vouchers,
  onSuccess,
  etapaFiltro,
}: ConsolidarVouchersDialogProps) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [numeroRM, setNumeroRM] = useState("");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  // Determina a etapa do primeiro voucher selecionado (para filtrar os demais)
  const etapaSelecionada = useMemo(() => {
    if (etapaFiltro) return etapaFiltro;
    if (selectedIds.length === 0) return null;
    const firstSelected = vouchers.find((v) => v.id === selectedIds[0]);
    return firstSelected?.etapaAtual || null;
  }, [selectedIds, vouchers, etapaFiltro]);

  // Filter vouchers available for consolidation (same stage, not already consolidated)
  const availableVouchers = useMemo(() => {
    return vouchers.filter((v) => {
      // Only OPERACAO or FISCAL stage vouchers can be consolidated
      if (!["OPERACAO", "FISCAL"].includes(v.etapaAtual)) return false;
      // Already consolidated (tem consolidacao_rm_numero)
      if (v.consolidacaoRmNumero) return false;
      // Se há etapa filtro, só mostrar da mesma etapa
      if (etapaFiltro && v.etapaAtual !== etapaFiltro) return false;
      // Se já tem vouchers selecionados, só mostrar da mesma etapa
      if (etapaSelecionada && v.etapaAtual !== etapaSelecionada) return false;
      // Match search
      if (search) {
        const searchLower = search.toLowerCase();
        return (
          v.numeroSPO.toLowerCase().includes(searchLower) ||
          (v.fornecedor?.toLowerCase() || "").includes(searchLower)
        );
      }
      return true;
    });
  }, [vouchers, search, etapaFiltro, etapaSelecionada]);

  const selectedVouchers = useMemo(
    () => vouchers.filter((v) => selectedIds.includes(v.id)),
    [vouchers, selectedIds]
  );

  const totalValor = useMemo(
    () => selectedVouchers.reduce((sum, v) => sum + (v.valor || 0), 0),
    [selectedVouchers]
  );

  const getUserData = () => {
    try {
      const stored = localStorage.getItem("user") || localStorage.getItem("dachser_user");
      if (stored) {
        const parsed = JSON.parse(stored);
        return { id: parsed.id, name: parsed.username || parsed.email };
      }
    } catch {
      return { id: null, name: "Sistema" };
    }
    return { id: null, name: "Sistema" };
  };

  const handleToggle = (voucherId: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(voucherId)) {
        return prev.filter((id) => id !== voucherId);
      }
      return [...prev, voucherId];
    });
  };

  const handleConsolidar = async () => {
    if (selectedIds.length < 2) {
      toast.error("Selecione pelo menos 2 vouchers para consolidar");
      return;
    }
    if (!numeroRM.trim()) {
      toast.error("Informe o número RM definitivo");
      return;
    }

    // Validar que todos são da mesma etapa
    const etapas = new Set(selectedVouchers.map((v) => v.etapaAtual));
    if (etapas.size > 1) {
      toast.error("Todos os vouchers devem ser da mesma etapa");
      return;
    }

    setLoading(true);
    try {
      const user = getUserData();

      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "consolidar_vouchers",
          voucher_ids: selectedIds,
          numero_rm: numeroRM.trim(),
          user_id: user.id,
          user_name: user.name,
        },
      });

      if (error || !data?.success) {
        throw new Error(data?.error || error?.message || "Erro ao consolidar vouchers");
      }

      toast.success("Vouchers agrupados com sucesso", {
        description: `${selectedIds.length} vouchers vinculados ao RM ${numeroRM.trim()}`,
      });

      onSuccess();
      handleClose();
    } catch (err) {
      console.error("Erro ao consolidar vouchers:", err);
      toast.error("Erro ao consolidar vouchers", {
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      onOpenChange(false);
      setSelectedIds([]);
      setNumeroRM("");
      setSearch("");
    }
  };

  // Reset selection when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedIds([]);
      setNumeroRM("");
      setSearch("");
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            Agrupar Vouchers
          </DialogTitle>
          <DialogDescription>
            Selecione os vouchers que serão agrupados sob o mesmo número RM.
            Apenas vouchers da mesma etapa podem ser agrupados.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Alerta de etapa */}
          {etapaSelecionada && (
            <Alert className="bg-primary/10 border-primary/30">
              <AlertDescription className="flex items-center gap-2">
                <Layers className="h-4 w-4" />
                Agrupando vouchers da etapa: <strong>{etapaSelecionada}</strong>
              </AlertDescription>
            </Alert>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por número SPO ou fornecedor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Voucher List */}
          <ScrollArea className="h-[280px] border rounded-lg">
            <div className="p-2 space-y-1">
              {availableVouchers.length === 0 ? (
                <p className="text-center text-muted-foreground py-8 text-sm">
                  {selectedIds.length > 0 
                    ? `Não há mais vouchers na etapa ${etapaSelecionada} disponíveis`
                    : "Nenhum voucher disponível para agrupamento"}
                </p>
              ) : (
                availableVouchers.map((voucher) => {
                  const isSelected = selectedIds.includes(voucher.id);
                  return (
                    <div
                      key={voucher.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                        isSelected
                          ? "bg-primary/10 border-primary"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => handleToggle(voucher.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium">{voucher.numeroSPO}</span>
                          <Badge variant="outline" className="text-xs">
                            {voucher.etapaAtual}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {voucher.fornecedor || "Sem fornecedor"} • {voucher.moeda}{" "}
                          {(voucher.valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <p>Venc: {voucher.vencimento && !isNaN(new Date(voucher.vencimento).getTime()) 
                          ? format(new Date(voucher.vencimento), "dd/MM/yyyy") 
                          : "-"}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>

          {/* Selected Summary */}
          {selectedIds.length > 0 && (
            <div className="bg-muted/50 rounded-lg p-3 space-y-3">
              <div className="flex justify-between text-sm">
                <span>Vouchers selecionados:</span>
                <span className="font-medium">{selectedIds.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Valor total:</span>
                <span className="font-medium">
                  BRL {totalValor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Etapa:</span>
                <span className="font-medium text-primary">
                  {etapaSelecionada}
                </span>
              </div>
            </div>
          )}

          {/* RM Number */}
          <div className="space-y-2">
            <Label htmlFor="numero-rm">Número RM (Identificador do Grupo) *</Label>
            <Input
              id="numero-rm"
              placeholder="Informe o número RM que identificará este grupo"
              value={numeroRM}
              onChange={(e) => setNumeroRM(e.target.value)}
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              Este número será usado para identificar todos os vouchers agrupados
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            onClick={handleConsolidar}
            disabled={loading || selectedIds.length < 2 || !numeroRM.trim()}
          >
            {loading ? "Agrupando..." : "Agrupar Vouchers"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
