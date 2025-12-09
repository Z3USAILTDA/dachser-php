import { useState } from "react";
import { Voucher } from "@/types/voucher";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Send } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface VoucherOperacaoActionsProps {
  voucher: Voucher;
  onUpdate: () => void;
}

export const VoucherOperacaoActions = ({ voucher, onUpdate }: VoucherOperacaoActionsProps) => {
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const { toast } = useToast();

  const handleEnviar = async () => {
    try {
      setLoading(true);

      // Verificar anexos obrigatórios
      const hasFatura = voucher.anexos.some(a => a.tipo === "FATURA_DEMONSTRATIVO");
      const hasBoleto = voucher.anexos.some(a => a.tipo === "BOLETO_INSTRUCOES");

      if (!hasFatura || !hasBoleto) {
        toast({
          title: "Anexos obrigatórios faltando",
          description: "É necessário anexar Fatura/Demonstrativo e Boleto/Instruções",
          variant: "destructive",
        });
        return;
      }

      // Determinar próxima etapa baseado em urgência e cobrança
      let proximaEtapa: "FISCAL" | "FINANCEIRO" | "SUPERVISOR";
      
      if (voucher.urgenciaTipo === "URGENTE_REAL") {
        proximaEtapa = "SUPERVISOR";
      } else if (voucher.cobrancaEmNomeDe === "DACHSER") {
        proximaEtapa = "FISCAL";
      } else {
        proximaEtapa = "FINANCEIRO";
      }

      const { error } = await (supabase as any)
        .from("vouchers")
        .update({
          etapa_atual: proximaEtapa,
          status_envio_cliente: voucher.cobrancaEmNomeDe === "CLIENTE" ? "AGUARDANDO_CLIENTE" : "NAO_APLICA",
        })
        .eq("id", voucher.id);

      if (error) throw error;

      const etapaLabel = proximaEtapa === "SUPERVISOR" ? "Supervisor" : 
                         proximaEtapa === "FISCAL" ? "Fiscal" : "Financeiro";

      toast({
        title: "Voucher enviado!",
        description: `Voucher enviado para ${etapaLabel}`,
      });

      onUpdate();
    } catch (error: any) {
      toast({
        title: "Erro ao enviar voucher",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setShowConfirm(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Ações - Operação</h3>
          <p className="text-sm text-muted-foreground">
            Revise os dados e anexos antes de enviar
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        <Button
          onClick={() => setShowConfirm(true)}
          disabled={loading}
          className="gap-2 bg-primary hover:bg-primary/90"
        >
          <Send className="h-4 w-4" />
          {voucher.cobrancaEmNomeDe === "DACHSER" ? "Enviar para Fiscal" : "Enviar para Financeiro"}
        </Button>
      </div>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar envio</AlertDialogTitle>
            <AlertDialogDescription>
              Após o envio, os campos da operação serão bloqueados para edição
              {voucher.formaPagamento === "ADF" && " (exceto para ADF)"}.
              {voucher.cobrancaEmNomeDe === "CLIENTE" && 
                " Um email será enviado para o cliente notificando sobre o voucher."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleEnviar} disabled={loading}>
              {loading ? "Enviando..." : "Confirmar Envio"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
