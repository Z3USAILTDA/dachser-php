import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Recipients always receiving the FULL monthly report
const FULL_REPORT_EMAILS = [
  "bia.souza@dachser.com",
  "fernanda.ribeiro@dachser.com",
  "larissa@z3us.ai",
];

// Extra fixed recipients per functional segment
const SEGMENT_EXTRA_EMAILS: Record<string, string[]> = {
  FISCAL: ["marta.silva@dachser.com"],
  OPERACAO: ["cleiciane.faconi@dachser.com", "luciana.vulcano@dachser.com"],
  SUPERVISOR: [],
  FINANCEIRO: [],
};

// Roles that map to each segment (for active user lookup)
const SEGMENT_ROLES: Record<string, string[]> = {
  FISCAL: ["FISCAL", "GESTOR_FISCAL"],
  OPERACAO: ["OPERACAO", "GESTOR_OPERACAO"],
  SUPERVISOR: ["SUPERVISOR", "GESTOR_SUPERVISOR"],
  FINANCEIRO: ["FINANCEIRO", "GESTOR_FINANCEIRO"],
};

// Stage filter per segment — vouchers that passed through any of these stages this month
const SEGMENT_STAGE_FILTER: Record<string, string[]> = {
  FISCAL: ["FISCAL", "AJUSTE_FISCAL"],
  OPERACAO: ["OPERACAO", "AJUSTE_OPERACAO"],
  SUPERVISOR: ["SUPERVISOR"],
  FINANCEIRO: ["FINANCEIRO", "ROBO"],
};

const etapaLabel: Record<string, string> = {
  OPERACAO: "Operação",
  AJUSTE_OPERACAO: "Ajuste Operação",
  FISCAL: "Fiscal",
  AJUSTE_FISCAL: "Ajuste Fiscal",
  SUPERVISOR: "Supervisor",
  FINANCEIRO: "Financeiro",
  ROBO: "Robô",
  CONCLUIDO: "Concluído",
};

const formatCurrency = (val: number) =>
  val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDateBR = (d: string | Date | null) => {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("pt-BR");
};

