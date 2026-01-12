import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FileText, Loader2 } from "lucide-react";
import { DemurrageContainer } from "@/hooks/useDemurrageData";

interface NewInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  containers: DemurrageContainer[];
  onSubmit: (data: {
    containerId: number;
    armador_invoice_number: string;
    armador_cost_usd: number;
    armador_days_charged: number;
    notes?: string;
  }) => Promise<void>;
  isLoading?: boolean;
}

export function NewInvoiceDialog({ open, onOpenChange, containers, onSubmit, isLoading }: NewInvoiceDialogProps) {
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [costUsd, setCostUsd] = useState("");
  const [daysCharged, setDaysCharged] = useState("");
  const [selectedContainerId, setSelectedContainerId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Filter containers that don't have an invoice yet
  const availableContainers = containers.filter(c => !c.armador_invoice_number);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!invoiceNumber.trim()) {
      newErrors.invoiceNumber = "Número da fatura é obrigatório";
    }
    
    const cost = parseFloat(costUsd);
    if (isNaN(cost) || cost <= 0) {
      newErrors.costUsd = "Valor deve ser maior que zero";
    }
    
    const days = parseInt(daysCharged);
    if (isNaN(days) || days <= 0) {
      newErrors.daysCharged = "Dias deve ser maior que zero";
    }
    
    if (!selectedContainerId) {
      newErrors.containerId = "Selecione um container";
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    
    await onSubmit({
      containerId: parseInt(selectedContainerId),
      armador_invoice_number: invoiceNumber.trim().toUpperCase(),
      armador_cost_usd: parseFloat(costUsd),
      armador_days_charged: parseInt(daysCharged),
      notes: notes.trim() || undefined,
    });
    
    // Reset form
    setInvoiceNumber("");
    setCostUsd("");
    setDaysCharged("");
    setSelectedContainerId("");
    setNotes("");
    setErrors({});
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setErrors({});
    }
    onOpenChange(newOpen);
  };

  const selectedContainer = containers.find(c => c.id === parseInt(selectedContainerId));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-[rgba(5,6,18,0.95)] border-[rgba(255,255,255,0.1)] max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <FileText className="h-5 w-5 text-[#ffc800]" />
            Nova Fatura de Armador
          </DialogTitle>
          <DialogDescription>
            Registre uma fatura recebida do armador para auditoria
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Container Selection */}
          <div className="space-y-2">
            <Label>Container *</Label>
            <Select value={selectedContainerId} onValueChange={setSelectedContainerId}>
              <SelectTrigger className={`bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)] ${errors.containerId ? 'border-red-500' : ''}`}>
                <SelectValue placeholder="Selecione o container" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {availableContainers.length === 0 ? (
                  <SelectItem value="none" disabled>Nenhum container disponível</SelectItem>
                ) : (
                  availableContainers.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      <span className="font-mono">{c.numero}</span>
                      <span className="text-muted-foreground ml-2">- {c.cliente || c.armador || 'Sem cliente'}</span>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {errors.containerId && <p className="text-xs text-red-400">{errors.containerId}</p>}
            
            {/* Show container info if selected */}
            {selectedContainer && (
              <div className="text-xs text-muted-foreground bg-[rgba(255,255,255,0.05)] p-2 rounded">
                <p>Armador: <span className="text-foreground">{selectedContainer.armador || '-'}</span></p>
                <p>Custo Calculado: <span className="text-foreground">${selectedContainer.expected_cost_usd?.toFixed(2) || '0.00'}</span></p>
                <p>Dias Excedentes: <span className="text-foreground">{selectedContainer.excedente_dias || 0}</span></p>
              </div>
            )}
          </div>

          {/* Invoice Number */}
          <div className="space-y-2">
            <Label>Número da Fatura *</Label>
            <Input
              value={invoiceNumber}
              onChange={(e) => {
                setInvoiceNumber(e.target.value);
                if (errors.invoiceNumber) setErrors(prev => ({ ...prev, invoiceNumber: '' }));
              }}
              placeholder="Ex: INV-2024-001234"
              className={`bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)] ${errors.invoiceNumber ? 'border-red-500' : ''}`}
            />
            {errors.invoiceNumber && <p className="text-xs text-red-400">{errors.invoiceNumber}</p>}
          </div>

          {/* Cost and Days in a row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Valor USD *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={costUsd}
                onChange={(e) => {
                  setCostUsd(e.target.value);
                  if (errors.costUsd) setErrors(prev => ({ ...prev, costUsd: '' }));
                }}
                placeholder="0.00"
                className={`bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)] ${errors.costUsd ? 'border-red-500' : ''}`}
              />
              {errors.costUsd && <p className="text-xs text-red-400">{errors.costUsd}</p>}
            </div>
            <div className="space-y-2">
              <Label>Dias Cobrados *</Label>
              <Input
                type="number"
                min="1"
                value={daysCharged}
                onChange={(e) => {
                  setDaysCharged(e.target.value);
                  if (errors.daysCharged) setErrors(prev => ({ ...prev, daysCharged: '' }));
                }}
                placeholder="0"
                className={`bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)] ${errors.daysCharged ? 'border-red-500' : ''}`}
              />
              {errors.daysCharged && <p className="text-xs text-red-400">{errors.daysCharged}</p>}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observações opcionais sobre esta fatura..."
              className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)] min-h-[80px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={isLoading || availableContainers.length === 0}
            className="bg-[#ffc800] text-black hover:bg-[#e6b400]"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              'Registrar Fatura'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
