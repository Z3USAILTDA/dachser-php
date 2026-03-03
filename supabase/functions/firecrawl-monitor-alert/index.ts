import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALERT_THRESHOLD_MINUTES = 120;
const RECIPIENTS = ["devs@z3us.ai", "rodrigo@z3us.ai", "larissa@z3us.ai"];
const LOGO_URL = "https://finktakbjcfmurqeiubz.supabase.co/storage/v1/object/public/maritime-files/email-assets/logo-z3us.png";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function connectWithRetry(maxRetries = 3): Promise<Client> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const client = await new Client().connect({
        hostname: Deno.env.get("MARIADB_HOST") || "",
        port: parseInt(Deno.env.get("MARIADB_PORT") || "3306"),
        username: Deno.env.get("MARIADB_USER") || "",
        password: Deno.env.get("MARIADB_PASSWORD") || "",
        db: Deno.env.get("MARIADB_DATABASE") || "",
      });
      return client;
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const msg = lastError.message.toLowerCase();
      const isTransient = msg.includes("connection reset") || msg.includes("os error 104") ||
        msg.includes("broken pipe") || msg.includes("timed out");
      if (isTransient && attempt < maxRetries) {
        await sleep(Math.min(1000 * Math.pow(2, attempt - 1), 5000));
      } else { throw lastError; }
    }
  }
  throw lastError || new Error("Failed to connect");
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function generateAlertHtml(minutesSinceUpdate: number, totalRecords: number, recentInserts: number, uniqueAwbs: number): string {
  const dashboardUrl = "https://stellar-route-hub.lovable.app/admin/firecrawl-monitor";
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Alerta Firecrawl - Z3US.AI</title>
</head>
<body style="margin:0;padding:0;background-color:#050608;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#050608" style="background:#050608;">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;">
        <!-- Logo -->
        <tr><td align="center" style="padding-bottom:30px;">
          <img src="${LOGO_URL}" alt="Z3US.AI" width="120" style="display:block;" />
        </td></tr>
        <!-- Alert Banner -->
        <tr><td style="background:linear-gradient(135deg,#7f1d1d,#991b1b);border-radius:12px 12px 0 0;padding:24px;text-align:center;">
          <div style="font-size:14px;color:#fca5a5;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;">⚠️ ALERTA CRÍTICO</div>
          <div style="font-size:22px;color:#ffffff;font-weight:700;">Firecrawl Scraper Parado</div>
          <div style="font-size:14px;color:#fca5a5;margin-top:8px;">Sem dados há <strong style="color:#ffffff;">${formatMinutes(minutesSinceUpdate)}</strong> (threshold: ${formatMinutes(ALERT_THRESHOLD_MINUTES)})</div>
        </td></tr>
        <!-- Stats -->
        <tr><td style="background:#0a0b14;padding:24px;border:1px solid rgba(255,255,255,0.08);border-top:none;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="33%" style="text-align:center;padding:12px;">
                <div style="font-size:11px;color:#888;text-transform:uppercase;">Total Registros</div>
                <div style="font-size:24px;color:#ffffff;font-weight:700;">${totalRecords.toLocaleString('pt-BR')}</div>
              </td>
              <td width="33%" style="text-align:center;padding:12px;">
                <div style="font-size:11px;color:#888;text-transform:uppercase;">Inserções 24h</div>
                <div style="font-size:24px;color:#22c55e;font-weight:700;">+${recentInserts.toLocaleString('pt-BR')}</div>
              </td>
              <td width="33%" style="text-align:center;padding:12px;">
                <div style="font-size:11px;color:#888;text-transform:uppercase;">AWBs Únicas 24h</div>
                <div style="font-size:24px;color:#ffc800;font-weight:700;">${uniqueAwbs.toLocaleString('pt-BR')}</div>
              </td>
            </tr>
          </table>
        </td></tr>
        <!-- CTA -->
        <tr><td style="background:#0a0b14;padding:0 24px 24px;border:1px solid rgba(255,255,255,0.08);border-top:none;border-radius:0 0 12px 12px;text-align:center;">
          <a href="${dashboardUrl}" style="display:inline-block;background:#ffc800;color:#000;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">Abrir Dashboard</a>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:24px;text-align:center;">
          <div style="font-size:11px;color:#666;">Sistema Z3US.AI • Monitoramento Firecrawl</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function generateRecoveryHtml(minutesSinceUpdate: number): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /><title>Recuperação Firecrawl - Z3US.AI</title></head>
<body style="margin:0;padding:0;background-color:#050608;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#050608">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;">
        <tr><td align="center" style="padding-bottom:30px;">
          <img src="${LOGO_URL}" alt="Z3US.AI" width="120" style="display:block;" />
        </td></tr>
        <tr><td style="background:linear-gradient(135deg,#14532d,#166534);border-radius:12px;padding:24px;text-align:center;">
          <div style="font-size:14px;color:#86efac;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;">✅ RECUPERADO</div>
          <div style="font-size:22px;color:#ffffff;font-weight:700;">Firecrawl Scraper Normalizado</div>
          <div style="font-size:14px;color:#86efac;margin-top:8px;">Último dado há <strong style="color:#ffffff;">${formatMinutes(minutesSinceUpdate)}</strong></div>
        </td></tr>
        <tr><td style="padding:24px;text-align:center;">
          <div style="font-size:11px;color:#666;">Sistema Z3US.AI • Monitoramento Firecrawl</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let client: Client | null = null;

  try {
    let body: any = {};
    try { body = await req.json(); } catch {}
    const isTest = body.test === true;
    const isForce = body.force === true;

    client = await connectWithRetry(3);
    const database = Deno.env.get("MARIADB_DATABASE") || "dados_dachser";

    // Get current stats
    const statsRows = await client.query(`
      SELECT 
        MAX(scraped_at) as lastUpdate,
        COUNT(*) as totalRecords,
        SUM(CASE WHEN scraped_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 ELSE 0 END) as recentInserts,
        COUNT(DISTINCT CASE WHEN scraped_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN awb ELSE NULL END) as uniqueAwbs,
        TIMESTAMPDIFF(MINUTE, MAX(scraped_at), NOW()) as minutesSinceUpdate
      FROM ${database}.t_aereo_ws_firecrawl
    `) as any[];

    const row = statsRows[0] || {};
    let minutesSinceUpdate = row.minutesSinceUpdate != null ? Number(row.minutesSinceUpdate) : null;
    if (minutesSinceUpdate === null || isNaN(minutesSinceUpdate) || minutesSinceUpdate < 0) {
      if (row.lastUpdate) {
        const lastDate = new Date(row.lastUpdate);
        minutesSinceUpdate = Math.round((Date.now() - lastDate.getTime()) / 60000);
      } else {
        minutesSinceUpdate = 9999;
      }
    }
    const totalRecords = Number(row.totalRecords || 0);
    const recentInserts = Number(row.recentInserts || 0);
    const uniqueAwbs = Number(row.uniqueAwbs || 0);
    const isCritical = minutesSinceUpdate >= ALERT_THRESHOLD_MINUTES;

    console.log(`[firecrawl-monitor-alert] minutes=${minutesSinceUpdate}, critical=${isCritical}, test=${isTest}, force=${isForce}`);

    // Ensure deduplication table exists
    await client.execute(`
      CREATE TABLE IF NOT EXISTS ai_agente.t_firecrawl_monitor_alerts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        recovered_at DATETIME DEFAULT NULL,
        minutes_since_update INT NOT NULL,
        alert_type VARCHAR(20) NOT NULL DEFAULT 'critical'
      )
    `);

    // Check for open (unrecovered) alert
    const openAlerts = await client.query(`
      SELECT id, sent_at FROM ai_agente.t_firecrawl_monitor_alerts 
      WHERE recovered_at IS NULL 
      ORDER BY sent_at DESC LIMIT 1
    `) as any[];

    const hasOpenAlert = openAlerts.length > 0;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    
    if (!resendApiKey) {
      await client.close();
      return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resend = new Resend(resendApiKey);
    let action = "none";

    if (isTest) {
      // Test mode: always send alert email
      await resend.emails.send({
        from: "Z3US.AI Monitor <noreply@hermes.z3us.ai>",
        to: RECIPIENTS,
        subject: `[TESTE] ⚠️ Firecrawl Parado — sem dados há ${formatMinutes(minutesSinceUpdate)}`,
        html: generateAlertHtml(minutesSinceUpdate, totalRecords, recentInserts, uniqueAwbs),
      });
      action = "test_alert_sent";
    } else if (isCritical && (!hasOpenAlert || isForce)) {
      // Critical and no open alert → send alert + create record
      await resend.emails.send({
        from: "Z3US.AI Monitor <noreply@hermes.z3us.ai>",
        to: RECIPIENTS,
        subject: `⚠️ Firecrawl Parado — sem dados há ${formatMinutes(minutesSinceUpdate)}`,
        html: generateAlertHtml(minutesSinceUpdate, totalRecords, recentInserts, uniqueAwbs),
      });

      await client.execute(`
        INSERT INTO ai_agente.t_firecrawl_monitor_alerts (minutes_since_update, alert_type)
        VALUES (?, 'critical')
      `, [minutesSinceUpdate]);

      action = "alert_sent";
      console.log("[firecrawl-monitor-alert] Alert email sent");
    } else if (!isCritical && hasOpenAlert) {
      // Recovered → send recovery + close alert
      await resend.emails.send({
        from: "Z3US.AI Monitor <noreply@hermes.z3us.ai>",
        to: RECIPIENTS,
        subject: `✅ Firecrawl Recuperado — dados normalizados (${formatMinutes(minutesSinceUpdate)})`,
        html: generateRecoveryHtml(minutesSinceUpdate),
      });

      await client.execute(`
        UPDATE ai_agente.t_firecrawl_monitor_alerts 
        SET recovered_at = NOW() 
        WHERE recovered_at IS NULL
      `);

      action = "recovery_sent";
      console.log("[firecrawl-monitor-alert] Recovery email sent");
    } else {
      action = isCritical ? "already_alerted" : "healthy";
    }

    await client.close();
    client = null;

    return new Response(JSON.stringify({
      minutesSinceUpdate,
      isCritical,
      action,
      threshold: ALERT_THRESHOLD_MINUTES,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("[firecrawl-monitor-alert] Error:", error);
    if (client) { try { await client.close(); } catch {} }
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Alert check failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
