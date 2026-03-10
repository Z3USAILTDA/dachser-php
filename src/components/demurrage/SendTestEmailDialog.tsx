import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Mail } from "lucide-react";
import { useSendTestAlert, type PreInvoice } from "@/hooks/useDemurrageData";
import { toast } from "sonner";

interface SendTestEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preInvoice: PreInvoice | null;
}

export function SendTestEmailDialog({ open, onOpenChange, preInvoice }: SendTestEmailDialogProps) {
  const [email, setEmail] = useState("");
  const sendMutation = useSendTestAlert();

  const handleSend = async () => {
    if (!preInvoice || !email.trim()) return;

    try {
      await sendMutation.mutateAsync({
        clientName: preInvoice.client_name || "Teste",
        emails: [email.trim()],
      });
      toast.success("E-mail de teste enviado com sucesso");
      onOpenChange(false);
      setEmail("");
    } catch (error) {
      toast.error("Erro ao enviar e-mail de teste");
    }
  };

  if (!preInvoice) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[rgba(5,6,18,0.95)] border-[rgba(255,255,255,0.1)] max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Mail className="h-5 w-5 text-[#ffc800]" />
            Enviar E-mail de Teste
          </DialogTitle>
          <DialogDescription>
            Pré-Fatura: {preInvoice.invoice_number} • {preInvoice.client_name || "Sem cliente"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-1.5">
            <Label>E-mail Destinatário</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@exemplo.com"
              className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            O e-mail de notificação de demurrage será enviado para o destinatário acima como teste.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="bg-transparent border-[rgba(255,255,255,0.2)]">
            Cancelar
          </Button>
          <Button
            onClick={handleSend}
            disabled={sendMutation.isPending || !email.trim()}
            className="bg-[#ffc800] text-black hover:bg-[#e6b400]"
          >
            {sendMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
