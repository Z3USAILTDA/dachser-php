import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Stage → roles mapping (mirrors src/utils/esteiraNotifications.ts)
const STAGE_TO_ROLES: Record<string, string[]> = {
  OPERACAO: [],
  AJUSTE_OPERACAO: ["__OPERACAO_FIXED__"], // special: uses fixed email list
  FISCAL: ["FISCAL", "GESTOR_FISCAL"],
  AJUSTE_FISCAL: ["FISCAL", "GESTOR_FISCAL"],
  SUPERVISOR: ["SUPERVISOR", "GESTOR_SUPERVISOR"],
  FINANCEIRO: ["FINANCEIRO", "GESTOR_FINANCEIRO"],
  ROBO: ["FINANCEIRO", "GESTOR_FINANCEIRO"],
  CONCLUIDO: [],
};

// Fixed recipients for AJUSTE_OPERACAO (adjustment requests back to Operação)
const OPERACAO_FIXED_EMAILS = [
  "beatriz.tozzi@dachser.com",
  "cleiciane.faconi@dachser.com",
  "julia.stanguerlin@dachser.com",
  "laura.estevam@dachser.com",
  "leandro.geraldo@dachser.com",
  "priscila.neves-external@dachser.com",
];

interface NotificationRequest {
  type: "AJUSTE_SOLICITADO" | "URGENCIA_REJEITADA" | "VOUCHER_ENVIADO" | "VOUCHER_CONCLUIDO" | "VENCIMENTO_PROXIMO";
  voucherId: string;
  voucherNumber: string;
  toStage: string;
  reason?: string;
  fromStage?: string;
  senderName?: string;
  fornecedor?: string;
  valor?: string;
  moeda?: string;
  vencimento?: string;
}

