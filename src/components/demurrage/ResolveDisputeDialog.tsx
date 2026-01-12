import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { DemurrageContainer } from "@/hooks/useDemurrageData";

interface ResolveDisputeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  container: DemurrageContainer | null;
  resolution: "won" | "lost";
  onSubmit: (data: { recovered_amount_usd: number; notes?: string }) => Promise<void>;
  isLoading?: boolean;
}

export function ResolveDisputeDialog({ open, onOpenChange, container, resolution, onSubmit, isLoading }: ResolveDisputeDialogProps) {
  const [recoveredAmount, setRecoveredAmount] = useState("");
  const [notes, setNotes] = useState("");

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setRecoveredAmount("");
      setNotes("");
    }
    onOpenChange(newOpen);
  };

  const handleSubmit = async () => {
    const amount = resolution === "won" ? parseFloat(recoveredAmount) : 0;
    if (resolution === "won" && (isNaN(amount) || amount < 0)) return;
    
    await onSubmit({
      recovered_amount_usd: amount,
      notes: notes || undefined,
    });
    
    handleOpenChange(false);
  };

  const formatCurrency = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(value);

  const isWon = resolution === "won";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-[rgba(5,6,18,0.95)] border-[rgba(255,255,255,0.1)] max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            {isWon ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : (
              <XCircle className="h-5 w-5 text-red-500" />
            )}
            {isWon ? "Marcar como Ganha" : "Marcar como Perdida"}
          </DialogTitle>
          <DialogDescription>
            {container && `Container: ${container.numero}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {container && (
            <div className="grid grid-cols-2 gap-2 text-sm bg-[rgba(255,255,255,0.05)] p-3 rounded-lg">
              <div>
                <span className="text-muted-foreground">Valor Disputado:</span>
                <p className="font-medium text-yellow-500">{formatCurrency(container.disputed_amount_usd)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Motivo:</span>
                <p className="font-medium">{container.dispute_reason || '-'}</p>
              </div>
            </div>
          )}

          {isWon && (
            <div className="space-y-2">
              <Label htmlFor="recoveredAmount">Valor Recuperado (USD)</Label>
              <Input
                id="recoveredAmount"
                type="number"
                placeholder="0.00"
                value={recoveredAmount}
                onChange={(e) => setRecoveredAmount(e.target.value)}
                className="bg-[rgba(255,255,255,0.05)] border-[rgba(255,255,255,0.1)]"
              />
              <p className="text-xs text-muted-foreground">
                Informe o valor que foi efetivamente recuperado/abatido na fatura.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes">Observações (opcional)</Label>
            <Textarea
              id="notes"
              placeholder={isWon ? "Detalhes da negociação..." : "Motivo da perda..."}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="bg-[rgba(255,255,255,0.05)] border-[rgba(255,255,255,0.1)]"
            />
          </div>

          {!isWon && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
              Ao marcar como perdida, o valor recuperado será registrado como $0.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} className="border-[rgba(255,255,255,0.2)]">
            Cancelar
          </Button>
          <Button 
            onClick={handleSubmit}
            disabled={(isWon && !recoveredAmount) || isLoading}
            className={isWon ? "bg-green-500 text-white hover:bg-green-600" : "bg-red-500 text-white hover:bg-red-600"}
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {isWon ? "Confirmar Vitória" : "Confirmar Perda"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
