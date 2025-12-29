import { useState, useMemo } from "react";
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
import { Layers, Star, Search } from "lucide-react";
import { Voucher } from "@/types/voucher";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";

interface ConsolidarVouchersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vouchers: Voucher[];
  onSuccess: () => void;
}

export const ConsolidarVouchersDialog = ({
  open,
  onOpenChange,
  vouchers,
  onSuccess,
}: ConsolidarVouchersDialogProps) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [masterId, setMasterId] = useState<string>("");
  const [numeroRM, setNumeroRM] = useState("");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  // Filter vouchers available for consolidation (same stage, not already consolidated)
  const availableVouchers = useMemo(() => {
    return vouchers.filter((v) => {
      // Only OPERACAO, FISCAL or SUPERVISOR stage vouchers can be consolidated
      if (!["OPERACAO", "FISCAL", "SUPERVISOR"].includes(v.etapaAtual)) return false;
      // Already a child of a master
      if (v.voucherMasterId) return false;
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
  }, [vouchers, search]);

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
        // If removing the master, clear master selection
        if (masterId === voucherId) {
          setMasterId("");
        }
        return prev.filter((id) => id !== voucherId);
      }
      return [...prev, voucherId];
    });
  };

  const handleSetMaster = (voucherId: string) => {
    if (selectedIds.includes(voucherId)) {
      setMasterId(voucherId);
    }
  };

  const handleConsolidar = async () => {
    if (selectedIds.length < 2) {
      toast.error("Selecione pelo menos 2 vouchers para consolidar");
      return;
    }
    if (!masterId) {
      toast.error("Selecione qual voucher será o master");
      return;
    }
    if (!numeroRM.trim()) {
      toast.error("Informe o número RM definitivo");
      return;
    }

    setLoading(true);
    try {
      const user = getUserData();

      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "consolidar_vouchers",
          voucher_ids: selectedIds,
          master_id: masterId,
          numero_rm: numeroRM.trim(),
          user_id: user.id,
          user_name: user.name,
        },
      });

      if (error || !data?.success) {
        throw new Error(data?.error || error?.message || "Erro ao consolidar vouchers");
      }

      const masterVoucher = selectedVouchers.find((v) => v.id === masterId);
      toast.success("Vouchers consolidados com sucesso", {
        description: `${selectedIds.length} vouchers consolidados no master ${masterVoucher?.numeroSPO}`,
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
      setMasterId("");
      setNumeroRM("");
      setSearch("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            Consolidar Vouchers
          </DialogTitle>
          <DialogDescription>
            Selecione os vouchers que serão consolidados em um único voucher master.
            Isso é útil quando o RM gera uma única fatura para múltiplos vouchers.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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
                  Nenhum voucher disponível para consolidação
                </p>
              ) : (
                availableVouchers.map((voucher) => {
                  const isSelected = selectedIds.includes(voucher.id);
                  const isMaster = masterId === voucher.id;
                  return (
                    <div
                      key={voucher.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                        isSelected
                          ? isMaster
                            ? "bg-primary/10 border-primary"
                            : "bg-accent/50 border-accent"
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
                          {isMaster && (
                            <Badge className="bg-primary text-primary-foreground gap-1">
                              <Star className="h-3 w-3" />
                              Master
                            </Badge>
                          )}
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
                        <p>{voucher.etapaAtual}</p>
                      </div>
                      {isSelected && !isMaster && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSetMaster(voucher.id)}
                          className="text-xs"
                        >
                          Definir Master
                        </Button>
                      )}
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
              {masterId && (
                <div className="flex justify-between text-sm">
                  <span>Master:</span>
                  <span className="font-medium text-primary">
                    {selectedVouchers.find((v) => v.id === masterId)?.numeroSPO}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* RM Number */}
          <div className="space-y-2">
            <Label htmlFor="numero-rm">Número RM Definitivo *</Label>
            <Input
              id="numero-rm"
              placeholder="Informe o número RM gerado pelo sistema"
              value={numeroRM}
              onChange={(e) => setNumeroRM(e.target.value)}
              disabled={loading}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            onClick={handleConsolidar}
            disabled={loading || selectedIds.length < 2 || !masterId || !numeroRM.trim()}
          >
            {loading ? "Consolidando..." : "Consolidar Vouchers"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
