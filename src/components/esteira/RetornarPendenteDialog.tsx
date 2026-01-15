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
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Loader2 } from "lucide-react";

interface RetornarPendenteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (justificativa: string) => Promise<void>;
  voucherSpo: string;
}

export const RetornarPendenteDialog = ({
  open,
  onOpenChange,
  onConfirm,
  voucherSpo,
}: RetornarPendenteDialogProps) => {
  const [justificativa, setJustificativa] = useState("");
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    if (!justificativa.trim()) return;

    setLoading(true);
    try {
      await onConfirm(justificativa.trim());
      setJustificativa("");
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setJustificativa("");
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Retornar Comprovante para Pendente
          </DialogTitle>
          <DialogDescription>
            Voucher/SPO: <strong>{voucherSpo}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Alert className="bg-yellow-500/10 border-yellow-500/30">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            <AlertDescription className="text-yellow-700 dark:text-yellow-300">
              Ao retornar para pendente, o comprovante atual poderá ser substituído.
              A equipe financeira será notificada sobre esta alteração.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="justificativa" className="text-sm font-medium">
              Justificativa <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="justificativa"
              placeholder="Descreva o motivo para retornar o comprovante para pendente (ex: comprovante incorreto, valor divergente, etc.)"
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              rows={4}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Mínimo de 10 caracteres
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={loading || justificativa.trim().length < 10}
            className="bg-yellow-600 hover:bg-yellow-700 text-white"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processando...
              </>
            ) : (
              "Confirmar Retorno"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
