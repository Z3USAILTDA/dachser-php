import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

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

function htmlPage(title: string, message: string, success: boolean) {
  const color = success ? "#22C55E" : "#DC2626";
  const icon = success ? "✓" : "✗";
  return `<!doctype html>
<html lang="pt-br">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;background:#f5f5f5}
  .card{background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08);padding:48px;text-align:center;max-width:440px}
  .icon{width:72px;height:72px;border-radius:50%;background:${color};color:#fff;font-size:36px;display:flex;align-items:center;justify-content:center;margin:0 auto 24px}
  h1{margin:0 0 12px;font-size:22px;color:#111}
  p{margin:0;font-size:15px;color:#666;line-height:1.6}
  .footer{margin-top:32px;font-size:12px;color:#999}
</style>
</head>
<body>
<div class="card">
  <div class="icon">${icon}</div>
  <h1>${title}</h1>
  <p>${message}</p>
  <div class="footer">© Z3US.AI — Esteira de Vouchers</div>
</div>
</body>
</html>`;
}

const handler = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const action = url.searchParams.get("action");

  if (!token || !action || !["approve", "reject"].includes(action)) {
    return new Response(
      htmlPage("Requisição Inválida", "Link inválido ou parâmetros ausentes.", false),
      { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  try {
    // Validate token
    const validation = await callProxy("validate_supervisor_token", { token });

    if (!validation.success) {
      const messages: Record<string, string> = {
        NOT_FOUND: "Este link não é válido ou já foi removido.",
        ALREADY_USED: "Este link já foi utilizado anteriormente. A ação já foi processada.",
        EXPIRED: "Este link expirou (validade de 48h). Por favor, acesse o sistema para realizar a ação.",
      };
      const msg = messages[validation.code] || validation.error || "Erro ao validar o link.";
      return new Response(
        htmlPage("Ação Não Disponível", msg, false),
        { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    const { voucher_id, action_type } = validation;

    // Verify action matches token
    if ((action === "approve" && action_type !== "APPROVE") || (action === "reject" && action_type !== "REJECT")) {
      return new Response(
        htmlPage("Ação Inválida", "O tipo de ação não corresponde ao token.", false),
        { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    if (action === "approve") {
      // Update voucher to FINANCEIRO
      await callProxy("update_voucher_esteira", {
        voucher_id,
        etapa_atual: "FINANCEIRO",
        status_financeiro: "APROVADO",
        aprovado_por_user_id: "0",
        responsavel_supervisor_user_id: "0",
      });

      // Log action
      await callProxy("save_voucher_log", {
        voucher_id,
        user_id: "0",
        user_name: "Supervisor (via e-mail)",
        acao: "APROVADO_SUPERVISOR",
        detalhe: "Voucher/SPO urgente aprovado via link do e-mail",
      });

      // Send notification to FINANCEIRO
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

      // Mark token as used (mark both approve and reject tokens for this voucher)
      await callProxy("mark_supervisor_token_used", { token });

      return new Response(
        htmlPage("Voucher Aprovado ✓", "O voucher foi aprovado com sucesso e enviado para o Financeiro.", true),
        { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    } else {
      // Reject - update voucher back to OPERACAO
      await callProxy("update_voucher_esteira", {
        voucher_id,
        etapa_atual: "OPERACAO",
        status_financeiro: "REJEITADO",
        ajuste_operacao: "REJEITADO PELO SUPERVISOR via e-mail",
        responsavel_supervisor_user_id: "0",
      });

      // Log action
      await callProxy("save_voucher_log", {
        voucher_id,
        user_id: "0",
        user_name: "Supervisor (via e-mail)",
        acao: "REJEITADO_SUPERVISOR",
        detalhe: "Voucher/SPO rejeitado via link do e-mail",
      });

      // Mark token as used
      await callProxy("mark_supervisor_token_used", { token });

      return new Response(
        htmlPage("Voucher Rejeitado", "O voucher foi rejeitado e devolvido para a Operação.", true),
        { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }
  } catch (error: any) {
    console.error("Error in supervisor-email-action:", error);
    return new Response(
      htmlPage("Erro", "Ocorreu um erro ao processar sua ação. Tente novamente ou acesse o sistema.", false),
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
};

serve(handler);
