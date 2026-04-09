import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

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

function htmlPage(title: string, message: string, type: "success" | "rejected" | "error") {
  const colors = {
    success: { bg: "#22C55E", glow: "rgba(34,197,94,.25)" },
    rejected: { bg: "#DC2626", glow: "rgba(220,38,38,.25)" },
    error: { bg: "#F5B843", glow: "rgba(245,184,67,.25)" },
  };
  const c = colors[type];

  const svgIcon = type === "error"
    ? `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
    : type === "rejected"
    ? `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
    : `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

  return `<!doctype html>
<html lang="pt-br">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  @keyframes fadeUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
  @keyframes pulse{0%,100%{box-shadow:0 0 0 0 ${c.glow}}50%{box-shadow:0 0 0 14px transparent}}
  body{
    min-height:100vh;display:flex;align-items:center;justify-content:center;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
    background:linear-gradient(160deg,#050612 0%,#0c0d1a 40%,#111322 100%);
    color:#f5f5f5;padding:24px;
  }
  .card{
    background:rgba(5,6,18,.92);
    border:1px solid rgba(255,255,255,.1);
    border-radius:24px;
    box-shadow:0 20px 60px rgba(0,0,0,.6);
    padding:48px 40px;
    text-align:center;
    max-width:460px;width:100%;
    animation:fadeUp .5s ease-out;
  }
  .logo{margin-bottom:28px}
  .logo img{height:32px}
  .icon-circle{
    width:88px;height:88px;border-radius:50%;
    background:${c.bg};
    display:flex;align-items:center;justify-content:center;
    margin:0 auto 28px;
    animation:pulse 2s ease-in-out infinite;
  }
  h1{font-size:24px;font-weight:700;margin-bottom:12px;letter-spacing:-.02em;color:#f5f5f5}
  .msg{font-size:15px;line-height:1.7;color:#aaa;max-width:360px;margin:0 auto}
  .divider{height:1px;background:rgba(255,255,255,.08);margin:32px 0}
  .footer{font-size:11px;color:#555;letter-spacing:.08em;text-transform:uppercase}
  .footer span{color:#F5B843}
</style>
</head>
<body>
<div class="card">
  <div class="logo">
    <img src="https://i.ibb.co/sJkY7y5/logo-branco.png" alt="Z3US" width="120">
  </div>
  <div class="icon-circle">${svgIcon}</div>
  <h1>${title}</h1>
  <p class="msg">${message}</p>
  <div class="divider"></div>
  <p class="footer"><span>&copy; Z3US</span>.AI &mdash; Esteira de Vouchers</p>
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
      htmlPage("Requisicao Invalida", "Link invalido ou parametros ausentes.", "error"),
      { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  try {
    const validation = await callProxy("validate_supervisor_token", { token });

    if (!validation.success) {
      const messages: Record<string, string> = {
        NOT_FOUND: "Este link nao e valido ou ja foi removido.",
        ALREADY_USED: "Este link ja foi utilizado anteriormente. A acao ja foi processada.",
        EXPIRED: "Este link expirou (validade de 48h). Por favor, acesse o sistema para realizar a acao.",
      };
      const msg = messages[validation.code] || validation.error || "Erro ao validar o link.";
      return new Response(
        htmlPage("Acao Nao Disponivel", msg, "error"),
        { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    const { voucher_id, action_type } = validation;

    if ((action === "approve" && action_type !== "APPROVE") || (action === "reject" && action_type !== "REJECT")) {
      return new Response(
        htmlPage("Acao Invalida", "O tipo de acao nao corresponde ao token.", "error"),
        { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
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

      await callProxy("mark_supervisor_token_used", { token });

      return new Response(
        htmlPage("Voucher Aprovado", "O voucher foi aprovado com sucesso e enviado para o Financeiro.", "success"),
        { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    } else {
      await callProxy("update_voucher_esteira", {
        voucher_id,
        etapa_atual: "OPERACAO",
        status_financeiro: "REJEITADO",
        ajuste_operacao: "REJEITADO PELO SUPERVISOR via e-mail",
        responsavel_supervisor_user_id: "0",
      });

      await callProxy("save_voucher_log", {
        voucher_id,
        user_id: "0",
        user_name: "Supervisor (via e-mail)",
        acao: "REJEITADO_SUPERVISOR",
        detalhe: "Voucher/SPO rejeitado via link do e-mail",
      });

      await callProxy("mark_supervisor_token_used", { token });

      return new Response(
        htmlPage("Voucher Rejeitado", "O voucher foi rejeitado e devolvido para a Operacao.", "rejected"),
        { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }
  } catch (error: any) {
    console.error("Error in supervisor-email-action:", error);
    return new Response(
      htmlPage("Erro", "Ocorreu um erro ao processar sua acao. Tente novamente ou acesse o sistema.", "error"),
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
};

serve(handler);
