import { useState, useMemo, useEffect } from "react";
import { Voucher, validarProntoParaRobo } from "@/types/voucher";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, XCircle, AlertTriangle, Loader2, FileWarning } from "lucide-react";
import { ProntidaoChecklist } from "./ProntidaoChecklist";
import { buildAjusteWithRequester } from "@/utils/voucherAjusteRouting";
import { sendVoucherReturnNotification } from "@/utils/voucherReturnNotification";

interface VoucherFinanceiroActionsProps {
  voucher: Voucher;
  onUpdate: () => void;
}

export const VoucherFinanceiroActions = ({ voucher, onUpdate }: VoucherFinanceiroActionsProps) => {
  const [loading, setLoading] = useState(false);
  const [comentarios, setComentarios] = useState(voucher.comentariosFinanceiro || "");
  const tipoBaixa = (voucher.tipoExecucaoPagamento === "REMESSA_10H" || voucher.tipoExecucaoPagamento === "REMESSA_15H" || voucher.tipoExecucaoPagamento === "REMESSA") ? "BAIXA_REMESSA" : "BAIXA_MANUAL";
  const [necessitaAjusteOperacao, setNecessitaAjusteOperacao] = useState(false);
  const [necessitaAjusteFiscal, setNecessitaAjusteFiscal] = useState(false);
  const [motivoAjusteOperacao, setMotivoAjusteOperacao] = useState("");
  const [motivoAjusteFiscal, setMotivoAjusteFiscal] = useState("");
  const { toast } = useToast();

  const validacao = useMemo(() => validarProntoParaRobo(voucher), [voucher]);
  const isProntoParaRobo = validacao.valido;

  const isManualVoucher = voucher.origemCriacao === "MANUAL";
  const [rmCheckLoading, setRmCheckLoading] = useState<boolean>(isManualVoucher);
  const [rmReady, setRmReady] = useState<boolean>(!isManualVoucher);
  const [rmMissingFields, setRmMissingFields] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const checkRm = async () => {
      if (!isManualVoucher || !voucher.numeroSPO) {
        setRmReady(true);
        setRmCheckLoading(false);
        return;
      }
      setRmCheckLoading(true);
      try {
        const resp = await fetch(`/api/fin/vouchers/rm-ready?numero_spo=${encodeURIComponent(voucher.numeroSPO)}`);
        const data = await resp.json();
        if (cancelled) return;
        setRmReady(Boolean(data?.ready));
        setRmMissingFields(Array.isArray(data?.missingFields) ? data.missingFields : []);
      } catch (err) {
        if (cancelled) return;
        console.error("[VoucherFinanceiroActions] check rm-ready falhou:", err);
        setRmReady(true);
        setRmMissingFields([]);
      } finally {
        if (!cancelled) setRmCheckLoading(false);
      }
    };
    checkRm();
    return () => { cancelled = true; };
  }, [voucher.id, voucher.numeroSPO, isManualVoucher]);

  const getUserData = () => {
    const storedUser = localStorage.getItem("user") || localStorage.getItem("dachser_user");
    return storedUser ? JSON.parse(storedUser) : { id: 0, username: "sistema" };
  };

  const postLog = async (voucherId: string, body: object) => {
    await fetch(`/api/fin/vouchers/${voucherId}/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  };

  const checkRmReady = async (): Promise<{ ready: boolean; missingFields: string[] }> => {
    const resp = await fetch(`/api/fin/vouchers/rm-ready?numero_spo=${encodeURIComponent(voucher.numeroSPO || '')}`);
    const data = await resp.json();
    return { ready: Boolean(data?.ready), missingFields: data?.missingFields || [] };
  };

  const handleBaixar = async () => {
    if (!isProntoParaRobo) {
      toast({ title: "Voucher/SPO não está pronto", description: "Complete todas as pendências antes de enviar para o Robô", variant: "destructive" });
      return;
    }

    if (isManualVoucher) {
      try {
        const rmCheck = await checkRmReady();
        if (!rmCheck.ready) {
          setRmReady(false);
          setRmMissingFields(rmCheck.missingFields);
          toast({
            title: "Integração com RM pendente",
            description: `A integração com o RM ainda não criou o registro deste voucher (${voucher.numeroSPO || ""}). Aguarde a sincronização antes de baixar.`,
            variant: "destructive",
          });
          return;
        }
      } catch (err) {
        console.error("[VoucherFinanceiroActions] rm-ready (handleBaixar) falhou:", err);
      }
    }

    try {
      setLoading(true);
      const userData = getUserData();

      // 1. Log estendido
      await postLog(voucher.id, {
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
      });

      // 2. Para BAIXA_REMESSA, inserir em t_dados_rm e atualizar status
      if (tipoBaixa === "BAIXA_REMESSA") {
        await fetch('/api/fin/vouchers/dados-rm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id_rm: voucher.idRm || null,
            numero_spo: voucher.numeroSPO,
            voucher_boleto: voucher.linhaDigitavel || voucher.codigoBarras || null,
            chave_pix: voucher.chavePix || null,
            pix_tipo_chave: null,
            forma_pag: voucher.formaPagamento,
            fornecedor: voucher.fornecedor,
            cnpj_fornecedor: voucher.cnpjFornecedor,
            tipo_exec: voucher.tipoExecucaoPagamento,
          }),
        });

        await fetch(`/api/fin/vouchers/${voucher.id}/status-integracao-rm`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status_integracao_rm: 'ENVIADO_T_DADOS_RM' }),
        });
      }

      // 3. Avançar para ROBO
      const resp = await fetch(`/api/fin/vouchers/${voucher.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          etapa_atual: "ROBO",
          status_baixa: tipoBaixa,
          status_financeiro: "PROCESSADO",
          comentarios_financeiro: comentarios || null,
          responsavel_financeiro_user_id: userData.id?.toString(),
          is_pronto_para_robo: true,
        }),
      });

      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${resp.status}`);
      }

      toast({
        title: "Voucher/SPO baixado!",
        description: tipoBaixa === "BAIXA_REMESSA"
          ? "Voucher/SPO enviado para Robô e dados enviados ao RM"
          : "Voucher/SPO enviado para processamento do Robô",
      });

      onUpdate();
    } catch (error: any) {
      const msg = error.message || "";
      const friendlyMsg = msg.includes("WORKER_LIMIT")
        ? "O servidor está sobrecarregado. Tente novamente em alguns segundos."
        : msg.includes("timeout") || msg.includes("Timeout")
        ? "A operação demorou demais. Tente novamente."
        : msg || "Erro desconhecido ao baixar o voucher.";
      toast({ title: "Erro ao baixar voucher/SPO", description: friendlyMsg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleDevolverOperacao = async () => {
    if (!motivoAjusteOperacao.trim()) {
      toast({ title: "Motivo obrigatório", description: "Informe o motivo da devolução para a Operação", variant: "destructive" });
      return;
    }
    try {
      setLoading(true);
      const userData = getUserData();

      const resp = await fetch(`/api/fin/vouchers/${voucher.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          etapa_atual: "AJUSTE_OPERACAO",
          ajuste_operacao: buildAjusteWithRequester("FINANCEIRO", motivoAjusteOperacao),
          comentarios_financeiro: comentarios || null,
          responsavel_financeiro_user_id: userData.id?.toString(),
        }),
      });
      if (!resp.ok) { const d = await resp.json().catch(() => ({})); throw new Error(d.error || `HTTP ${resp.status}`); }

      await postLog(voucher.id, {
        user_id: userData.id?.toString(), user_name: userData.username,
        acao: "DEVOLVIDO_FINANCEIRO_OP", detalhe: `Devolvido para Operação: ${motivoAjusteOperacao}`,
      });

      await sendVoucherReturnNotification({ voucher, fromStage: "FINANCEIRO", toStage: "AJUSTE_OPERACAO", reason: motivoAjusteOperacao, senderName: userData.username });

      toast({ title: "Voucher/SPO devolvido", description: "Voucher/SPO devolvido para Operação" });
      onUpdate();
    } catch (error: any) {
      const msg = error.message || "";
      toast({ title: "Erro ao devolver voucher/SPO", description: msg.includes("WORKER_LIMIT") ? "O servidor está sobrecarregado." : msg || "Erro desconhecido.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleDevolverFiscal = async () => {
    if (!motivoAjusteFiscal.trim()) {
      toast({ title: "Motivo obrigatório", description: "Informe o motivo da devolução para o Fiscal", variant: "destructive" });
      return;
    }
    try {
      setLoading(true);
      const userData = getUserData();

      const resp = await fetch(`/api/fin/vouchers/${voucher.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          etapa_atual: "AJUSTE_FISCAL",
          ajuste_fiscal: buildAjusteWithRequester("FINANCEIRO", motivoAjusteFiscal),
          comentarios_financeiro: comentarios || null,
          responsavel_financeiro_user_id: userData.id?.toString(),
        }),
      });
      if (!resp.ok) { const d = await resp.json().catch(() => ({})); throw new Error(d.error || `HTTP ${resp.status}`); }

      await postLog(voucher.id, {
        user_id: userData.id?.toString(), user_name: userData.username,
        acao: "DEVOLVIDO_FINANCEIRO_FISCAL", detalhe: `Devolvido para Fiscal: ${motivoAjusteFiscal}`,
      });

      await sendVoucherReturnNotification({ voucher, fromStage: "FINANCEIRO", toStage: "AJUSTE_FISCAL", reason: motivoAjusteFiscal, senderName: userData.username });

      toast({ title: "Voucher/SPO devolvido", description: "Voucher/SPO devolvido para Fiscal" });
      onUpdate();
    } catch (error: any) {
      const msg = error.message || "";
      toast({ title: "Erro ao devolver voucher/SPO", description: msg.includes("WORKER_LIMIT") ? "O servidor está sobrecarregado." : msg || "Erro desconhecido.", variant: "destructive" });
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

      {voucher.tipoDocumento === 'ADF' && voucher.statusDocumentoFiscal === 'PENDENTE' && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <FileWarning className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-amber-600 dark:text-amber-400">ADF - Documento Fiscal Opcional</p>
            <p className="text-sm text-muted-foreground mt-1">
              Este voucher é do tipo ADF. O documento fiscal pode ser anexado na aba "Anexos", mas não é obrigatório para seguir na esteira.
            </p>
          </div>
        </div>
      )}

      {isManualVoucher && !rmCheckLoading && !rmReady && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/40">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-destructive">Integração com RM pendente</p>
            <p className="text-sm text-muted-foreground mt-1">
              Este voucher manual ainda não possui registro completo na base do RM
              (<code className="text-xs">t_dados_financeiro_voucher</code>).
              Não é possível baixar nem enviar para a t_dados_rm enquanto a sincronização não for concluída.
            </p>
            {rmMissingFields.length > 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                <span className="font-medium">Campos faltantes:</span> {rmMissingFields.join(", ")}
              </p>
            )}
          </div>
        </div>
      )}

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
            <p className="text-xs text-muted-foreground">ⓘ O tipo de execução é definido na aba de Pagamentos</p>
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
            <Label htmlFor="ajuste-operacao" className="cursor-pointer">Necessita ajuste da Operação?</Label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="ajuste-fiscal"
              checked={necessitaAjusteFiscal}
              onCheckedChange={(checked) => {
                setNecessitaAjusteFiscal(checked as boolean);
                if (checked) setNecessitaAjusteOperacao(false);
              }}
            />
            <Label htmlFor="ajuste-fiscal" className="cursor-pointer">Necessita ajuste do Fiscal?</Label>
          </div>
        </div>

        {necessitaAjusteOperacao && (
          <div className="space-y-2">
            <Label htmlFor="motivo-ajuste-op">Motivo do Ajuste (Operação) <span className="text-destructive">*</span></Label>
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
            <Label htmlFor="motivo-ajuste-fiscal">Motivo do Ajuste (Fiscal) <span className="text-destructive">*</span></Label>
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
            disabled={loading || !isProntoParaRobo || (isManualVoucher && (rmCheckLoading || !rmReady))}
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
