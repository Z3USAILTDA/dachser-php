import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
  type: "AJUSTE_SOLICITADO" | "URGENCIA_SOLICITADA" | "URGENCIA_SOLICITADA_CONFIRMACAO" | "URGENCIA_APROVADA" | "URGENCIA_REJEITADA";
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
  cnpj?: string;
  filial?: string;
  centroCusto?: string;
  formaPagamento?: string;
  motivoUrgencia?: string;
  anexos?: Array<{ tipo: string; file_name: string; file_url: string }>;
}

function formatVencimentoBR(value: string | Date | undefined | null): string {
  if (!value) return "";
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch {
    return String(value);
  }
}

function getEmailContent(data: NotificationRequest) {
  const baseUrl = "https://dachser.z3us.ai";
  const voucherLink = `${baseUrl}`;
  const logoLight = "https://i.ibb.co/TgXzCqz/logo-preto.png";
  const logoDark = "https://i.ibb.co/sJkY7y5/logo-branco.png";

  const cfgMap: Record<
    string,
    { title: string; titleColor: string; btnBg: string; btnColor: string; subject: string }
  > = {
    URGENCIA_SOLICITADA: {
      title: "Solicitação de Urgência",
      titleColor: "#F5B843",
      btnBg: "#F5B843",
      btnColor: "#111",
      subject: "Solicitação de Urgência",
    },
    AJUSTE_SOLICITADO: {
      title: "Ajuste Solicitado",
      titleColor: "#F97316",
      btnBg: "#F97316",
      btnColor: "#fff",
      subject: "Ajuste Solicitado",
    },
    URGENCIA_REJEITADA: {
      title: "Urgência Rejeitada",
      titleColor: "#DC2626",
      btnBg: "#DC2626",
      btnColor: "#fff",
      subject: "Urgência Rejeitada",
    },
    URGENCIA_APROVADA: {
      title: "Urgência Aprovada pelo Supervisor",
      titleColor: "#22C55E",
      btnBg: "#22C55E",
      btnColor: "#fff",
      subject: "Urgência Aprovada",
    },
    URGENCIA_SOLICITADA_CONFIRMACAO: {
      title: "Solicitação de Urgência Enviada",
      titleColor: "#22C55E",
      btnBg: "#22C55E",
      btnColor: "#fff",
      subject: "Solicitação de Urgência Enviada",
    },
  };

  const cfg = cfgMap[data.type] || cfgMap.URGENCIA_SOLICITADA;
  const ctaLabel = data.type === "URGENCIA_SOLICITADA" ? "Analisar Voucher" : "Ver Voucher";

  let contentBlock = "";
  switch (data.type) {
    case "URGENCIA_SOLICITADA":
      contentBlock = `
        <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#666">Foi solicitada <b>urgência manual</b> para o voucher <b>${data.voucherNumber}</b>${data.senderName ? ` por <b>${data.senderName}</b>` : ""}. Por favor, avalie e aprove ou rejeite usando os botões abaixo.</p>`;
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
    case "URGENCIA_APROVADA":
      contentBlock = `
        <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#666">A solicitação de urgência para o voucher <b>${data.voucherNumber}</b> foi <span style="color:#22C55E;font-weight:700">aprovada</span> pelo Supervisor e enviada ao Financeiro.</p>
        ${data.senderName ? `<p style="margin:0 0 8px;font-size:13px;color:#666">Aprovado por: <b>${data.senderName}</b></p>` : ""}`;
      break;
    case "URGENCIA_SOLICITADA_CONFIRMACAO":
      contentBlock = `
        <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#666">Sua solicitação de urgência para o voucher <b>${data.voucherNumber}</b> foi enviada ao supervisor responsável.</p>
        <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#666">Você será notificado por e-mail assim que houver aprovação ou rejeição. Não é necessária nenhuma ação adicional de sua parte.</p>`;
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
      ${data.cnpj ? `<tr><td style="font-size:13px;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06)" class="muted">CNPJ</td><td style="font-size:13px;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06)" class="text">${data.cnpj}</td></tr>` : ""}
      ${data.valor ? `<tr><td style="font-size:13px;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06)" class="muted">Valor</td><td style="font-size:13px;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06);font-weight:700" class="text">${data.moeda || "BRL"} ${data.valor}</td></tr>` : ""}
      ${data.vencimento ? `<tr><td style="font-size:13px;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06)" class="muted">Vencimento</td><td style="font-size:13px;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06)" class="text">${formatVencimentoBR(data.vencimento)}</td></tr>` : ""}
      ${data.filial ? `<tr><td style="font-size:13px;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06)" class="muted">Filial</td><td style="font-size:13px;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06)" class="text">${data.filial}</td></tr>` : ""}
      ${data.centroCusto ? `<tr><td style="font-size:13px;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06)" class="muted">Centro de Custo</td><td style="font-size:13px;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06)" class="text">${data.centroCusto}</td></tr>` : ""}
      ${data.formaPagamento ? `<tr><td style="font-size:13px;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06)" class="muted">Forma Pgto</td><td style="font-size:13px;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06)" class="text">${data.formaPagamento}</td></tr>` : ""}
      ${data.motivoUrgencia ? `<tr><td style="font-size:13px;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06)" class="muted">Motivo Urgencia</td><td style="font-size:13px;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06);color:#DC2626;font-weight:600" class="text">${data.motivoUrgencia}</td></tr>` : ""}
      <tr><td style="font-size:13px;padding:8px 14px" class="muted">Etapa</td><td style="font-size:13px;padding:8px 14px" class="text"><span style="display:inline-block;background:${cfg.titleColor};color:#fff;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:700">${data.toStage}</span></td></tr>
    </table>
  </td></tr>
  ${
    data.anexos && data.anexos.length > 0
      ? `
  <tr><td style="padding:0 28px 16px" align="left">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;border:1px solid rgba(0,0,0,.08);border-radius:8px;overflow:hidden">
      <tr style="background:rgba(0,0,0,.03)"><td style="font-size:12px;font-weight:700;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06)" class="muted" colspan="2">DOCUMENTOS ANEXADOS</td></tr>
      ${data.anexos
        .map(
          (a: any, i: number) => `
      <tr><td style="font-size:13px;padding:8px 14px;${i < data.anexos!.length - 1 ? "border-bottom:1px solid rgba(0,0,0,.06);" : ""}" colspan="2">
        <a href="${a.file_url}" target="_blank" style="color:#F5B843;text-decoration:none;font-weight:600">${a.file_name}</a>
        <span style="font-size:11px;color:#999;margin-left:8px">${a.tipo || ""}</span>
      </td></tr>`,
        )
        .join("")}
    </table>
  </td></tr>`
      : ""
  }
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
      hostname: Deno.env.get("MARIADB_FIN_HOST")!,
      port: parseInt(Deno.env.get("MARIADB_FIN_PORT") || "3306"),
      username: Deno.env.get("MARIADB_FIN_USER")!,
      password: Deno.env.get("MARIADB_FIN_PASSWORD")!,
      db: Deno.env.get("MARIADB_FIN_DATABASE")!,
    });

    const conditions = roles.map(() => `FIND_IN_SET(?, REPLACE(esteira_role, ' ', ''))`).join(" OR ");
    const users = await client.query(
      `SELECT DISTINCT email FROM ai_agente.t_users_dachser 
       WHERE esteira_active = 1 AND email IS NOT NULL AND email != '' AND (${conditions})`,
      roles,
    );

    return (users || []).map((u: any) => u.email).filter(Boolean);
  } catch (err) {
    console.error("Error fetching recipients from MariaDB:", err);
    return [];
  } finally {
    if (client)
      try {
        await client.close();
      } catch (_) {}
  }
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

