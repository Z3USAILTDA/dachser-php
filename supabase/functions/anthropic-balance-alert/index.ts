import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALERT_THRESHOLD = 5.00; // $5.00
const ALERT_RECIPIENTS = ["davi.santos@br.dachser.com"]; // Email para receber alertas
const TEST_EMAIL = "devs@z3us.ai"; // Email para testes

// Gera o HTML do email no padrão Z3US
const generateAlertEmailHtml = (estimatedBalance: number): string => {
  const logoLight = "https://i.ibb.co/TgXzCqz/logo-preto.png";
  const logoDark = "https://i.ibb.co/sJkY7y5/logo-branco.png";
  const dashboardUrl = "https://dachser.z3us.app/admin/apis";
  const brand = "Z3US";
  const brandPlain = "Z3US&#8203;.AI";
  const consoleUrl = "https://console.anthropic.com";

  return `<!doctype html>
<html lang="pt-br">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>Alerta de Saldo Anthropic</title>
<style>
  .bg{background:#fff}
  .panel{background:#fff;border:1px solid #e8e8e8;border-radius:12px}
  .text{color:#111}.muted{color:#666}
  .btn{display:inline-block;background:#ffa500;color:#111;text-decoration:none;font-weight:700;border-radius:999px;padding:12px 20px}
  .btn-secondary{display:inline-block;background:#8b5cf6;color:#fff;text-decoration:none;font-weight:700;border-radius:999px;padding:12px 20px;margin-left:8px}
  .alert-badge{display:inline-block;background:#fef2f2;color:#dc2626;padding:4px 12px;border-radius:999px;font-weight:600;font-size:12px;border:1px solid #f87171}
  @media (prefers-color-scheme: dark){
    .bg{background:#0b0b0b!important}
    .panel{background:#141414!important;border-color:#262626!important}
    .text{color:#ededed!important}.muted{color:#bdbdbd!important}
    .logo-light{display:none!important}.logo-dark{display:block!important}
    .alert-badge{background:#450a0a!important;color:#f87171!important;border-color:#991b1b!important}
  }
</style>
</head>
<body class="bg" style="margin:0;padding:24px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
    <tr><td align="center">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0" class="panel" style="border-collapse:collapse;max-width:640px">
        <tr><td style="padding:28px 28px 0" align="center">
          <img src="${logoLight}" width="120" alt="${brand}" class="logo-light" style="display:block;margin:0 auto 8px;border:0">
          <img src="${logoDark}" width="120" alt="${brand}" class="logo-dark" style="display:none;margin:0 auto 8px;border:0">
        </td></tr>

        <tr><td style="padding:16px 28px 0" align="center">
          <span class="alert-badge">🚨 ALERTA DE SALDO BAIXO</span>
        </td></tr>

        <tr><td style="padding:16px 28px 0" align="left" class="text">
          <h1 style="margin:8px 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:1.3">
            API Anthropic com saldo crítico
          </h1>
          <p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5" class="muted">
            O saldo da API <strong>Anthropic</strong> está abaixo do limite mínimo de <strong>$${ALERT_THRESHOLD.toFixed(2)}</strong>.
          </p>
        </td></tr>

        <tr><td style="padding:0 28px 16px" align="left">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;background:rgba(239,68,68,0.1);border-radius:8px;border:1px solid rgba(239,68,68,0.3)">
            <tr><td style="padding:16px">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse">
                <tr>
                  <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;padding:6px 0" class="text">
                    <strong>API:</strong> Anthropic (Claude)
                  </td>
                </tr>
                <tr>
                  <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;padding:6px 0" class="text">
                    <strong>Plano:</strong> API Direta
                  </td>
                </tr>
                <tr>
                  <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;padding:6px 0" class="text">
                    <strong>Saldo Estimado:</strong> <span style="color:#dc2626;font-weight:700;font-size:18px">$${estimatedBalance.toFixed(2)}</span>
                  </td>
                </tr>
                <tr>
                  <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;padding:6px 0" class="text">
                    <strong>Limite de Alerta:</strong> $${ALERT_THRESHOLD.toFixed(2)}
                  </td>
                </tr>
              </table>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="padding:0 28px 12px" align="left">
          <p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5" class="muted">
            <strong>Ação Necessária:</strong>
          </p>
          <ul style="margin:0 0 16px;padding-left:20px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.7" class="muted">
            <li>Acesse o Console Anthropic para recarregar</li>
            <li>Verifique o consumo recente no Dashboard</li>
            <li>Evite interrupção nos serviços de IA</li>
          </ul>
        </td></tr>

        <tr><td style="padding:10px 28px 22px" align="left">
          <a href="${consoleUrl}" class="btn-secondary" style="font-family:Arial,Helvetica,sans-serif">Recarregar no Console</a>
          <a href="${dashboardUrl}" class="btn" style="font-family:Arial,Helvetica,sans-serif;margin-left:8px">Ver Dashboard</a>
        </td></tr>

        <tr><td style="padding:0 28px 26px" align="left">
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5" class="muted">
            Este é um alerta automático gerado pelo sistema de monitoramento ${brandPlain}.
          </p>
        </td></tr>
      </table>
      <div style="height:20px;line-height:20px">&nbsp;</div>
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#888;text-align:center" class="muted">
        © ${brand} — Monitoramento de APIs
      </div>
    </td></tr>
  </table>
</body>
</html>`;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let client: Client | null = null;

  try {
    const body = await req.json().catch(() => ({}));
    const forceAlert = body.force === true; // Para testes
    const testMode = body.test === true; // Modo de teste - envia apenas para TEST_EMAIL
    const recipients = testMode ? [TEST_EMAIL] : ALERT_RECIPIENTS;

    // Conectar ao MariaDB
    const host = Deno.env.get("MARIADB_HOST");
    const port = parseInt(Deno.env.get("MARIADB_PORT") || "3306");
    const database = Deno.env.get("MARIADB_DATABASE");
    const dbUser = Deno.env.get("MARIADB_USER");
    const dbPassword = Deno.env.get("MARIADB_PASSWORD");

    if (!host || !database || !dbUser || !dbPassword) {
      throw new Error("Missing database credentials");
    }

    client = await new Client().connect({
      hostname: host,
      port: port,
      db: database,
      username: dbUser,
      password: dbPassword,
      charset: "utf8mb4",
    });

    // Buscar o último ajuste de saldo
    const lastAdjustmentResult = await client.query(`
      SELECT id, credit_date, amount_usd, created_at, consumption_baseline
      FROM ai_agente.t_anthropic_credits
      WHERE is_balance_adjustment = 1
      ORDER BY created_at DESC
      LIMIT 1
    `);
    
    const costPerCall = 0.015;
    let estimatedBalance = 0;

    if (lastAdjustmentResult.length > 0) {
      const lastAdjustment = lastAdjustmentResult[0];
      const adjustmentDate = lastAdjustment.created_at;
      const baseBalance = Number(lastAdjustment.amount_usd);

      // Recargas após o ajuste
      const topupsAfterResult = await client.query(`
        SELECT COALESCE(SUM(amount_usd), 0) as total
        FROM ai_agente.t_anthropic_credits
        WHERE is_balance_adjustment = 0
          AND created_at > ?
      `, [adjustmentDate]);
      const topupsAfter = Number(topupsAfterResult[0]?.total || 0);

      // Consumo desde o ajuste
      const consumptionResult = await client.query(`
        SELECT COUNT(*) as successful_calls
        FROM ai_agente.t_api_usage_logs
        WHERE api_name = 'Anthropic'
          AND created_at > ?
          AND status_code < 400
          AND error_message IS NULL
      `, [adjustmentDate]);
      const consumptionSince = Number(consumptionResult[0]?.successful_calls || 0) * costPerCall;

      estimatedBalance = Math.max(0, baseBalance + topupsAfter - consumptionSince);
    } else {
      // Fallback: soma todas as recargas - consumo total
      const totalCreditsResult = await client.query(`
        SELECT COALESCE(SUM(amount_usd), 0) as total
        FROM ai_agente.t_anthropic_credits
        WHERE is_balance_adjustment = 0 OR is_balance_adjustment IS NULL
      `);
      const totalCredits = Number(totalCreditsResult[0]?.total || 0);

      const consumptionResult = await client.query(`
        SELECT COUNT(*) as successful_calls
        FROM ai_agente.t_api_usage_logs
        WHERE api_name = 'Anthropic'
          AND status_code < 400
          AND error_message IS NULL
      `);
      const totalConsumption = Number(consumptionResult[0]?.successful_calls || 0) * costPerCall;
      estimatedBalance = Math.max(0, totalCredits - totalConsumption);
    }

    console.log(`[anthropic-balance-alert] Estimated balance: $${estimatedBalance.toFixed(2)}, threshold: $${ALERT_THRESHOLD}`);

    // Verificar se precisa enviar alerta
    const shouldAlert = estimatedBalance <= ALERT_THRESHOLD || forceAlert;

    if (!shouldAlert) {
      await client.close();
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Balance is above threshold, no alert needed",
          estimated_balance: estimatedBalance,
          threshold: ALERT_THRESHOLD
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verificar se já enviou alerta recentemente (últimas 24h)
    // Criar tabela de alertas se não existir
    await client.execute(`
      CREATE TABLE IF NOT EXISTS ai_agente.t_anthropic_alerts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        alert_type VARCHAR(50) NOT NULL,
        balance_at_alert DECIMAL(10,2),
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_sent_at (sent_at)
      )
    `);

    const recentAlertResult = await client.query(`
      SELECT id, sent_at FROM ai_agente.t_anthropic_alerts
      WHERE alert_type = 'low_balance'
        AND sent_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
      ORDER BY sent_at DESC
      LIMIT 1
    `);

    if (recentAlertResult.length > 0 && !forceAlert) {
      console.log(`[anthropic-balance-alert] Alert already sent in last 24h, skipping`);
      await client.close();
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Alert already sent in last 24 hours",
          last_alert: recentAlertResult[0].sent_at
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Enviar email de alerta
    console.log(`[anthropic-balance-alert] Sending alert to: ${recipients.join(", ")} (test mode: ${testMode})`);
    const emailResponse = await resend.emails.send({
      from: "Z3US.AI - Alertas <alertas@hermes.z3us.ai>",
      to: recipients,
      subject: `🚨 ALERTA: Saldo Anthropic Baixo - $${estimatedBalance.toFixed(2)}`,
      html: generateAlertEmailHtml(estimatedBalance),
    });

    console.log(`[anthropic-balance-alert] Alert email sent:`, emailResponse);

    // Registrar que o alerta foi enviado (apenas se não for teste)
    if (!testMode) {
      await client.execute(`
        INSERT INTO ai_agente.t_anthropic_alerts (alert_type, balance_at_alert)
        VALUES ('low_balance', ?)
      `, [estimatedBalance]);
    }

    await client.close();

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Alert email sent successfully",
        estimated_balance: estimatedBalance,
        email_response: emailResponse
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[anthropic-balance-alert] Error:", error);
    
    if (client) {
      try { await client.close(); } catch (e) {}
    }

    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});