function getEmailContent(data: NotificationRequest) {
  const baseUrl = "https://dachser.z3us.app";
  const voucherLink = `${baseUrl}/fin/esteira/voucher/${data.voucherId}`;
  const logoLight = "https://i.ibb.co/TgXzCqz/logo-preto.png";
  const logoDark = "https://i.ibb.co/sJkY7y5/logo-branco.png";

  const cfgMap: Record<string, { title: string; titleColor: string; btnBg: string; btnColor: string; subject: string }> = {
    VOUCHER_ENVIADO: { title: "Novo Voucher para Análise", titleColor: "#F5B843", btnBg: "#F5B843", btnColor: "#111", subject: "Voucher Recebido" },
    AJUSTE_SOLICITADO: { title: "Ajuste Solicitado", titleColor: "#F97316", btnBg: "#F97316", btnColor: "#fff", subject: "Ajuste Solicitado" },
    URGENCIA_REJEITADA: { title: "Urgência Rejeitada", titleColor: "#DC2626", btnBg: "#DC2626", btnColor: "#fff", subject: "Urgência Rejeitada" },
    VOUCHER_CONCLUIDO: { title: "Voucher Concluído com Sucesso", titleColor: "#22C55E", btnBg: "#22C55E", btnColor: "#fff", subject: "Voucher Concluído" },
    VENCIMENTO_PROXIMO: { title: "⚠️ Atenção: Vencimento Próximo", titleColor: "#F59E0B", btnBg: "#F59E0B", btnColor: "#111", subject: "Vencimento Próximo" },
  };

  const cfg = cfgMap[data.type] || cfgMap.VOUCHER_ENVIADO;
  const ctaLabel = data.type === "VOUCHER_CONCLUIDO" ? "Ver Detalhes" : data.type === "VOUCHER_ENVIADO" ? "Analisar Voucher" : "Ver Voucher";

  let contentBlock = "";
  switch (data.type) {
    case "VOUCHER_ENVIADO":
      contentBlock = `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#666">Você recebeu um novo voucher para análise na etapa <b>${data.toStage}</b>.</p>`;
      break;
    case "AJUSTE_SOLICITADO":
      contentBlock = `
        <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#666">O voucher <b>${data.voucherNumber}</b> foi devolvido de <b>${data.fromStage}</b> para <b>${data.toStage}</b>.</p>
        <p style="margin:0 0 4px;font-size:13px;font-weight:700">Motivo:</p>
        <div style="background:rgba(249,115,22,.08);border-left:4px solid #F97316;padding:12px 16px;border-radius:0 8px 8px 0;margin:0 0 16px">
          <p style="margin:0;font-size:14px;line-height:1.5">${data.reason || "Não especificado"}</p>
        </div>
        <p style="margin:0 0 8px;font-size:13px;color:#666">Solicitado por: <b>${data.senderName || "Sistema"}</b></p>`;
      break;
    case "URGENCIA_REJEITADA":
      contentBlock = `
        <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#666">A solicitação de urgência para o voucher <b>${data.voucherNumber}</b> foi <span style="color:#DC2626;font-weight:700">rejeitada</span> pelo Supervisor.</p>
        <p style="margin:0 0 4px;font-size:13px;font-weight:700">Motivo da rejeição:</p>
        <div style="background:rgba(220,38,38,.06);border-left:4px solid #DC2626;padding:12px 16px;border-radius:0 8px 8px 0;margin:0 0 16px">
          <p style="margin:0;font-size:14px;line-height:1.5">${data.reason || "Não especificado"}</p>
        </div>`;
      break;
    case "VOUCHER_CONCLUIDO":
      contentBlock = `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#666">O voucher <b>${data.voucherNumber}</b> foi processado e concluído com sucesso.</p>`;
      break;
    case "VENCIMENTO_PROXIMO":
      contentBlock = `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#666">O voucher <b>${data.voucherNumber}</b> está próximo do vencimento${data.vencimento ? ` (<b>${data.vencimento}</b>)` : ""}. Por favor, verifique e tome as ações necessárias.</p>`;
      break;
  }

  const subject = `${cfg.subject} — ${data.voucherNumber}`;

  const html = `<!doctype html>
<html lang="pt-br">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="light dark"><title>${subject}</title>
<style>
  .bg{background:#fff}.panel{background:#fff;border:1px solid #e8e8e8;border-radius:12px}.text{color:#111}.muted{color:#666}
  @media(prefers-color-scheme:dark){.bg{background:#0b0b0b!important}.panel{background:#141414!important;border-color:#262626!important}.text{color:#ededed!important}.muted{color:#bdbdbd!important}.logo-light{display:none!important}.logo-dark{display:block!important}}
</style>
</head>
<body class="bg" style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" class="panel" style="border-collapse:collapse;max-width:640px">
  <tr><td style="padding:28px 28px 0" align="center">
    <img src="${logoLight}" width="120" alt="Z3US" class="logo-light" style="display:block;margin:0 auto 8px;border:0">
    <img src="${logoDark}" width="120" alt="Z3US" class="logo-dark" style="display:none;margin:0 auto 8px;border:0">
  </td></tr>
  <tr><td style="padding:12px 28px 0" align="left">
    <h1 style="margin:0 0 4px;font-size:22px;line-height:1.3;color:${cfg.titleColor}">${cfg.title}</h1>
    <p style="margin:0 0 16px;font-size:12px" class="muted">${cfg.subject} — ${data.voucherNumber}</p>
  </td></tr>
  <tr><td style="padding:0 28px" align="left">${contentBlock}</td></tr>
  <tr><td style="padding:0 28px 16px" align="left">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;border:1px solid rgba(0,0,0,.08);border-radius:8px;overflow:hidden">
      <tr style="background:rgba(0,0,0,.03)"><td style="font-size:12px;font-weight:700;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06)" class="muted" colspan="2">DADOS DO VOUCHER</td></tr>
      <tr><td style="font-size:13px;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06);width:140px" class="muted">Número</td><td style="font-size:13px;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06);font-weight:700" class="text">${data.voucherNumber}</td></tr>
      ${data.fornecedor ? `<tr><td style="font-size:13px;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06)" class="muted">Fornecedor</td><td style="font-size:13px;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06)" class="text">${data.fornecedor}</td></tr>` : ""}
      ${data.valor ? `<tr><td style="font-size:13px;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06)" class="muted">Valor</td><td style="font-size:13px;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06);font-weight:700" class="text">${data.moeda || "BRL"} ${data.valor}</td></tr>` : ""}
      ${data.vencimento ? `<tr><td style="font-size:13px;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06)" class="muted">Vencimento</td><td style="font-size:13px;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06)" class="text">${data.vencimento}</td></tr>` : ""}
      <tr><td style="font-size:13px;padding:8px 14px" class="muted">Etapa</td><td style="font-size:13px;padding:8px 14px" class="text"><span style="display:inline-block;background:${cfg.titleColor};color:#fff;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:700">${data.toStage}</span></td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:4px 28px 24px" align="left">
    <a href="${voucherLink}" style="display:inline-block;background:${cfg.btnBg};color:${cfg.btnColor};text-decoration:none;font-weight:700;border-radius:999px;padding:12px 28px;font-size:14px">${ctaLabel}</a>
  </td></tr>
  <tr><td style="padding:0 28px 24px" align="left">
    <p style="margin:0;font-size:12px;line-height:1.5" class="muted">Caso tenha dúvidas, entre em contato com o responsável pela sua área.</p>
  </td></tr>
</table>
<div style="height:20px">&nbsp;</div>
<div style="font-size:11px;color:#888;text-align:center" class="muted">© Z3US&#8203;.AI — Esta é uma mensagem automática.</div>
</td></tr></table>
</body></html>`;

  return { subject, html };
}

