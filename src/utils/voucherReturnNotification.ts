import { Voucher } from "@/types/voucher";

interface SendReturnNotificationParams {
  voucher: Voucher | { id: string; numeroSPO?: string; fornecedor?: string; valor?: number; moeda?: string; vencimento?: string | Date };
  fromStage: string;
  toStage: "AJUSTE_OPERACAO" | "AJUSTE_FISCAL";
  reason: string;
  senderName?: string;
}

export async function sendVoucherReturnNotification(params: SendReturnNotificationParams) {
  const { voucher, fromStage, toStage, reason, senderName } = params;
  try {
    const v: any = voucher;
    await fetch('/api/notifications/voucher', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'AJUSTE_SOLICITADO',
        voucherId: v.id,
        voucherNumber: v.numeroSPO || v.numero_spo || v.id,
        toStage,
        fromStage,
        reason,
        senderName: senderName || 'Sistema',
        fornecedor: v.fornecedor,
        valor: v.valor != null ? String(v.valor) : undefined,
        moeda: v.moeda,
        vencimento: v.vencimento ? String(v.vencimento) : undefined,
      }),
    });
  } catch (e) {
    console.warn('Failed to send return notification:', e);
  }
}
