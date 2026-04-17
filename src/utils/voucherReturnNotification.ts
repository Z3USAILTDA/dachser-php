import { supabase } from "@/integrations/supabase/client";
import { Voucher } from "@/types/voucher";

interface SendReturnNotificationParams {
  voucher: Voucher | { id: string; numeroSPO?: string; fornecedor?: string; valor?: number; moeda?: string; vencimento?: string | Date };
  fromStage: string;
  toStage: "AJUSTE_OPERACAO" | "AJUSTE_FISCAL";
  reason: string;
  senderName?: string;
}

/**
 * Dispara notificação AJUSTE_SOLICITADO ao responsável da etapa anterior
 * (criador para AJUSTE_OPERACAO, fiscal para AJUSTE_FISCAL).
 * Edge function resolve destinatário individualmente via voucherId.
 */
export async function sendVoucherReturnNotification(params: SendReturnNotificationParams) {
  const { voucher, fromStage, toStage, reason, senderName } = params;
  try {
    const v: any = voucher;
    await supabase.functions.invoke("send-voucher-notification", {
      body: {
        type: "AJUSTE_SOLICITADO",
        voucherId: v.id,
        voucherNumber: v.numeroSPO || v.numero_spo || v.id,
        toStage,
        fromStage,
        reason,
        senderName: senderName || "Sistema",
        fornecedor: v.fornecedor,
        valor: v.valor != null ? String(v.valor) : undefined,
        moeda: v.moeda,
        vencimento: v.vencimento ? String(v.vencimento) : undefined,
      },
    });
  } catch (e) {
    console.warn("Failed to send return notification:", e);
  }
}
