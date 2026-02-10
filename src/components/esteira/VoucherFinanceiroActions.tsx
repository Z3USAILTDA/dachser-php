import { useState, useMemo } from "react";
import { Voucher, validarProntoParaRobo } from "@/types/voucher";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, XCircle, AlertTriangle, Loader2, FileWarning } from "lucide-react";
import { ProntidaoChecklist } from "./ProntidaoChecklist";

interface VoucherFinanceiroActionsProps {
  voucher: Voucher;
  onUpdate: () => void;
}

export const VoucherFinanceiroActions = ({ voucher, onUpdate }: VoucherFinanceiroActionsProps) => {
  const [loading, setLoading] = useState(false);
  const [comentarios, setComentarios] = useState(voucher.comentariosFinanceiro || "");
  // Use tipoExecucaoPagamento if already defined, otherwise default to MANUAL
  const tipoBaixa = (voucher.tipoExecucaoPagamento === "REMESSA_10H" || voucher.tipoExecucaoPagamento === "REMESSA_15H") ? "BAIXA_REMESSA" : "BAIXA_MANUAL";
  const [necessitaAjusteOperacao, setNecessitaAjusteOperacao] = useState(false);
  const [necessitaAjusteFiscal, setNecessitaAjusteFiscal] = useState(false);
  const [motivoAjusteOperacao, setMotivoAjusteOperacao] = useState("");
  const [motivoAjusteFiscal, setMotivoAjusteFiscal] = useState("");
  const { toast } = useToast();

  // Validate readiness for ROBO
  const validacao = useMemo(() => validarProntoParaRobo(voucher), [voucher]);
  const isProntoParaRobo = validacao.valido;

  // Get user data from localStorage (MariaDB auth)
  const getUserData = () => {
    const storedUser = localStorage.getItem("user") || localStorage.getItem("dachser_user");
    return storedUser ? JSON.parse(storedUser) : { id: 0, username: "sistema" };
  };

  const handleBaixar = async () => {
    // Gate de validação - bloquear se não estiver pronto para ROBO
    if (!isProntoParaRobo) {
      toast({
        title: "Voucher/SPO não está pronto",
        description: "Complete todas as pendências antes de enviar para o Robô",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      const userData = getUserData();

      // 1. Log extended com origin e payload
      await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "save_voucher_log_extended",
          voucher_id: voucher.id,
          user_id: userData.id?.toString(),
          user_name: userData.username,
          acao: "BAIXADO_FINANCEIRO",
          detalhe: `Voucher baixado (${tipoBaixa}) e enviado para Robô`,
          origin: "UI",
          entity_type: "VOUCHER",
          event_type: "BAIXA",
          payload_json: {
            tipo_baixa: tipoBaixa,
            forma_pagamento: voucher.formaPagamento,
            tipo_execucao: voucher.tipoExecucaoPagamento,
            valor: voucher.valor,
            vencimento: voucher.vencimento,
            linha_digitavel: voucher.linhaDigitavel,
            codigo_barras: voucher.codigoBarras,
          },
        },
      });

      // 2. Para BAIXA_REMESSA, inserir em t_dados_rm
      if (tipoBaixa === "BAIXA_REMESSA") {
        await supabase.functions.invoke("mariadb-proxy", {
          body: {
            action: "insert_dados_rm",
            id_rm: voucher.idRm || voucher.numeroSPO, // Usar idRm de t_dados_financeiro_voucher se disponível
            voucher_boleto: voucher.linhaDigitavel || voucher.codigoBarras || null,
            chave_pix: voucher.chavePix || null,
            pix_tipo_chave: null, // Could be derived from chavePix format if needed
            forma_pag: voucher.formaPagamento,
            fornecedor: voucher.fornecedor,
            cnpj_fornecedor: voucher.cnpjFornecedor,
          },
        });

        // 3. Atualizar status_integracao_rm
        await supabase.functions.invoke("mariadb-proxy", {
          body: {
            action: "update_status_integracao_rm",
            voucher_id: voucher.id,
            status_integracao_rm: "ENVIADO_T_DADOS_RM",
          },
        });
      }

      // 4. Update voucher - avançar para ROBO
      const { error } = await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "update_voucher_esteira",
          voucher_id: voucher.id,
          etapa_atual: "ROBO",
          status_baixa: tipoBaixa,
          comentarios_financeiro: comentarios || null,
          responsavel_financeiro_user_id: userData.id?.toString(),
          is_pronto_para_robo: true,
        },
      });

      if (error) throw error;

      toast({
        title: "Voucher/SPO baixado!",
        description: tipoBaixa === "BAIXA_REMESSA" 
          ? "Voucher/SPO enviado para Robô e dados enviados ao RM" 
          : "Voucher/SPO enviado para processamento do Robô",
      });

      onUpdate();
    } catch (error: any) {
      toast({
        title: "Erro ao baixar voucher/SPO",
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
      const userData = getUserData();

      // Update voucher in MariaDB
      const { error } = await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "update_voucher_esteira",
          voucher_id: voucher.id,
          etapa_atual: "AJUSTE_OPERACAO",
          ajuste_operacao: motivoAjusteOperacao,
          comentarios_financeiro: comentarios || null,
          responsavel_financeiro_user_id: userData.id?.toString(),
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
          acao: "DEVOLVIDO_FINANCEIRO_OP",
          detalhe: `Devolvido para Operação: ${motivoAjusteOperacao}`,
        },
      });

      // Try to send notification email (optional)
      try {
        await supabase.functions.invoke("send-voucher-notification", {
          body: {
            voucherId: voucher.id,
            voucherNumber: voucher.numeroSPO,
            fromStage: "FINANCEIRO",
            toStage: "AJUSTE_OPERACAO",
            reason: motivoAjusteOperacao,
            senderName: userData.username,
          },
        });
      } catch (emailErr) {
        console.log("Email notification skipped:", emailErr);
      }

      toast({
        title: "Voucher/SPO devolvido",
        description: "Voucher/SPO devolvido para Operação",
      });

      onUpdate();
    } catch (error: any) {
      toast({
        title: "Erro ao devolver voucher/SPO",
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
      const userData = getUserData();

      // Update voucher in MariaDB
      const { error } = await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "update_voucher_esteira",
          voucher_id: voucher.id,
          etapa_atual: "AJUSTE_FISCAL",
          ajuste_fiscal: motivoAjusteFiscal,
          comentarios_financeiro: comentarios || null,
          responsavel_financeiro_user_id: userData.id?.toString(),
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
          acao: "DEVOLVIDO_FINANCEIRO_FISCAL",
          detalhe: `Devolvido para Fiscal: ${motivoAjusteFiscal}`,
        },
      });

      // Try to send notification email (optional)
      try {
        await supabase.functions.invoke("send-voucher-notification", {
          body: {
            voucherId: voucher.id,
            voucherNumber: voucher.numeroSPO,
            fromStage: "FINANCEIRO",
            toStage: "AJUSTE_FISCAL",
            reason: motivoAjusteFiscal,
            senderName: userData.username,
          },
        });
      } catch (emailErr) {
        console.log("Email notification skipped:", emailErr);
      }

      toast({
        title: "Voucher/SPO devolvido",
        description: "Voucher/SPO devolvido para Fiscal",
      });

      onUpdate();
    } catch (error: any) {
      toast({
        title: "Erro ao devolver voucher/SPO",
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
          Revise e processe a baixa do voucher/SPO
        </p>
      </div>

      {/* Alerta ADF - Documento Fiscal Informativo (não bloqueante) */}
      {voucher.tipoDocumento === 'ADF' && voucher.statusDocumentoFiscal === 'PENDENTE' && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <FileWarning className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-amber-600 dark:text-amber-400">
              ADF - Documento Fiscal Opcional
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Este voucher é do tipo ADF. O documento fiscal pode ser anexado na aba "Anexos", 
              mas não é obrigatório para seguir na esteira.
            </p>
          </div>
        </div>
      )}

      {/* Checklist de Prontidão */}
      <div className="p-4 rounded-lg bg-secondary/30 border border-border">
        <ProntidaoChecklist voucher={voucher} />
      </div>

      <div className="space-y-4">
        {!isDevolvendo && (
          <div className="space-y-2">
            <Label>Tipo de Baixa</Label>
            <div className="p-3 rounded-lg bg-muted/50 border border-border">
              <span className="font-medium">
                {tipoBaixa === "BAIXA_REMESSA" ? "Baixa por Remessa" : "Baixa Manual"}
              </span>
              <p className="text-xs text-muted-foreground mt-1">
                {tipoBaixa === "BAIXA_REMESSA" 
                  ? "Os dados serão enviados para o setor especializado gerar a remessa bancária"
                  : "Processamento manual do pagamento"}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              ⓘ O tipo de execução é definido na aba de Pagamentos
            </p>
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
            disabled={loading || !isProntoParaRobo}
            className="gap-2 bg-primary hover:bg-primary/90"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isProntoParaRobo ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
            {isProntoParaRobo ? "Baixar Voucher/SPO" : "Pendências para Baixar"}
          </Button>
        )}
      </div>
    </div>
  );
};