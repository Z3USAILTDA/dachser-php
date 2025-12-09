import { useState } from "react";
import { Voucher } from "@/types/voucher";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, XCircle } from "lucide-react";

interface VoucherFinanceiroActionsProps {
  voucher: Voucher;
  onUpdate: () => void;
}

export const VoucherFinanceiroActions = ({ voucher, onUpdate }: VoucherFinanceiroActionsProps) => {
  const [loading, setLoading] = useState(false);
  const [comentarios, setComentarios] = useState(voucher.comentariosFinanceiro || "");
  const [tipoBaixa, setTipoBaixa] = useState<"BAIXA_MANUAL" | "BAIXA_REMESSA">("BAIXA_MANUAL");
  const [necessitaAjusteOperacao, setNecessitaAjusteOperacao] = useState(false);
  const [necessitaAjusteFiscal, setNecessitaAjusteFiscal] = useState(false);
  const [motivoAjusteOperacao, setMotivoAjusteOperacao] = useState("");
  const [motivoAjusteFiscal, setMotivoAjusteFiscal] = useState("");
  const { toast } = useToast();

  const handleBaixar = async () => {
    try {
      setLoading(true);

      const { error } = await (supabase as any)
        .from("vouchers")
        .update({
          etapa_atual: "ROBO",
          status_baixa: tipoBaixa,
          comentarios_financeiro: comentarios || null,
          responsavel_financeiro_user_id: (await supabase.auth.getUser()).data.user?.id,
        })
        .eq("id", voucher.id);

      if (error) throw error;

      toast({
        title: "Voucher baixado!",
        description: "Voucher enviado para processamento do Robô",
      });

      onUpdate();
    } catch (error: any) {
      toast({
        title: "Erro ao baixar voucher",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDevolverOperacao = async () => {
    if (!motivoAjusteOperacao.trim()) {
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
          ajuste_operacao: motivoAjusteOperacao,
          comentarios_financeiro: comentarios || null,
          responsavel_financeiro_user_id: (await supabase.auth.getUser()).data.user?.id,
        })
        .eq("id", voucher.id);

      if (error) throw error;

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
            fromStage: "FINANCEIRO",
            toStage: "AJUSTE_OPERACAO",
            reason: motivoAjusteOperacao,
            senderName: senderProfile?.name || "Financeiro",
          },
        });
      }

      toast({
        title: "Voucher devolvido",
        description: "Voucher devolvido para Operação",
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

  const handleDevolverFiscal = async () => {
    if (!motivoAjusteFiscal.trim()) {
      toast({
        title: "Motivo obrigatório",
        description: "Informe o motivo da devolução para o Fiscal",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);

      const { error } = await (supabase as any)
        .from("vouchers")
        .update({
          etapa_atual: "AJUSTE_FISCAL",
          ajuste_fiscal: motivoAjusteFiscal,
          comentarios_financeiro: comentarios || null,
          responsavel_financeiro_user_id: (await supabase.auth.getUser()).data.user?.id,
        })
        .eq("id", voucher.id);

      if (error) throw error;

      const { data: userData } = await supabase.auth.getUser();
      const { data: senderProfile } = await (supabase as any)
        .from("profiles")
        .select("name")
        .eq("id", userData.user?.id)
        .maybeSingle();

      const { data: fiscalProfile } = await (supabase as any)
        .from("profiles")
        .select("email")
        .eq("id", voucher.responsavelFiscalUserId)
        .maybeSingle();

      if (fiscalProfile?.email) {
        await supabase.functions.invoke("send-notification-email", {
          body: {
            to: fiscalProfile.email,
            voucherId: voucher.id,
            voucherNumber: voucher.numeroSPO,
            fromStage: "FINANCEIRO",
            toStage: "AJUSTE_FISCAL",
            reason: motivoAjusteFiscal,
            senderName: senderProfile?.name || "Financeiro",
          },
        });
      }

      toast({
        title: "Voucher devolvido",
        description: "Voucher devolvido para Fiscal",
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

  const isDevolvendo = necessitaAjusteOperacao || necessitaAjusteFiscal;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">Ações - Financeiro</h3>
        <p className="text-sm text-muted-foreground">
          Revise e processe a baixa do voucher
        </p>
      </div>

      <div className="space-y-4">
        {!isDevolvendo && (
          <div className="space-y-2">
            <Label>Tipo de Baixa</Label>
            <Select value={tipoBaixa} onValueChange={(v: any) => setTipoBaixa(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BAIXA_MANUAL">Baixa Manual</SelectItem>
                <SelectItem value="BAIXA_REMESSA">Baixa por Remessa</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="comentarios-financeiro">Comentários Financeiro</Label>
          <Textarea
            id="comentarios-financeiro"
            value={comentarios}
            onChange={(e) => setComentarios(e.target.value)}
            placeholder="Observações sobre o processamento financeiro..."
            rows={3}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="ajuste-operacao"
              checked={necessitaAjusteOperacao}
              onCheckedChange={(checked) => {
                setNecessitaAjusteOperacao(checked as boolean);
                if (checked) setNecessitaAjusteFiscal(false);
              }}
            />
            <Label htmlFor="ajuste-operacao" className="cursor-pointer">
              Necessita ajuste da Operação?
            </Label>
          </div>

          {voucher.cobrancaEmNomeDe === "DACHSER" && (
            <div className="flex items-center space-x-2">
              <Checkbox
                id="ajuste-fiscal"
                checked={necessitaAjusteFiscal}
                onCheckedChange={(checked) => {
                  setNecessitaAjusteFiscal(checked as boolean);
                  if (checked) setNecessitaAjusteOperacao(false);
                }}
              />
              <Label htmlFor="ajuste-fiscal" className="cursor-pointer">
                Necessita ajuste do Fiscal?
              </Label>
            </div>
          )}
        </div>

        {necessitaAjusteOperacao && (
          <div className="space-y-2">
            <Label htmlFor="motivo-ajuste-op">
              Motivo do Ajuste (Operação) <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="motivo-ajuste-op"
              value={motivoAjusteOperacao}
              onChange={(e) => setMotivoAjusteOperacao(e.target.value)}
              placeholder="Descreva o que precisa ser ajustado pela Operação..."
              rows={3}
              className="border-orange-500/50"
            />
          </div>
        )}

        {necessitaAjusteFiscal && (
          <div className="space-y-2">
            <Label htmlFor="motivo-ajuste-fiscal">
              Motivo do Ajuste (Fiscal) <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="motivo-ajuste-fiscal"
              value={motivoAjusteFiscal}
              onChange={(e) => setMotivoAjusteFiscal(e.target.value)}
              placeholder="Descreva o que precisa ser ajustado pelo Fiscal..."
              rows={3}
              className="border-orange-500/50"
            />
          </div>
        )}
      </div>

      <div className="flex gap-3">
        {necessitaAjusteOperacao ? (
          <Button
            onClick={handleDevolverOperacao}
            disabled={loading}
            variant="outline"
            className="gap-2 border-orange-500 text-orange-500 hover:bg-orange-500/10"
          >
            <XCircle className="h-4 w-4" />
            Devolver para Operação
          </Button>
        ) : necessitaAjusteFiscal ? (
          <Button
            onClick={handleDevolverFiscal}
            disabled={loading}
            variant="outline"
            className="gap-2 border-orange-500 text-orange-500 hover:bg-orange-500/10"
          >
            <XCircle className="h-4 w-4" />
            Devolver para Fiscal
          </Button>
        ) : (
          <Button
            onClick={handleBaixar}
            disabled={loading}
            className="gap-2 bg-primary hover:bg-primary/90"
          >
            <CheckCircle2 className="h-4 w-4" />
            Baixar Voucher
          </Button>
        )}
      </div>
    </div>
  );
};
