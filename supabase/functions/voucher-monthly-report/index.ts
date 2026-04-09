import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RECIPIENT = "larissa@z3us.ai";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let client: Client | null = null;

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      throw new Error("Missing RESEND_API_KEY");
    }

    // Connect to MariaDB
    const host = Deno.env.get("MARIADB_HOST");
    const port = parseInt(Deno.env.get("MARIADB_PORT") || "3306");
    const database = Deno.env.get("MARIADB_DATABASE");
    const username = Deno.env.get("MARIADB_USER");
    const password = Deno.env.get("MARIADB_PASSWORD");

    if (!host || !database || !username || !password) {
      throw new Error("MariaDB credentials not configured");
    }

    client = await new Client().connect({
      hostname: host,
      port,
      db: database,
      username,
      password,
    });

    // Calculate previous month range
    const now = new Date();
    const firstDayThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDayLastMonth = new Date(firstDayThisMonth.getTime() - 1);

    const formatDate = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    const monthStart = formatDate(firstDayLastMonth);
    const monthEnd = formatDate(lastDayLastMonth);
    const monthLabel = firstDayLastMonth.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

    console.log(`Generating monthly report for ${monthLabel} (${monthStart} to ${monthEnd})`);

    // 1. Vouchers concluídos no mês anterior
    const concluidos = await client.query(
      `SELECT id, numero_spo, fornecedor, valor, moeda, etapa_atual, vencimento, updated_at
       FROM t_vouchers
       WHERE etapa_atual = 'CONCLUIDO'
         AND updated_at >= ? AND updated_at < ?
       ORDER BY updated_at DESC`,
      [`${monthStart} 00:00:00`, `${formatDate(firstDayThisMonth)} 00:00:00`]
    );

    // 2. Vouchers em andamento (snapshot atual)
    const emAndamento = await client.query(
      `SELECT id, numero_spo, fornecedor, valor, moeda, etapa_atual, vencimento, updated_at
       FROM t_vouchers
       WHERE etapa_atual NOT IN ('CONCLUIDO', 'A_PROCESSAR')
       ORDER BY etapa_atual, updated_at DESC`
    );

    // Build summary by stage
    const stageCount: Record<string, number> = {};
    const stageValue: Record<string, number> = {};

    for (const v of concluidos) {
      stageCount["CONCLUIDO"] = (stageCount["CONCLUIDO"] || 0) + 1;
      stageValue["CONCLUIDO"] = (stageValue["CONCLUIDO"] || 0) + (Number(v.valor) || 0);
    }

    for (const v of emAndamento) {
      const etapa = v.etapa_atual || "DESCONHECIDO";
      stageCount[etapa] = (stageCount[etapa] || 0) + 1;
      stageValue[etapa] = (stageValue[etapa] || 0) + (Number(v.valor) || 0);
    }

    const formatCurrency = (val: number) =>
      val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const formatDateBR = (d: string | Date | null) => {
      if (!d) return "-";
      const date = new Date(d);
      return date.toLocaleDateString("pt-BR");
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

    // Build HTML email
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
        (etapa) => `
      <tr>
        <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;">${etapaLabel[etapa] || etapa}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:center;">${stageCount[etapa]}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right;">BRL ${formatCurrency(stageValue[etapa])}</td>
      </tr>`
      )
      .join("");

    const totalVouchers = concluidos.length + emAndamento.length;

    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:800px;margin:0 auto;padding:24px;">
    <div style="background:#1a1b2e;color:#fff;padding:24px 32px;border-radius:12px 12px 0 0;">
      <h1 style="margin:0;font-size:20px;">📊 Relatório Mensal de Vouchers</h1>
      <p style="margin:8px 0 0;opacity:0.8;font-size:14px;">${monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}</p>
    </div>

    <div style="background:#fff;padding:24px 32px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;">

      <!-- Resumo -->
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
            <td style="padding:8px 12px;font-size:13px;text-align:right;">BRL ${formatCurrency(Object.values(stageValue).reduce((a, b) => a + b, 0))}</td>
          </tr>
        </tfoot>
      </table>

      ${concluidos.length > 0 ? `
      <!-- Concluídos -->
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
      <!-- Em Andamento -->
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
</body>
</html>`;

    // Send via Resend directly
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Dachser Z3US <noreply@z3us.ai>",
        to: [RECIPIENT],
        subject: `Relatório Mensal de Vouchers — ${monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}`,
        html,
      }),
    });

    const emailData = await emailRes.json();
    console.log("Email sent:", JSON.stringify(emailData));

    await client.close();

    return new Response(
      JSON.stringify({
        success: true,
        concluidos: concluidos.length,
        emAndamento: emAndamento.length,
        emailResult: emailData,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Monthly report error:", error);
    if (client) {
      try { await client.close(); } catch (_) {}
    }
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
