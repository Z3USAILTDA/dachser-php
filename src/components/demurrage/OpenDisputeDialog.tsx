import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Scale, Loader2 } from "lucide-react";
import { DemurrageContainer } from "@/hooks/useDemurrageData";

interface OpenDisputeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  container: DemurrageContainer | null;
  onSubmit: (data: { disputed_amount_usd: number; dispute_reason: string }) => Promise<void>;
  isLoading?: boolean;
}

const DISPUTE_REASONS = [
  { value: "wrong_calculation", label: "Cálculo incorreto" },
  { value: "wrong_dates", label: "Datas incorretas" },
  { value: "rate_discrepancy", label: "Discrepância de tarifa" },
  { value: "freetime_not_applied", label: "Free time não aplicado" },
  { value: "double_charge", label: "Cobrança em duplicidade" },
  { value: "container_not_ours", label: "Container não pertence ao processo" },
  { value: "other", label: "Outro" },
];

export function OpenDisputeDialog({ open, onOpenChange, container, onSubmit, isLoading }: OpenDisputeDialogProps) {
  const [disputedAmount, setDisputedAmount] = useState("");
  const [reason, setReason] = useState("");
  const [otherReason, setOtherReason] = useState("");

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setDisputedAmount("");
      setReason("");
      setOtherReason("");
    }
    onOpenChange(newOpen);
  };

  const handleSubmit = async () => {
    const amount = parseFloat(disputedAmount);
    if (isNaN(amount) || amount <= 0) return;
    
    const finalReason = reason === "other" ? otherReason : DISPUTE_REASONS.find(r => r.value === reason)?.label || reason;
    
    await onSubmit({
      disputed_amount_usd: amount,
      dispute_reason: finalReason,
    });
    
    handleOpenChange(false);
  };

  const formatCurrency = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(value);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-[rgba(5,6,18,0.95)] border-[rgba(255,255,255,0.1)] max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Scale className="h-5 w-5 text-[#ffc800]" />
            Abrir Disputa
          </DialogTitle>
          <DialogDescription>
            {container && `Container: ${container.numero}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {container && (
            <div className="grid grid-cols-2 gap-2 text-sm bg-[rgba(255,255,255,0.05)] p-3 rounded-lg">
              <div>
                <span className="text-muted-foreground">Cliente:</span>
                <p className="font-medium">{container.cliente || '-'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Armador:</span>
                <p className="font-medium">{container.armador || '-'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Custo Esperado:</span>
                <p className="font-medium">{formatCurrency(container.expected_cost_usd)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Custo Armador:</span>
                <p className="font-medium">{container.armador_cost_usd ? formatCurrency(container.armador_cost_usd) : '-'}</p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="disputedAmount">Valor Disputado (USD)</Label>
            <Input
              id="disputedAmount"
              type="number"
              placeholder="0.00"
              value={disputedAmount}
              onChange={(e) => setDisputedAmount(e.target.value)}
              className="bg-[rgba(255,255,255,0.05)] border-[rgba(255,255,255,0.1)]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Motivo da Disputa</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="bg-[rgba(255,255,255,0.05)] border-[rgba(255,255,255,0.1)]">
                <SelectValue placeholder="Selecione o motivo" />
              </SelectTrigger>
              <SelectContent>
                {DISPUTE_REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {reason === "other" && (
            <div className="space-y-2">
              <Label htmlFor="otherReason">Descreva o motivo</Label>
              <Textarea
                id="otherReason"
                placeholder="Descreva o motivo da disputa..."
                value={otherReason}
                onChange={(e) => setOtherReason(e.target.value)}
                className="bg-[rgba(255,255,255,0.05)] border-[rgba(255,255,255,0.1)]"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} className="border-[rgba(255,255,255,0.2)]">
            Cancelar
          </Button>
          <Button 
            onClick={handleSubmit}
            disabled={!disputedAmount || !reason || (reason === "other" && !otherReason) || isLoading}
            className="bg-[#ffc800] text-black hover:bg-[#e6b400]"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Abrir Disputa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
