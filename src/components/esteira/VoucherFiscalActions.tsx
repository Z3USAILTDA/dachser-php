import { useState } from "react";
import { Voucher } from "@/types/voucher";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, XCircle } from "lucide-react";

interface VoucherFiscalActionsProps {
  voucher: Voucher;
  onUpdate: () => void;
}

export const VoucherFiscalActions = ({ voucher, onUpdate }: VoucherFiscalActionsProps) => {
  const [loading, setLoading] = useState(false);
  const [comentarios, setComentarios] = useState(voucher.comentariosFiscal || "");
  const [necessitaAjuste, setNecessitaAjuste] = useState(false);
  const [motivoAjuste, setMotivoAjuste] = useState("");
  const { toast } = useToast();

  // Get user data from localStorage (MariaDB auth)
  const getUserData = () => {
    const storedUser = localStorage.getItem("user") || localStorage.getItem("dachser_user");
    return storedUser ? JSON.parse(storedUser) : { id: 0, username: "sistema" };
  };

  const handleAprovar = async () => {
    try {
      setLoading(true);
      const userData = getUserData();

      // Update voucher in MariaDB
      const { error } = await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "update_voucher_esteira",
          voucher_id: voucher.id,
          etapa_atual: "FINANCEIRO",
          comentarios_fiscal: comentarios || null,
          responsavel_fiscal_user_id: userData.id?.toString(),
        },
      });

      if (error) throw error;

      // Log the action
      await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "save_voucher_log",
          voucher_id: voucher.id,
          user_id: userData.id?.toString(),
          user_name: userData.username,
          acao: "APROVADO_FISCAL",
          detalhe: "Voucher aprovado pelo Fiscal e enviado para Financeiro",
        },
      });

      toast({
        title: "Voucher aprovado!",
        description: "Voucher enviado para Financeiro",
      });

      onUpdate();
    } catch (error: any) {
      toast({
        title: "Erro ao aprovar voucher",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDevolver = async () => {
    if (!motivoAjuste.trim()) {
      toast({
        title: "Motivo obrigatório",
        description: "Informe o motivo da devolução para a Operação",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      const userData = getUserData();

      // Update voucher in MariaDB
      const { error } = await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "update_voucher_esteira",
          voucher_id: voucher.id,
          etapa_atual: "AJUSTE_OPERACAO",
          ajuste_operacao: motivoAjuste,
          comentarios_fiscal: comentarios || null,
          responsavel_fiscal_user_id: userData.id?.toString(),
        },
      });

      if (error) throw error;

      // Log the action
      await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "save_voucher_log",
          voucher_id: voucher.id,
          user_id: userData.id?.toString(),
          user_name: userData.username,
          acao: "DEVOLVIDO_FISCAL",
          detalhe: `Devolvido para Operação: ${motivoAjuste}`,
        },
      });

      // Try to send notification email (optional - may fail silently)
      try {
        await supabase.functions.invoke("send-voucher-notification", {
          body: {
            voucherId: voucher.id,
            voucherNumber: voucher.numeroSPO,
            fromStage: "FISCAL",
            toStage: "AJUSTE_OPERACAO",
            reason: motivoAjuste,
            senderName: userData.username,
          },
        });
      } catch (emailErr) {
        console.log("Email notification skipped:", emailErr);
      }

      toast({
        title: "Voucher devolvido",
        description: "Voucher devolvido para Operação para ajustes",
      });

      onUpdate();
    } catch (error: any) {
      toast({
        title: "Erro ao devolver voucher",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">Ações - Fiscal</h3>
        <p className="text-sm text-muted-foreground">
          Revise os dados e documentos da Operação
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="comentarios-fiscal">Comentários Fiscal</Label>
          <Textarea
            id="comentarios-fiscal"
            value={comentarios}
            onChange={(e) => setComentarios(e.target.value)}
            placeholder="Observações sobre a análise fiscal..."
            rows={3}
          />
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="necessita-ajuste"
            checked={necessitaAjuste}
            onCheckedChange={(checked) => setNecessitaAjuste(checked as boolean)}
          />
          <Label htmlFor="necessita-ajuste" className="cursor-pointer">
            Necessita ajuste da Operação?
          </Label>
        </div>

        {necessitaAjuste && (
          <div className="space-y-2">
            <Label htmlFor="motivo-ajuste">
              Motivo do Ajuste <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="motivo-ajuste"
              value={motivoAjuste}
              onChange={(e) => setMotivoAjuste(e.target.value)}
              placeholder="Descreva detalhadamente o que precisa ser ajustado..."
              rows={3}
              className="border-orange-500/50"
            />
          </div>
        )}
      </div>

      <div className="flex gap-3">
        {necessitaAjuste ? (
          <Button
            onClick={handleDevolver}
            disabled={loading}
            variant="outline"
            className="gap-2 border-orange-500 text-orange-500 hover:bg-orange-500/10"
          >
            <XCircle className="h-4 w-4" />
            Devolver para Operação
          </Button>
        ) : (
          <Button
            onClick={handleAprovar}
            disabled={loading}
            className="gap-2 bg-primary hover:bg-primary/90"
          >
            <CheckCircle2 className="h-4 w-4" />
            Aprovar e Enviar para Financeiro
          </Button>
        )}
      </div>
    </div>
  );
};
