import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, CheckCircle2, AlertTriangle, Calculator } from "lucide-react";
import type { DemurrageContainer } from "@/hooks/useDemurrageData";
import { useUpdateDemurrageContainer } from "@/hooks/useDemurrageData";
import { toast } from "sonner";

interface BulkAuditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  containers: DemurrageContainer[];
  onSuccess?: () => void;
}

export function BulkAuditDialog({ 
  open, 
  onOpenChange, 
  containers,
  onSuccess
}: BulkAuditDialogProps) {
  const [auditStatus, setAuditStatus] = useState<string>("validated");
  const [notes, setNotes] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  const updateContainer = useUpdateDemurrageContainer();

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      for (const container of containers) {
        await updateContainer.mutateAsync({
          containerId: container.id,
          updates: {
            audit_status: auditStatus,
            notes: notes || null,
          },
        });
      }
      toast.success(`${containers.length} containers atualizados com sucesso`);
      setNotes("");
      setAuditStatus("validated");
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast.error("Erro ao processar auditoria em lote");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (value: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(value);

  const totalCalculated = containers.reduce((sum, c) => sum + c.expected_cost_usd, 0);
  const totalCarrier = containers.reduce((sum, c) => sum + (c.armador_cost_usd || 0), 0);
  const totalDiff = totalCarrier - totalCalculated;

  const withinTolerance = containers.filter(c => {
    const diff = Math.abs((c.armador_cost_usd || 0) - c.expected_cost_usd);
    const tolerance = Math.max(c.expected_cost_usd * 0.05, 50);
    return diff <= tolerance;
  }).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] bg-[#0a0a0a] border-[rgba(255,255,255,0.1)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#ffc800]">
            <Calculator className="h-5 w-5" />
            Auditoria em Lote
          </DialogTitle>
          <DialogDescription>
            Processar {containers.length} containers selecionados
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.1)] text-center">
              <p className="text-xs text-muted-foreground">Containers</p>
              <p className="text-xl font-bold text-foreground">{containers.length}</p>
            </div>
            <div className="p-3 rounded-lg bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.1)] text-center">
              <p className="text-xs text-muted-foreground">Total Calculado</p>
              <p className="text-lg font-bold text-blue-400">{formatCurrency(totalCalculated)}</p>
            </div>
            <div className="p-3 rounded-lg bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.1)] text-center">
              <p className="text-xs text-muted-foreground">Total Armador</p>
              <p className="text-lg font-bold text-[#ffc800]">{formatCurrency(totalCarrier)}</p>
            </div>
          </div>

          {/* Tolerance Info */}
          <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-blue-400" />
              <span className="text-sm">
                <strong>{withinTolerance}</strong> de {containers.length} estão dentro da tolerância (5% ou $50)
              </span>
            </div>
          </div>

          {/* Difference */}
          {totalCarrier > 0 && (
            <div className={`p-3 rounded-lg border ${
              Math.abs(totalDiff) <= totalCalculated * 0.05 
                ? "bg-green-500/10 border-green-500/20" 
                : totalDiff > 0 
                  ? "bg-red-500/10 border-red-500/20"
                  : "bg-yellow-500/10 border-yellow-500/20"
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Diferença Total</span>
                <Badge variant={totalDiff > 0 ? "destructive" : "secondary"}>
                  {totalDiff > 0 ? "+" : ""}{formatCurrency(totalDiff)}
                </Badge>
              </div>
            </div>
          )}

          {/* Action Selection */}
          <div className="space-y-3">
            <Label>Ação para todos os containers selecionados</Label>
            <RadioGroup value={auditStatus} onValueChange={setAuditStatus} className="space-y-2">
              <div className="flex items-center space-x-3 p-3 rounded-lg bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.1)]">
                <RadioGroupItem value="validated" id="validated" />
                <Label htmlFor="validated" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400" />
                    <span>Validar todos</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Marcar como valores conferidos e corretos
                  </p>
                </Label>
              </div>
              <div className="flex items-center space-x-3 p-3 rounded-lg bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.1)]">
                <RadioGroupItem value="discrepancy" id="discrepancy" />
                <Label htmlFor="discrepancy" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-400" />
                    <span>Marcar discrepância</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Identificar diferenças para análise
                  </p>
                </Label>
              </div>
              <div className="flex items-center space-x-3 p-3 rounded-lg bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.1)]">
                <RadioGroupItem value="pending" id="pending" />
                <Label htmlFor="pending" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">○</span>
                    <span>Retornar para pendente</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Limpar status de auditoria
                  </p>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Observações (opcional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Adicione notas sobre esta auditoria em lote..."
              rows={3}
              className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSubmit}
            disabled={isLoading}
            className="bg-[#ffc800] text-black hover:bg-[#e6b400]"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processando...
              </>
            ) : (
              <>
                <Calculator className="h-4 w-4 mr-2" />
                Aplicar a {containers.length} containers
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
