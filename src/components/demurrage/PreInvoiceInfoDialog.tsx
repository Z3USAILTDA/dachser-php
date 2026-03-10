import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save } from "lucide-react";
import { useUpdatePreInvoice, type PreInvoice } from "@/hooks/useDemurrageData";
import { toast } from "sonner";

const STATUS_OPTIONS = [
  "DISPUTA",
  "CONCLUIDO",
  "A FATURAR",
  "EM ANALISE CLIENTE",
  "FATURADO",
  "PREJUIZO",
  "CANCELADO",
  "NOTIFICAR",
] as const;

const STATUS_OTHELLO_MAP: Record<string, string | null> = {
  'DISPUTA': 'VALUE',
  'CONCLUIDO': 'INVOICED',
  'A FATURAR': 'RELEASE',
  'EM ANALISE CLIENTE': 'VALUE',
  'FATURADO': 'RELEASE',
  'PREJUIZO': null,
  'CANCELADO': null,
  'NOTIFICAR': 'VALUE',
};

interface PreInvoiceInfoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preInvoice: PreInvoice | null;
}

export function PreInvoiceInfoDialog({ open, onOpenChange, preInvoice }: PreInvoiceInfoDialogProps) {
  const [statusInfo, setStatusInfo] = useState("");
  const [misk, setMisk] = useState("");
  const [observacao, setObservacao] = useState("");
  const [othelloRegistro, setOthelloRegistro] = useState<string | null>(null);
  const [exchangeRate, setExchangeRate] = useState<string>("");

  const updateMutation = useUpdatePreInvoice();

  useEffect(() => {
    if (preInvoice && open) {
      const pi = preInvoice as any;
      setStatusInfo(pi.status_info || "");
      setMisk(pi.misk || "");
      setObservacao(pi.observacao || "");
      setOthelloRegistro(pi.othello_registro || null);
      setExchangeRate(pi.exchange_rate ? String(pi.exchange_rate) : "");
    }
  }, [preInvoice, open]);

  useEffect(() => {
    if (statusInfo) {
      setOthelloRegistro(STATUS_OTHELLO_MAP[statusInfo] ?? null);
    }
  }, [statusInfo]);

  const handleSave = async () => {
    if (!preInvoice) return;
    try {
      await updateMutation.mutateAsync({
        invoiceId: preInvoice.id,
        updates: {
          status_info: statusInfo || null,
          misk: misk || null,
          observacao: observacao || null,
          othello_registro: othelloRegistro,
        }
      });
      toast.success("Informações atualizadas com sucesso");
      onOpenChange(false);
    } catch (error) {
      toast.error("Erro ao atualizar informações");
    }
  };

  if (!preInvoice) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[rgba(5,6,18,0.95)] border-[rgba(255,255,255,0.1)] max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            Informações - {preInvoice.invoice_number}
          </DialogTitle>
          <DialogDescription>
            {preInvoice.client_name || "Sem cliente"} • {preInvoice.shipment_mbl || "Sem MBL"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={statusInfo} onValueChange={setStatusInfo}>
              <SelectTrigger className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]">
                <SelectValue placeholder="Selecione o status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Registro Othello</Label>
            <Input
              value={othelloRegistro || ""}
              readOnly
              placeholder={statusInfo && !othelloRegistro ? "Nulo" : "Selecione um status"}
              className="bg-[rgba(0,0,0,0.3)] border-[rgba(255,255,255,0.1)] text-muted-foreground cursor-not-allowed"
            />
          </div>

          <div className="space-y-1.5">
            <Label>MISK</Label>
            <Input
              value={misk}
              onChange={(e) => setMisk(e.target.value)}
              placeholder="Código MISK"
              className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]"
              maxLength={100}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Observação</Label>
            <Textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Observações adicionais..."
              className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)] min-h-[100px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="bg-transparent border-[rgba(255,255,255,0.2)]">
            Cancelar
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={updateMutation.isPending}
            className="bg-[#ffc800] text-black hover:bg-[#e6b400]"
          >
            {updateMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
