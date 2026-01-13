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
const TEST_EMAIL = "ti@z3us.ai"; // Email verificado no Resend para testes

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
      from: "Dachser Alerts <onboarding@resend.dev>",
      to: recipients,
      subject: `⚠️ ALERTA: Saldo Anthropic Baixo - $${estimatedBalance.toFixed(2)}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .header { text-align: center; margin-bottom: 30px; }
            .alert-badge { display: inline-block; background: #ef4444; color: white; padding: 8px 16px; border-radius: 20px; font-weight: bold; font-size: 14px; }
            .balance { text-align: center; margin: 30px 0; }
            .balance-value { font-size: 48px; font-weight: bold; color: #ef4444; }
            .balance-label { color: #666; font-size: 14px; margin-top: 5px; }
            .message { background: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; }
            .footer { text-align: center; color: #999; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <span class="alert-badge">🚨 ALERTA DE SALDO</span>
              <h1 style="color: #333; margin-top: 20px;">Anthropic API</h1>
            </div>
            
            <div class="balance">
              <div class="balance-value">$${estimatedBalance.toFixed(2)}</div>
              <div class="balance-label">Saldo Estimado Atual</div>
            </div>
            
            <div class="message">
              <strong>⚠️ Atenção:</strong> O saldo da API Anthropic está abaixo de $${ALERT_THRESHOLD.toFixed(2)}. 
              Recomendamos recarregar a conta para evitar interrupções nos serviços.
            </div>
            
            <p style="color: #666; text-align: center;">
              Acesse o <a href="https://console.anthropic.com" style="color: #8b5cf6;">Console Anthropic</a> para recarregar.
            </p>
            
            <div class="footer">
              <p>Este é um email automático do sistema de monitoramento Dachser.</p>
              <p>Data/Hora: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    console.log(`[anthropic-balance-alert] Alert email sent:`, emailResponse);

    // Registrar que o alerta foi enviado
    await client.execute(`
      INSERT INTO ai_agente.t_anthropic_alerts (alert_type, balance_at_alert)
      VALUES ('low_balance', ?)
    `, [estimatedBalance]);

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
