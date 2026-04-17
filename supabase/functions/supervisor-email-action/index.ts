import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function jsonResponse(data: Record<string, any>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

async function callProxy(action: string, body: Record<string, any>) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/mariadb-proxy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "apikey": SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ action, ...body }),
  });
  return res.json();
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const action = url.searchParams.get("action");

  if (!token || !action || !["approve", "reject"].includes(action)) {
    return jsonResponse({ status: "error", code: "INVALID_PARAMS", message: "Link inválido ou parâmetros ausentes." }, 400);
  }

  try {
    // For reject, parse reason from body
    let rejectReason = "";
    if (action === "reject" && req.method === "POST") {
      try {
        const body = await req.json();
        rejectReason = (body.reason || "").trim();
      } catch {
        rejectReason = "";
      }
      if (!rejectReason || rejectReason.length < 5) {
        return jsonResponse({ status: "error", code: "REASON_REQUIRED", message: "Informe o motivo da rejeição (mínimo 5 caracteres)." }, 400);
      }
    }

    // Validate token
    const validation = await callProxy("validate_supervisor_token", { token });

    if (!validation.success) {
      const messages: Record<string, string> = {
        NOT_FOUND: "Este link não é válido ou já foi removido.",
        ALREADY_USED: "Este link já foi utilizado anteriormente.",
        EXPIRED: "Este link expirou (validade de 48h). Acesse o sistema para realizar a ação.",
      };
      const msg = messages[validation.code] || validation.error || "Erro ao validar o link.";
      return jsonResponse({ status: "error", code: validation.code || "VALIDATION_ERROR", message: msg }, 400);
    }

    const { voucher_id, action_type } = validation;

    if ((action === "approve" && action_type !== "APPROVE") || (action === "reject" && action_type !== "REJECT")) {
      return jsonResponse({ status: "error", code: "ACTION_MISMATCH", message: "O tipo de ação não corresponde ao token." }, 400);
    }

    if (action === "approve") {
      await callProxy("update_voucher_esteira", {
        voucher_id,
        etapa_atual: "FINANCEIRO",
        status_financeiro: "APROVADO",
        aprovado_por_user_id: "0",
        responsavel_supervisor_user_id: "0",
      });

      await callProxy("save_voucher_log", {
        voucher_id,
        user_id: "0",
        user_name: "Supervisor (via e-mail)",
        acao: "APROVADO_SUPERVISOR",
        detalhe: "Voucher/SPO urgente aprovado via link do e-mail",
      });

      // Inserir na t_dados_rm ao entrar no FINANCEIRO
      try {
        const voucherData = await callProxy("get_voucher_for_rm", { voucher_id });
        if (voucherData?.success && voucherData?.data) {
          const v = voucherData.data;
          await callProxy("insert_dados_rm", {
            id_rm: v.id_rm || null,
            numero_spo: v.numero_spo,
            voucher_boleto: ["BOLETO", "DARF", "GPS"].includes(v.forma_pagamento || "")
              ? (v.linha_digitavel || v.codigo_barras || null)
              : null,
            chave_pix: v.chave_pix || null,
            pix_tipo_chave: null,
            forma_pag: v.forma_pagamento,
            fornecedor: v.fornecedor,
            cnpj_fornecedor: v.cnpj_fornecedor || null,
            tipo_exec: v.tipo_execucao_pagamento || null,
          });
        }
      } catch (e) {
        console.log("Insert t_dados_rm from email action skipped:", e);
      }

      try {
        await fetch(`${SUPABASE_URL}/functions/v1/send-voucher-notification`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
            "apikey": SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            type: "VOUCHER_ENVIADO",
            voucherId: voucher_id,
            voucherNumber: voucher_id,
            toStage: "FINANCEIRO",
            fromStage: "SUPERVISOR",
            senderName: "Supervisor (via e-mail)",
          }),
        });
      } catch (e) {
        console.log("Email notification to FINANCEIRO skipped:", e);
      }

      // Confirmation email to creator + supervisor (cc) — urgência aprovada
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/send-voucher-notification`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
            "apikey": SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            type: "URGENCIA_APROVADA",
            voucherId: voucher_id,
            voucherNumber: voucher_id,
            toStage: "FINANCEIRO",
            fromStage: "SUPERVISOR",
            senderName: "Supervisor (via e-mail)",
          }),
        });
      } catch (e) {
        console.log("Confirmation email URGENCIA_APROVADA skipped:", e);
      }

      await callProxy("mark_supervisor_token_used", { token });
      return jsonResponse({ status: "approved", message: "O voucher foi aprovado com sucesso e enviado para o Financeiro." });
    } else {
      // For GET on reject, just validate the token
      if (req.method === "GET") {
        return jsonResponse({ status: "valid", message: "Token válido. Envie o motivo da rejeição." });
      }

      // POST: process rejection
      await callProxy("update_voucher_esteira", {
        voucher_id,
        etapa_atual: "OPERACAO",
        status_financeiro: "REJEITADO",
        ajuste_operacao: `REJEITADO PELO SUPERVISOR via e-mail: ${rejectReason}`,
        responsavel_supervisor_user_id: "0",
      });

      await callProxy("save_voucher_log", {
        voucher_id,
        user_id: "0",
        user_name: "Supervisor (via e-mail)",
        acao: "REJEITADO_SUPERVISOR",
        detalhe: `Voucher/SPO rejeitado via e-mail. Motivo: ${rejectReason}`,
      });

      await callProxy("mark_supervisor_token_used", { token });

      // Confirmation email — urgência rejeitada (creator + supervisor cc)
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/send-voucher-notification`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
            "apikey": SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            type: "URGENCIA_REJEITADA",
            voucherId: voucher_id,
            voucherNumber: voucher_id,
            toStage: "AJUSTE_OPERACAO",
            fromStage: "SUPERVISOR",
            senderName: "Supervisor (via e-mail)",
            reason: rejectReason,
          }),
        });
      } catch (e) {
        console.log("Confirmation email URGENCIA_REJEITADA skipped:", e);
      }

      return jsonResponse({ status: "rejected", message: "O voucher foi rejeitado e devolvido para a Operação." });
    }
  } catch (error: any) {
    console.error("Error in supervisor-email-action:", error);
    return jsonResponse({ status: "error", code: "INTERNAL_ERROR", message: "Ocorreu um erro ao processar sua ação. Tente novamente." }, 500);
  }
};

serve(handler);