function buildHtml(
  monthLabel: string,
  concluidos: any[],
  emAndamento: any[],
  segmentLabel: string | null,
): string {
  const stageCount: Record<string, number> = {};
  const stageValue: Record<string, number> = {};

  for (const v of concluidos) {
    stageCount["CONCLUIDO"] = (stageCount["CONCLUIDO"] || 0) + 1;
    stageValue["CONCLUIDO"] = (stageValue["CONCLUIDO"] || 0) + (Number(v.valor) || 0);
  }
  for (const v of emAndamento) {
    const e = v.etapa_atual || "DESCONHECIDO";
    stageCount[e] = (stageCount[e] || 0) + 1;
    stageValue[e] = (stageValue[e] || 0) + (Number(v.valor) || 0);
  }

  const buildRow = (v: any) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;">${v.numero_spo || "-"}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;">${v.fornecedor || "-"}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right;">${v.moeda || "BRL"} ${formatCurrency(Number(v.valor) || 0)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;">${etapaLabel[v.etapa_atual] || v.etapa_atual}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;">${formatDateBR(v.vencimento)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;">${formatDateBR(v.updated_at)}</td>
    </tr>`;

  const summaryRows = Object.keys(stageCount)
    .map(
      (e) => `
    <tr>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;">${etapaLabel[e] || e}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:center;">${stageCount[e]}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right;">BRL ${formatCurrency(stageValue[e])}</td>
    </tr>`,
    )
    .join("");

  const totalVouchers = concluidos.length + emAndamento.length;
  const totalValor = Object.values(stageValue).reduce((a, b) => a + b, 0);

  const subtitle = segmentLabel
    ? `Relatório segmentado — ${segmentLabel} — ${monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}`
    : `Relatório completo — ${monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}`;

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:800px;margin:0 auto;padding:24px;">
    <div style="background:#1a1b2e;color:#fff;padding:24px 32px;border-radius:12px 12px 0 0;">
      <h1 style="margin:0;font-size:20px;">📊 Relatório Mensal de Vouchers</h1>
      <p style="margin:8px 0 0;opacity:0.8;font-size:14px;">${subtitle}</p>
    </div>

    <div style="background:#fff;padding:24px 32px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;">
      <h2 style="font-size:16px;margin:0 0 12px;color:#1a1b2e;">Resumo por Etapa</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <thead>
          <tr style="background:#f8f9fa;">
            <th style="padding:8px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#6b7280;">Etapa</th>
            <th style="padding:8px 12px;text-align:center;font-size:12px;text-transform:uppercase;color:#6b7280;">Qtd</th>
            <th style="padding:8px 12px;text-align:right;font-size:12px;text-transform:uppercase;color:#6b7280;">Valor Total</th>
          </tr>
        </thead>
        <tbody>${summaryRows}</tbody>
        <tfoot>
          <tr style="background:#f0f4ff;font-weight:bold;">
            <td style="padding:8px 12px;font-size:13px;">Total</td>
            <td style="padding:8px 12px;font-size:13px;text-align:center;">${totalVouchers}</td>
            <td style="padding:8px 12px;font-size:13px;text-align:right;">BRL ${formatCurrency(totalValor)}</td>
          </tr>
        </tfoot>
      </table>

      ${concluidos.length > 0 ? `
      <h2 style="font-size:16px;margin:24px 0 12px;color:#1a1b2e;">✅ Vouchers Concluídos (${concluidos.length})</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <thead>
          <tr style="background:#f0fdf4;">
            <th style="padding:8px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#6b7280;">Nº SPO</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#6b7280;">Fornecedor</th>
            <th style="padding:8px 12px;text-align:right;font-size:12px;text-transform:uppercase;color:#6b7280;">Valor</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#6b7280;">Etapa</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#6b7280;">Vencimento</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#6b7280;">Conclusão</th>
          </tr>
        </thead>
        <tbody>${concluidos.map(buildRow).join("")}</tbody>
      </table>` : ""}

      ${emAndamento.length > 0 ? `
      <h2 style="font-size:16px;margin:24px 0 12px;color:#1a1b2e;">🔄 Vouchers em Andamento (${emAndamento.length})</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <thead>
          <tr style="background:#fffbeb;">
            <th style="padding:8px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#6b7280;">Nº SPO</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#6b7280;">Fornecedor</th>
            <th style="padding:8px 12px;text-align:right;font-size:12px;text-transform:uppercase;color:#6b7280;">Valor</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#6b7280;">Etapa</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#6b7280;">Vencimento</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#6b7280;">Últ. Atualização</th>
          </tr>
        </thead>
        <tbody>${emAndamento.map(buildRow).join("")}</tbody>
      </table>` : ""}

      <p style="font-size:12px;color:#9ca3af;margin:24px 0 0;text-align:center;">
        Relatório gerado automaticamente em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
      </p>
    </div>
  </div>
</body></html>`;
}

