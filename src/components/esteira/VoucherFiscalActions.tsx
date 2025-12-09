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

  const handleAprovar = async () => {
    try {
      setLoading(true);

      const { error } = await (supabase as any)
        .from("vouchers")
        .update({
          etapa_atual: "FINANCEIRO",
          comentarios_fiscal: comentarios || null,
          responsavel_fiscal_user_id: (await supabase.auth.getUser()).data.user?.id,
        })
        .eq("id", voucher.id);

      if (error) throw error;

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

      const { error } = await (supabase as any)
        .from("vouchers")
        .update({
          etapa_atual: "AJUSTE_OPERACAO",
          ajuste_operacao: motivoAjuste,
          comentarios_fiscal: comentarios || null,
          responsavel_fiscal_user_id: (await supabase.auth.getUser()).data.user?.id,
        })
        .eq("id", voucher.id);

      if (error) throw error;

      // Enviar email de notificação
      const { data: userData } = await supabase.auth.getUser();
      const { data: senderProfile } = await (supabase as any)
        .from("profiles")
        .select("name")
        .eq("id", userData.user?.id)
        .maybeSingle();

      const { data: operacaoProfile } = await (supabase as any)
        .from("profiles")
        .select("email")
        .eq("id", voucher.responsavelOperacaoUserId || voucher.criadoPorUserId)
        .maybeSingle();

      if (operacaoProfile?.email) {
        await supabase.functions.invoke("send-notification-email", {
          body: {
            to: operacaoProfile.email,
            voucherId: voucher.id,
            voucherNumber: voucher.numeroSPO,
            fromStage: "FISCAL",
            toStage: "AJUSTE_OPERACAO",
            reason: motivoAjuste,
            senderName: senderProfile?.name || "Fiscal",
          },
        });
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
