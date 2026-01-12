import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, CheckCircle2, TrendingUp, TrendingDown, Minus, DollarSign, Calculator, Ship, Calendar, Package } from "lucide-react";
import { DemurrageContainer, useCreateDemurrageDispute } from "@/hooks/useDemurrageData";
import { toast } from "sonner";

interface AuditCostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  container: DemurrageContainer | null;
  onAudit: (containerId: number, auditData: AuditData) => void;
  isLoading?: boolean;
}

export interface AuditData {
  armador_invoice_number: string;
  armador_cost_usd: number;
  armador_days_charged: number;
  audit_status: 'validated' | 'discrepancy' | 'disputed';
  discrepancy_usd: number;
  audit_notes?: string;
  // For dispute creation
  disputed_amount_usd?: number;
  dispute_reason?: string;
}

export function AuditCostDialog({ open, onOpenChange, container, onAudit, isLoading }: AuditCostDialogProps) {
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [carrierCost, setCarrierCost] = useState<number>(0);
  const [carrierDays, setCarrierDays] = useState<number>(0);
  const [auditNotes, setAuditNotes] = useState("");
  
  const createDispute = useCreateDemurrageDispute();

  useEffect(() => {
    if (container) {
      setInvoiceNumber(container.armador_invoice_number || "");
      setCarrierCost(container.armador_cost_usd || 0);
      setCarrierDays(container.armador_days_charged || container.excedente_dias || 0);
      setAuditNotes("");
    }
  }, [container]);

  const formatCurrency = (value: number) => 
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(value);

  const analysis = useMemo(() => {
    if (!container) return null;

    const calculatedCost = container.expected_cost_usd || 0;
    const calculatedDays = container.excedente_dias || 0;
    const costDiff = carrierCost - calculatedCost;
    const daysDiff = carrierDays - calculatedDays;
    const costDiffPercent = calculatedCost > 0 ? (Math.abs(costDiff) / calculatedCost) * 100 : 0;

    // Tolerance: 5% or $50, whichever is greater
    const tolerance = Math.max(calculatedCost * 0.05, 50);
    const hasDiscrepancy = Math.abs(costDiff) > tolerance || daysDiff !== 0;

    return {
      calculatedCost,
      calculatedDays,
      costDiff,
      daysDiff,
      costDiffPercent,
      hasDiscrepancy,
      isOvercharge: costDiff > 0,
      isUndercharge: costDiff < 0,
    };
  }, [container, carrierCost, carrierDays]);

  const handleValidate = () => {
    if (!container || !analysis) return;
    
    onAudit(container.id, {
      armador_invoice_number: invoiceNumber,
      armador_cost_usd: carrierCost,
      armador_days_charged: carrierDays,
      audit_status: 'validated',
      discrepancy_usd: 0,
      audit_notes: auditNotes || undefined,
    });
  };

  const handleMarkDiscrepancy = () => {
    if (!container || !analysis) return;
    
    onAudit(container.id, {
      armador_invoice_number: invoiceNumber,
      armador_cost_usd: carrierCost,
      armador_days_charged: carrierDays,
      audit_status: 'discrepancy',
      discrepancy_usd: analysis.costDiff,
      audit_notes: auditNotes || undefined,
    });
  };

  const handleOpenDispute = async () => {
    if (!container || !analysis) return;
    
    try {
      // Create dispute in the disputes table
      await createDispute.mutateAsync({
        container_id: container.id,
        container_number: container.numero,
        client_name: container.cliente || undefined,
        armador: container.armador || undefined,
        disputed_amount_usd: analysis.costDiff > 0 ? analysis.costDiff : 0,
        reason: auditNotes || `Discrepância de ${formatCurrency(analysis.costDiff)} detectada na auditoria`,
        success_probability: 70,
      });
      
      // Then call the regular audit callback to update container
      onAudit(container.id, {
        armador_invoice_number: invoiceNumber,
        armador_cost_usd: carrierCost,
        armador_days_charged: carrierDays,
        audit_status: 'disputed',
        discrepancy_usd: analysis.costDiff,
        audit_notes: auditNotes || undefined,
        disputed_amount_usd: analysis.costDiff > 0 ? analysis.costDiff : 0,
        dispute_reason: auditNotes || `Discrepância de ${formatCurrency(analysis.costDiff)} detectada na auditoria`,
      });
      
      toast.success("Disputa aberta com sucesso");
    } catch (error) {
      console.error('Error creating dispute:', error);
      toast.error("Erro ao abrir disputa");
    }
  };

  if (!container) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-[rgba(5,6,18,0.98)] border-[rgba(255,255,255,0.1)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-[#ffc800]" />
            Auditoria de Custo
          </DialogTitle>
          <DialogDescription>
            Compare o valor cobrado pelo armador com o cálculo interno
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Container Info */}
          <Card className="bg-[rgba(0,0,0,0.3)] border-[rgba(255,255,255,0.1)]">
            <CardContent className="pt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-muted-foreground text-xs">Container</p>
                  <p className="font-mono font-medium">{container.numero}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Ship className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-muted-foreground text-xs">Armador</p>
                  <p className="font-medium">{container.armador || '-'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-muted-foreground text-xs">Free Time</p>
                  <p className="font-medium">{container.free_time_days} dias</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-muted-foreground text-xs">Taxa/Dia</p>
                  <p className="font-medium">{formatCurrency(container.rate_usd_per_day || 0)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Carrier Invoice Input */}
          <div className="space-y-3">
            <Label className="text-muted-foreground">Dados da Fatura do Armador</Label>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Nº Fatura</Label>
                <Input
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="INV-00000"
                  className="mt-1 bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]"
                />
              </div>
              <div>
                <Label className="text-xs">Valor Cobrado (USD)</Label>
                <Input
                  type="number"
                  value={carrierCost}
                  onChange={(e) => setCarrierCost(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="mt-1 bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]"
                />
              </div>
              <div>
                <Label className="text-xs">Dias Cobrados</Label>
                <Input
                  type="number"
                  value={carrierDays}
                  onChange={(e) => setCarrierDays(parseInt(e.target.value) || 0)}
                  placeholder="0"
                  className="mt-1 bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]"
                />
              </div>
            </div>
          </div>

          <Separator className="bg-[rgba(255,255,255,0.1)]" />

          {/* Comparison */}
          {analysis && (
            <div className="space-y-3">
              <Label className="text-muted-foreground">Comparação</Label>
              <div className="grid grid-cols-3 gap-4">
                {/* Calculated */}
                <Card className="bg-[rgba(0,0,0,0.3)] border-[rgba(255,255,255,0.1)]">
                  <CardContent className="pt-4 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Valor Calculado</p>
                    <p className="text-lg font-bold text-blue-400">{formatCurrency(analysis.calculatedCost)}</p>
                    <p className="text-xs text-muted-foreground">{analysis.calculatedDays} dias</p>
                  </CardContent>
                </Card>

                {/* Carrier */}
                <Card className="bg-[rgba(0,0,0,0.3)] border-[rgba(255,255,255,0.1)]">
                  <CardContent className="pt-4 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Valor Armador</p>
                    <p className="text-lg font-bold text-[#ffc800]">{formatCurrency(carrierCost)}</p>
                    <p className="text-xs text-muted-foreground">{carrierDays} dias</p>
                  </CardContent>
                </Card>

                {/* Difference */}
                <Card className={`border-[rgba(255,255,255,0.1)] ${
                  analysis.hasDiscrepancy 
                    ? analysis.isOvercharge 
                      ? 'bg-red-500/10' 
                      : 'bg-orange-500/10'
                    : 'bg-green-500/10'
                }`}>
                  <CardContent className="pt-4 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Diferença</p>
                    <div className="flex items-center justify-center gap-1">
                      {analysis.costDiff > 0 ? (
                        <TrendingUp className="h-4 w-4 text-red-400" />
                      ) : analysis.costDiff < 0 ? (
                        <TrendingDown className="h-4 w-4 text-orange-400" />
                      ) : (
                        <Minus className="h-4 w-4 text-green-400" />
                      )}
                      <p className={`text-lg font-bold ${
                        analysis.costDiff > 0 
                          ? 'text-red-400' 
                          : analysis.costDiff < 0 
                            ? 'text-orange-400' 
                            : 'text-green-400'
                      }`}>
                        {analysis.costDiff > 0 ? '+' : ''}{formatCurrency(analysis.costDiff)}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {analysis.daysDiff !== 0 && (
                        <span className={analysis.daysDiff > 0 ? 'text-red-400' : 'text-orange-400'}>
                          {analysis.daysDiff > 0 ? '+' : ''}{analysis.daysDiff} dias
                        </span>
                      )}
                      {analysis.daysDiff === 0 && 'Dias iguais'}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Status Indicator */}
              <div className="flex items-center justify-center gap-2 py-2">
                {analysis.hasDiscrepancy ? (
                  <Badge className="bg-red-500/10 text-red-400 border-red-500/20 py-1 px-3">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Discrepância detectada ({analysis.costDiffPercent.toFixed(1)}% de diferença)
                  </Badge>
                ) : (
                  <Badge className="bg-green-500/10 text-green-400 border-green-500/20 py-1 px-3">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Valores dentro da tolerância (±5% ou $50)
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Observações da Auditoria</Label>
            <Textarea
              value={auditNotes}
              onChange={(e) => setAuditNotes(e.target.value)}
              placeholder="Adicione observações sobre a auditoria..."
              className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)] min-h-[60px]"
            />
          </div>
        </div>

        <DialogFooter className="flex gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="bg-transparent border-[rgba(255,255,255,0.2)] text-muted-foreground hover:bg-[rgba(255,255,255,0.05)]"
          >
            Cancelar
          </Button>
          
          {analysis?.hasDiscrepancy && analysis.isOvercharge && (
            <Button
              onClick={handleOpenDispute}
              disabled={isLoading || createDispute.isPending || !invoiceNumber}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {createDispute.isPending ? (
                <span className="animate-spin h-4 w-4 mr-2 border-2 border-white border-t-transparent rounded-full" />
              ) : (
                <AlertTriangle className="h-4 w-4 mr-2" />
              )}
              Abrir Disputa
            </Button>
          )}
          
          {analysis?.hasDiscrepancy && (
            <Button
              onClick={handleMarkDiscrepancy}
              disabled={isLoading || !invoiceNumber}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              Registrar Discrepância
            </Button>
          )}
          
          <Button
            onClick={handleValidate}
            disabled={isLoading || !invoiceNumber}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Validar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
