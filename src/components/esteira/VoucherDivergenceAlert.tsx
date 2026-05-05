import { useState } from "react";
import { AlertTriangle, Loader2, ArrowLeftCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { getUserData } from "@/utils/userStorage";
import { sendVoucherReturnNotification } from "@/utils/voucherReturnNotification";
import { buildAjusteWithRequester } from "@/utils/voucherAjusteRouting";
import type { Voucher } from "@/types/voucher";
import type { VoucherDivergence } from "@/utils/voucherDivergence";

interface Props {
  voucher: Voucher;
  divergence: VoucherDivergence;
  onUpdated: () => void;
}

export const VoucherDivergenceAlert = ({ voucher, divergence, onUpdated }: Props) => {
  const { toast } = useToast();
  const [motivo, setMotivo] = useState("");
  const [loading, setLoading] = useState(false);

  const handleDevolver = async () => {
    if (!motivo.trim()) {
      toast({
        title: "Motivo obrigatório",
        description: "Descreva o motivo da devolução para a Operação.",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      const userData = getUserData();

      const ajusteTexto = buildAjusteWithRequester(
        divergence.fromStage,
        `[DIVERGÊNCIA DE ROTEAMENTO — ${divergence.rule}] ${motivo}`,
      );

      const { error } = await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "update_voucher_esteira",
          voucher_id: voucher.id,
          etapa_atual: "AJUSTE_OPERACAO",
          ajuste_operacao: ajusteTexto,
          responsavel_fiscal_user_id: userData.id?.toString(),
        },
      });
      if (error) throw error;

      const detalhe = [
        `Regra violada: ${divergence.rule}`,
        `Etapa atual: ${voucher.etapaAtual}`,
        `Cobrança em nome de: ${voucher.cobrancaEmNomeDe}`,
        `Vouchers do SPO: ${divergence.siblings.length} (compatíveis com Fiscal: ${divergence.siblings.filter((s) => s.compativelComEtapa).length})`,
        `Motivo informado: ${motivo}`,
      ].join(" | ");

      await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "save_voucher_log",
          voucher_id: voucher.id,
          user_id: userData.id?.toString(),
          user_name: userData.username,
          acao: "DIVERGENCIA_DEVOLVIDA",
          detalhe,
        },
      });

      await sendVoucherReturnNotification({
        voucher,
        fromStage: divergence.fromStage,
        toStage: "AJUSTE_OPERACAO",
        reason: `Divergência de roteamento: ${motivo}`,
        senderName: userData.username,
      });

      toast({
        title: "Voucher devolvido para Operação",
        description: "A divergência foi registrada e o criador foi notificado.",
      });
      onUpdated();
    } catch (err: any) {
      toast({
        title: "Erro ao devolver voucher",
        description: err?.message || "Falha ao registrar a devolução.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card
      className="p-6 border border-amber-500/40 backdrop-blur-[18px]"
      style={{ backgroundColor: "rgba(245, 158, 11, 0.06)" }}
    >
      <div className="flex items-start gap-4">
        <div className="rounded-full bg-amber-500/15 p-2.5">
          <AlertTriangle className="h-6 w-6 text-amber-400" />
        </div>
        <div className="flex-1 space-y-4">
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-amber-300">
              {divergence.titulo}
            </h3>
            <p className="text-sm text-foreground/90 leading-relaxed">
              {divergence.descricao}
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed pt-1">
              <span className="font-medium text-amber-200/80">Causa provável:</span>{" "}
              {divergence.causaProvavel}
            </p>
          </div>

          {divergence.siblings.length > 0 && (
            <div className="rounded-lg border border-[rgba(255,255,255,0.10)] bg-[rgba(5,6,18,0.6)] p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                Contexto do SPO {divergence.spoBase ?? voucher.numeroSPO}
                {" — "}{divergence.siblings.length} voucher(s)
              </div>
              <ul className="space-y-1.5 text-sm">
                {divergence.siblings.map((s) => (
                  <li
                    key={s.id}
                    className={`flex items-center justify-between gap-3 rounded px-2 py-1.5 ${
                      s.isCurrent ? "bg-amber-500/10 border border-amber-500/30" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`font-mono text-xs truncate ${s.isCurrent ? "text-amber-200" : "text-foreground/80"}`}>
                        {s.numeroSPO || "(sem número)"}
                      </span>
                      {s.isCurrent && (
                        <Badge variant="outline" className="text-[10px] border-amber-400/50 text-amber-300">
                          este voucher
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">{s.cobrancaEmNomeDe}</span>
                      <span className="text-muted-foreground/60">•</span>
                      <span className="text-muted-foreground">{s.etapaAtual.replace("_", " ")}</span>
                      {s.compativelComEtapa ? (
                        <Badge className="text-[10px] bg-green-500/15 text-green-400 border-green-500/30 border">
                          segue Fiscal
                        </Badge>
                      ) : (
                        <Badge className="text-[10px] bg-red-500/15 text-red-400 border-red-500/30 border">
                          não deveria estar no Fiscal
                        </Badge>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground/80">
              Motivo do retorno para Operação <span className="text-red-400">*</span>
            </label>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder='Ex.: "Voucher veio para o Fiscal mas a cobrança é CLIENTE — devolvendo para a Operação reavaliar o roteamento."'
              rows={3}
              disabled={loading}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={handleDevolver}
              disabled={loading}
              className="gap-2 border-amber-400/40 text-amber-200 hover:bg-amber-500/10 hover:text-amber-100"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeftCircle className="h-4 w-4" />}
              Devolver para Operação
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
};