async function sendEmail(
  apiKey: string,
  to: string[],
  subject: string,
  html: string,
): Promise<any> {
  if (to.length === 0) return { skipped: true };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from: "Dachser Z3US <noreply@hermes.z3us.ai>",
      to,
      subject,
      html,
    }),
  });
  return res.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let client: Client | null = null;

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("Missing RESEND_API_KEY");

    const host = Deno.env.get("MARIADB_HOST");
    const port = parseInt(Deno.env.get("MARIADB_PORT") || "3306");
    const database = Deno.env.get("MARIADB_DATABASE");
    const username = Deno.env.get("MARIADB_USER");
    const password = Deno.env.get("MARIADB_PASSWORD");
    if (!host || !database || !username || !password) {
      throw new Error("MariaDB credentials not configured");
    }

    client = await new Client().connect({ hostname: host, port, db: database, username, password });

    const now = new Date();
    const firstDayThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDayLastMonth = new Date(firstDayThisMonth.getTime() - 1);

    const formatDate = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    const monthStart = `${formatDate(firstDayLastMonth)} 00:00:00`;
    const monthEndExclusive = `${formatDate(firstDayThisMonth)} 00:00:00`;
    const monthLabel = firstDayLastMonth.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

    console.log(`Generating monthly report for ${monthLabel}`);

    // FULL data set
    const concluidosFull = await client.query(
      `SELECT id, numero_spo, fornecedor, valor, moeda, etapa_atual, vencimento, updated_at
       FROM t_vouchers
       WHERE etapa_atual = 'CONCLUIDO' AND updated_at >= ? AND updated_at < ?
       ORDER BY updated_at DESC`,
      [monthStart, monthEndExclusive],
    );
    const emAndamentoFull = await client.query(
      `SELECT id, numero_spo, fornecedor, valor, moeda, etapa_atual, vencimento, updated_at
       FROM t_vouchers
       WHERE etapa_atual NOT IN ('CONCLUIDO', 'A_PROCESSAR')
       ORDER BY etapa_atual, updated_at DESC`,
    );

    const sentSummary: Record<string, any> = {};

    // 1) FULL REPORT
    const fullHtml = buildHtml(monthLabel, concluidosFull, emAndamentoFull, null);
    const fullSubject = `Relatório Mensal de Vouchers — ${monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}`;
    sentSummary.full = await sendEmail(RESEND_API_KEY, FULL_REPORT_EMAILS, fullSubject, fullHtml);

    // 2) SEGMENTED REPORTS — fetch IDs that touched each stage in the month from logs
    for (const segment of Object.keys(SEGMENT_ROLES)) {
      const stages = SEGMENT_STAGE_FILTER[segment] || [];
      const placeholders = stages.map(() => "?").join(",");

      // Voucher IDs that had any log in these stages during the month
      // (acao patterns vary; we match etapa_atual on the voucher OR log acao mentioning the stage)
      let voucherIdsRows: any[] = [];
      try {
        voucherIdsRows = await client.query(
          `SELECT DISTINCT v.id
           FROM t_vouchers v
           LEFT JOIN t_voucher_logs l ON l.voucher_id = v.id
           WHERE (
             (v.etapa_atual IN (${placeholders}) AND v.updated_at >= ? AND v.updated_at < ?)
             OR (l.data_hora >= ? AND l.data_hora < ? AND (${stages.map(() => "l.acao LIKE ?").join(" OR ")}))
           )`,
          [
            ...stages,
            monthStart,
            monthEndExclusive,
            monthStart,
            monthEndExclusive,
            ...stages.map((s) => `%${s}%`),
          ],
        );
      } catch (e) {
        console.warn(`Segment ${segment} query failed, falling back to etapa_atual only:`, e);
        voucherIdsRows = await client.query(
          `SELECT DISTINCT id FROM t_vouchers WHERE etapa_atual IN (${placeholders})`,
          stages,
        );
      }

      const ids = voucherIdsRows.map((r: any) => r.id).filter(Boolean);
      const idSet = new Set(ids);

      const concluidosSeg = concluidosFull.filter((v: any) => idSet.has(v.id));
      const emAndamentoSeg = emAndamentoFull.filter((v: any) => idSet.has(v.id));

      // Recipients: active users with matching roles + extras
      const roles = SEGMENT_ROLES[segment];
      const roleConditions = roles.map(() => `FIND_IN_SET(?, REPLACE(esteira_role, ' ', ''))`).join(" OR ");
      let userEmails: string[] = [];
      try {
        const rows = await client.query(
          `SELECT DISTINCT email FROM ai_agente.t_users_dachser
           WHERE esteira_active = 1 AND email IS NOT NULL AND email != '' AND (${roleConditions})`,
          roles,
        );
        userEmails = (rows || []).map((r: any) => r.email).filter(Boolean);
      } catch (e) {
        console.warn(`Failed to fetch users for segment ${segment}:`, e);
      }

      const recipients = [...new Set([...userEmails, ...(SEGMENT_EXTRA_EMAILS[segment] || [])])];
      if (recipients.length === 0) {
        sentSummary[segment] = { skipped: true, reason: "no recipients" };
        continue;
      }

      const segHtml = buildHtml(monthLabel, concluidosSeg, emAndamentoSeg, segment);
      const segSubject = `Relatório Mensal — ${segment} — ${monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}`;
      sentSummary[segment] = await sendEmail(RESEND_API_KEY, recipients, segSubject, segHtml);
      console.log(`Sent ${segment} report to ${recipients.length} recipients`);
    }

    await client.close();

    return new Response(
      JSON.stringify({
        success: true,
        concluidos: concluidosFull.length,
        emAndamento: emAndamentoFull.length,
        sent: sentSummary,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Monthly report error:", error);
    if (client) {
      try { await client.close(); } catch (_) {}
    }
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
