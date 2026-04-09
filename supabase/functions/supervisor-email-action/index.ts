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

function htmlResponse(html: string): Response {
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function renderPage(status: "approved" | "rejected" | "error" | "reject_form", message: string, formCtx?: { token: string }): Response {
  const configs: Record<string, { title: string; color: string; glow: string; icon: string }> = {
    approved: {
      title: "Voucher Aprovado",
      color: "#22C55E",
      glow: "rgba(34,197,94,.25)",
      icon: `<polyline points="20 6 9 17 4 12" />`,
    },
    rejected: {
      title: "Voucher Rejeitado",
      color: "#DC2626",
      glow: "rgba(220,38,38,.25)",
      icon: `<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />`,
    },
    error: {
      title: "Ação Não Disponível",
      color: "#F5B843",
      glow: "rgba(245,184,67,.25)",
      icon: `<circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />`,
    },
    reject_form: {
      title: "Rejeitar Voucher",
      color: "#DC2626",
      glow: "rgba(220,38,38,.25)",
      icon: `<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />`,
    },
  };

  const cfg = configs[status] || configs.error;

  const formHtml = status === "reject_form" && formCtx ? `
    <form method="POST" action="${SUPABASE_URL}/functions/v1/supervisor-email-action?token=${encodeURIComponent(formCtx.token)}&action=reject" style="margin-top:24px;text-align:left;">
      <label style="display:block;font-size:13px;color:#aaa;margin-bottom:8px;font-weight:500;">Motivo da rejeição *</label>
      <textarea name="reason" required minlength="5" maxlength="1000" rows="4" placeholder="Descreva o motivo da rejeição..." style="width:100%;box-sizing:border-box;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);border-radius:12px;color:#f5f5f5;font-size:14px;padding:12px 16px;resize:vertical;font-family:inherit;outline:none;transition:border .2s;" onfocus="this.style.borderColor='#F5B843'" onblur="this.style.borderColor='rgba(255,255,255,.15)'"></textarea>
      <button type="submit" style="margin-top:16px;width:100%;padding:14px;background:linear-gradient(135deg,#DC2626,#991B1B);color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;letter-spacing:.02em;transition:transform .15s,box-shadow .15s;" onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 8px 24px rgba(220,38,38,.35)'" onmouseout="this.style.transform='none';this.style.boxShadow='none'">Confirmar Rejeição</button>
    </form>
  ` : "";

  const messageHtml = status !== "reject_form" ? `
    <p style="font-size:15px;line-height:1.7;color:#aaa;max-width:360px;margin:0 auto">${message}</p>
  ` : `<p style="font-size:14px;line-height:1.6;color:#aaa;max-width:360px;margin:0 auto">${message}</p>`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${cfg.title} — Z3US</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:linear-gradient(160deg,#050612 0%,#0c0d1a 40%,#111322 100%);color:#f5f5f5;padding:24px}
@keyframes fadeUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
@keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(0,0,0,.15)}50%{box-shadow:0 0 0 14px transparent}}
</style>
</head>
<body>
<div style="background:rgba(5,6,18,.92);border:1px solid rgba(255,255,255,.1);border-radius:24px;box-shadow:0 20px 60px rgba(0,0,0,.6);padding:48px 40px;text-align:center;max-width:480px;width:100%;animation:fadeUp .5s ease-out">
  <div style="margin-bottom:28px">
    <img src="https://i.ibb.co/sJkY7y5/logo-branco.png" alt="Z3US" style="height:32px"/>
  </div>
  <div style="width:88px;height:88px;border-radius:50%;background:${cfg.color};display:flex;align-items:center;justify-content:center;margin:0 auto 28px;animation:pulse 2s ease-in-out infinite">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${cfg.icon}</svg>
  </div>
  <h1 style="font-size:24px;font-weight:700;margin-bottom:12px;letter-spacing:-.02em;color:#f5f5f5">${cfg.title}</h1>
  ${messageHtml}
  ${formHtml}
  <div style="height:1px;background:rgba(255,255,255,.08);margin:32px 0"></div>
  <p style="font-size:11px;color:#555;letter-spacing:.08em;text-transform:uppercase"><span style="color:#F5B843">© Z3US</span>.AI — Esteira de Vouchers</p>
</div>
</body>
</html>`;

  return htmlResponse(html);
}

const handler = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const action = url.searchParams.get("action");

  if (!token || !action || !["approve", "reject"].includes(action)) {
    return renderPage("error", "Link inválido ou parâmetros ausentes.");
  }

  try {
    // For POST reject, parse form body for reason before validation
    let rejectReason = "";
    if (req.method === "POST" && action === "reject") {
      try {
        const contentType = req.headers.get("content-type") || "";
        if (contentType.includes("application/x-www-form-urlencoded")) {
          const formData = await req.formData();
          rejectReason = (formData.get("reason") as string || "").trim();
        } else {
          const body = await req.json();
          rejectReason = (body.reason || "").trim();
        }
      } catch {
        rejectReason = "";
      }
      if (!rejectReason || rejectReason.length < 5) {
        return renderPage("reject_form", "Por favor, informe o motivo da rejeição para continuar.", { token });
      }
    }

    const validation = await callProxy("validate_supervisor_token", { token });

    if (!validation.success) {
      const messages: Record<string, string> = {
        NOT_FOUND: "Este link não é válido ou já foi removido.",
        ALREADY_USED: "Este link já foi utilizado anteriormente.",
        EXPIRED: "Este link expirou (validade de 48h). Acesse o sistema para realizar a ação.",
      };
      const msg = messages[validation.code] || validation.error || "Erro ao validar o link.";
      return renderPage("error", msg);
    }

    const { voucher_id, action_type } = validation;

    if ((action === "approve" && action_type !== "APPROVE") || (action === "reject" && action_type !== "REJECT")) {
      return renderPage("error", "O tipo de ação não corresponde ao token.");
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
      return renderPage("approved", "O voucher foi aprovado com sucesso e enviado para o Financeiro.");
    } else {
      // GET request for reject → show form
      if (req.method === "GET") {
        return renderPage("reject_form", "Informe o motivo da rejeição antes de confirmar.", { token });
      }

      // POST request → process rejection with reason
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
      return renderPage("rejected", "O voucher foi rejeitado e devolvido para a Operação.");
    }
  } catch (error: any) {
    console.error("Error in supervisor-email-action:", error);
    return renderPage("error", "Ocorreu um erro ao processar sua ação. Tente novamente.");
  }
};

serve(handler);