async function getRecipientEmails(roles: string[]): Promise<string[]> {
  if (!roles.length) return [];

  let client: any;
  try {
    client = await new Client().connect({
      hostname: Deno.env.get("MARIADB_HOST")!,
      port: parseInt(Deno.env.get("MARIADB_PORT") || "3306"),
      username: Deno.env.get("MARIADB_USER")!,
      password: Deno.env.get("MARIADB_PASSWORD")!,
      db: Deno.env.get("MARIADB_DATABASE")!,
    });

    const conditions = roles.map(() => `FIND_IN_SET(?, REPLACE(esteira_role, ' ', ''))`).join(" OR ");
    const users = await client.query(
      `SELECT DISTINCT email FROM ai_agente.t_users_dachser 
       WHERE esteira_active = 1 AND email IS NOT NULL AND email != '' AND (${conditions})`,
      roles
    );

    return (users || []).map((u: any) => u.email).filter(Boolean);
  } catch (err) {
    console.error("Error fetching recipients from MariaDB:", err);
    return [];
  } finally {
    if (client) try { await client.close(); } catch (_) {}
  }
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const data: NotificationRequest = await req.json();
    console.log("Notification request:", JSON.stringify({ type: data.type, toStage: data.toStage, voucherNumber: data.voucherNumber }));

    // OVERRIDE: Enviar todos os emails para larissa@z3us.ai independente do cargo/stage
    const emails = ["larissa@z3us.ai"];

    console.log(`Sending to ${emails.length} recipients: ${emails.join(", ")}`);

    const { subject, html } = getEmailContent(data);

    // Send via Resend
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.log("RESEND_API_KEY not configured, logging email");
      return new Response(
        JSON.stringify({ success: true, message: "Email logged (Resend not configured)", emails, subject, sent: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resend = new Resend(resendApiKey);

    const emailResponse = await resend.emails.send({
      from: "Z3US Esteira <noreply@hermes.z3us.ai>",
      to: emails,
      subject,
      html,
    });

    console.log("Resend response:", JSON.stringify(emailResponse));

    return new Response(
      JSON.stringify({ success: true, sent: emails.length, emails, subject, resendId: emailResponse?.data?.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in send-voucher-notification:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