async function getVoucherResponsaveis(voucherId: string): Promise<{
  creator_email: string | null;
  creator_username: string | null;
  fiscal_email: string | null;
  supervisor_resp_email: string | null;
  financeiro_email: string | null;
  creator_supervisor_email: string | null;
} | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/mariadb-proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ action: "get_voucher_responsaveis_emails", voucher_id: voucherId }),
    });
    const data = await res.json();
    if (data.success) return data;
  } catch (e) {
    console.error("Error fetching voucher responsaveis:", e);
  }
  return null;
}

async function generateSupervisorTokens(
  voucherId: string,
): Promise<{ approveToken: string; rejectToken: string } | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/mariadb-proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ action: "create_supervisor_token", voucher_id: voucherId }),
    });
    const data = await res.json();
    if (data.success) {
      return { approveToken: data.approveToken, rejectToken: data.rejectToken };
    }
    console.error("Failed to generate supervisor tokens:", data.error);
    return null;
  } catch (e) {
    console.error("Error generating supervisor tokens:", e);
    return null;
  }
}

function injectSupervisorButtons(html: string, approveToken: string, rejectToken: string): string {
  const approveUrl = `https://dachser.z3us.ai/supervisor-approve.php?token=${approveToken}`;
  const rejectUrl = `https://dachser.z3us.ai/supervisor-reject.php?token=${rejectToken}`;

  const buttonsHtml = `
  <tr><td style="padding:0 28px 8px" align="left">
    <div style="background:rgba(245,184,67,.08);border:1px solid rgba(245,184,67,.25);border-radius:10px;padding:16px 20px;margin-bottom:8px">
      <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>
        <td style="padding-right:12px">
          <a href="${approveUrl}" style="display:inline-block;background:#22C55E;color:#fff;text-decoration:none;font-weight:700;border-radius:999px;padding:12px 28px;font-size:14px">✓ Aprovar</a>
        </td>
        <td>
          <a href="${rejectUrl}" style="display:inline-block;background:#DC2626;color:#fff;text-decoration:none;font-weight:700;border-radius:999px;padding:12px 28px;font-size:14px">✗ Rejeitar</a>
        </td>
      </tr></table>
      <p style="margin:8px 0 0;font-size:11px;color:#999">Links válidos por 48 horas. Uso único.</p>
    </div>
  </td></tr>`;

  // Insert buttons before the CTA button row
  return html.replace(
    '<tr><td style="padding:4px 28px 24px" align="left">',
    buttonsHtml + '\n  <tr><td style="padding:4px 28px 24px" align="left">',
  );
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let data: NotificationRequest = await req.json();
    console.log(
      "Notification request:",
      JSON.stringify({ type: data.type, toStage: data.toStage, voucherNumber: data.voucherNumber }),
    );

    // If sending URGENCIA_SOLICITADA, enrich with voucher details (anexos, CNPJ, etc.)
    if (data.type === "URGENCIA_SOLICITADA" && data.voucherId) {
      try {
        const voucherRes = await fetch(`${SUPABASE_URL}/functions/v1/mariadb-proxy`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            apikey: SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ action: "get_voucher_by_id", voucher_id: data.voucherId }),
        });
        const voucherData = await voucherRes.json();
        if (voucherData.success) {
          const v = voucherData.data || voucherData;
          data = {
            ...data,
            cnpj: data.cnpj || v.cnpj || v.cnpj_fornecedor,
            filial: data.filial || v.filial,
            centroCusto: data.centroCusto || v.centro_custo,
            formaPagamento: data.formaPagamento || v.forma_pagamento,
            motivoUrgencia: data.motivoUrgencia || v.urgencia_motivo,
            fornecedor: data.fornecedor || v.fornecedor,
            valor: data.valor || v.valor?.toString(),
            moeda: data.moeda || v.moeda,
            vencimento: data.vencimento || v.data_vencimento,
          };
          const rawAnexos = v.anexos || voucherData.anexos || voucherData.data?.anexos;
          if (rawAnexos && Array.isArray(rawAnexos)) {
            data.anexos = rawAnexos
              .map((a: any) => ({
                tipo: a.tipo || a.type || "",
                file_name: a.file_name || a.nome || a.name || "Documento",
                file_url: a.file_url || a.url || "",
              }))
              .filter((a: any) => a.file_url);
          }
        }
      } catch (e) {
        console.error("Error fetching voucher details:", e);
      }
    }

    // Resolve recipients dynamically based on type/stage.
    let toEmails: string[] = [];
    let ccEmails: string[] = [];

    const responsaveis = data.voucherId ? await getVoucherResponsaveis(data.voucherId) : null;

    if (data.type === "URGENCIA_SOLICITADA") {
      // TO: supervisor direto do solicitante. Solicitante NÃO entra em CC
      // (recebe e-mail informativo separado via URGENCIA_SOLICITADA_CONFIRMACAO),
      // garantindo que apenas o supervisor possua os tokens de Aprovar/Rejeitar.
      if (responsaveis?.creator_supervisor_email) {
        toEmails = [responsaveis.creator_supervisor_email];
      } else {
        // Fallback: todos os SUPERVISOR / GESTOR_SUPERVISOR ativos
        toEmails = await getRecipientEmails(STAGE_TO_ROLES["SUPERVISOR"] || []);
      }
    } else if (data.type === "URGENCIA_SOLICITADA_CONFIRMACAO") {
      // E-mail informativo para o solicitante. Sem CC, sem botões.
      if (responsaveis?.creator_email) toEmails = [responsaveis.creator_email];
    } else if (data.type === "URGENCIA_APROVADA" || data.type === "URGENCIA_REJEITADA") {
      // Resposta automática ao solicitante (TO) com supervisor em CC
      if (responsaveis?.creator_email) toEmails = [responsaveis.creator_email];
      if (responsaveis?.creator_supervisor_email) ccEmails = [responsaveis.creator_supervisor_email];
      if (toEmails.length === 0 && ccEmails.length > 0) {
        toEmails = ccEmails;
        ccEmails = [];
      }
    } else if (data.type === "AJUSTE_SOLICITADO") {
      if (data.toStage === "AJUSTE_OPERACAO") {
        if (responsaveis?.creator_email) {
          toEmails = [responsaveis.creator_email];
        } else {
          toEmails = OPERACAO_FIXED_EMAILS;
        }
      } else if (data.toStage === "AJUSTE_FISCAL") {
        if (responsaveis?.fiscal_email) {
          toEmails = [responsaveis.fiscal_email];
        } else {
          // NUNCA fazer broadcast pra toda a área Fiscal. Ajuste é direcionado ao
          // indivíduo que processou o voucher. Se nem o caminho primário
          // (responsavel_fiscal_user_id) nem o fallback de log (em mariadb-proxy)
          // resolveram um destinatário, abortar silenciosamente.
          console.warn(
            `[AJUSTE_SOLICITADO/AJUSTE_FISCAL] Nenhum destinatário fiscal específico para voucher ${data.voucherId}. Abortando envio (sem broadcast).`
          );
          return new Response(
            JSON.stringify({ success: true, sent: 0, reason: "no_specific_fiscal_recipient" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }
    }

    // Deduplicate and remove cc entries already present in to
    toEmails = [...new Set(toEmails.filter(Boolean))];
    ccEmails = [...new Set(ccEmails.filter((e) => e && !toEmails.includes(e)))];

    if (toEmails.length === 0) {
      console.log("No recipients resolved — skipping send");
      return new Response(
        JSON.stringify({ success: true, message: "No recipients", sent: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const emails = toEmails;

    console.log(`Sending to ${toEmails.length} recipients (cc=${ccEmails.length}): to=${toEmails.join(", ")} cc=${ccEmails.join(", ")}`);

    let { subject, html } = getEmailContent(data);

    // For URGENCIA_SOLICITADA, generate tokens and inject approve/reject buttons for the supervisor
    if (data.type === "URGENCIA_SOLICITADA") {
      const tokens = await generateSupervisorTokens(data.voucherId);
      if (tokens) {
        html = injectSupervisorButtons(html, tokens.approveToken, tokens.rejectToken);
        console.log("Supervisor action buttons injected into email");
      }
    }

    // Send via Resend
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.log("RESEND_API_KEY not configured, logging email");
      return new Response(
        JSON.stringify({ success: true, message: "Email logged (Resend not configured)", emails, subject, sent: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const resend = new Resend(resendApiKey);

    // Download attachments if available
    const attachments: Array<{ filename: string; content: string }> = [];
    if (data.anexos && data.anexos.length > 0) {
      for (const anexo of data.anexos) {
        try {
          const fileRes = await fetch(anexo.file_url);
          if (fileRes.ok) {
            const buffer = await fileRes.arrayBuffer();
            const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
            attachments.push({ filename: anexo.file_name, content: base64 });
            console.log(`Attached file: ${anexo.file_name}`);
          } else {
            console.warn(`Failed to download attachment ${anexo.file_name}: ${fileRes.status}`);
          }
        } catch (e) {
          console.warn(`Error downloading attachment ${anexo.file_name}:`, e);
        }
      }
    }

    const emailPayload: any = {
      from: "Z3US Esteira <noreply@hermes.z3us.ai>",
      to: emails,
      subject,
      html,
    };
    if (ccEmails.length > 0) {
      emailPayload.cc = ccEmails;
    }
    // Reply-To: solicitante on URGENCIA_SOLICITADA so supervisor can reply directly
    if (data.type === "URGENCIA_SOLICITADA" && responsaveis?.creator_email) {
      emailPayload.reply_to = responsaveis.creator_email;
    }
    if (attachments.length > 0) {
      emailPayload.attachments = attachments;
    }

    const emailResponse = await resend.emails.send(emailPayload);

    console.log("Resend response:", JSON.stringify(emailResponse));

    return new Response(
      JSON.stringify({ success: true, sent: emails.length, emails, subject, resendId: emailResponse?.data?.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("Error in send-voucher-notification:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

serve(handler);
