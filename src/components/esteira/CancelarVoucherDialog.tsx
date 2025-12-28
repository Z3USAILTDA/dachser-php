import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, XCircle } from "lucide-react";
import { Voucher } from "@/types/voucher";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CancelarVoucherDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  voucher: Voucher;
  onSuccess: () => void;
}

export const CancelarVoucherDialog = ({
  open,
  onOpenChange,
  voucher,
  onSuccess,
}: CancelarVoucherDialogProps) => {
  const [motivo, setMotivo] = useState("");
  const [voucherCredito, setVoucherCredito] = useState("");
  const [loading, setLoading] = useState(false);

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

  const handleCancel = async () => {
    if (!motivo.trim()) {
      toast.error("Informe o motivo do cancelamento");
      return;
    }
    if (!voucherCredito.trim()) {
      toast.error("Informe o número do voucher a crédito");
      return;
    }

    setLoading(true);
    try {
      const user = getUserData();

      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "cancelar_voucher",
          voucher_id: voucher.id,
          motivo: motivo.trim(),
          voucher_credito: voucherCredito.trim(),
          user_id: user.id,
          user_name: user.name,
        },
      });

      if (error || !data?.success) {
        throw new Error(data?.error || error?.message || "Erro ao cancelar voucher");
      }

      toast.success("Voucher cancelado com sucesso", {
        description: `Voucher ${voucher.numeroSPO} foi cancelado. Crédito: ${voucherCredito}`,
      });

      onSuccess();
      onOpenChange(false);
      setMotivo("");
      setVoucherCredito("");
    } catch (err) {
      console.error("Erro ao cancelar voucher:", err);
      toast.error("Erro ao cancelar voucher", {
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      onOpenChange(false);
      setMotivo("");
      setVoucherCredito("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <XCircle className="h-5 w-5" />
            Cancelar Voucher
          </DialogTitle>
          <DialogDescription>
            Você está prestes a cancelar o voucher <strong>{voucher.numeroSPO}</strong>.
            Esta ação é irreversível e o voucher não poderá ser reativado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-warning">Atenção</p>
              <p className="text-muted-foreground">
                O cancelamento manterá o voucher visível no histórico, mas ele não poderá mais ser 
                processado. Informe obrigatoriamente o voucher a crédito.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="voucher-credito">Número do Voucher a Crédito *</Label>
            <Input
              id="voucher-credito"
              placeholder="Ex: 101-123456"
              value={voucherCredito}
              onChange={(e) => setVoucherCredito(e.target.value)}
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              Informe o número do voucher que receberá o crédito referente a este cancelamento.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="motivo">Motivo do Cancelamento *</Label>
            <Textarea
              id="motivo"
              placeholder="Descreva o motivo do cancelamento deste voucher..."
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={4}
              className="resize-none"
              disabled={loading}
            />
          </div>

          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-sm font-medium">Resumo do Voucher</p>
            <div className="grid grid-cols-2 gap-2 mt-2 text-sm text-muted-foreground">
              <span>Fornecedor:</span>
              <span>{voucher.fornecedor || "-"}</span>
              <span>Valor:</span>
              <span>{voucher.valor ? `${voucher.moeda} ${voucher.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : "-"}</span>
              <span>Etapa Atual:</span>
              <span>{voucher.etapaAtual}</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Voltar
          </Button>
          <Button
            variant="destructive"
            onClick={handleCancel}
            disabled={loading || !motivo.trim() || !voucherCredito.trim()}
          >
            {loading ? "Cancelando..." : "Confirmar Cancelamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
