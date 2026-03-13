import { createClient } from "npm:mysql2@3.11.3/promise";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RECIPIENTS = ["devs@z3us.ai", "larissa@z3us.ai"];
const LOGO_URL = "https://finktakbjcfmurqeiubz.supabase.co/storage/v1/object/public/maritime-files/email-assets/logo-z3us.png";
const DASHBOARD_URL = "https://stellar-route-hub.lovable.app/air/tracking";

interface ThresholdRule {
  status: string;
  hours: number;
  label: string;
}

const RULES: ThresholdRule[] = [
  { status: "BKD", hours: 12, label: "Reservado (BKD) → DEP" },
  { status: "RCF", hours: 6, label: "Recebido do voo (RCF) → DEP" },
  { status: "MAN", hours: 3, label: "Manifestado (MAN) → DEP" },
];

interface StuckAWB {
  awb: string;
  hawb: string | null;
  destinatario: string | null;
  origem: string | null;
  destino: string | null;
  ultimo_status: string;
  ultima_atualizacao: string;
  hours_stuck: number;
}

async function getConnection() {
  const conn = await createClient({
    host: Deno.env.get("MARIADB_HOST") || "",
    port: parseInt(Deno.env.get("MARIADB_PORT") || "3306"),
    user: Deno.env.get("MARIADB_USER") || "",
    password: Deno.env.get("MARIADB_PASSWORD") || "",
    database: Deno.env.get("MARIADB_DATABASE") || "dados_dachser",
    connectTimeout: 10000,
  });
  return conn;
}

function formatHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} min`;
  const hours = Math.floor(h);
  const mins = Math.round((h - hours) * 60);
  return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
}

function generateAlertHtml(grouped: Record<string, StuckAWB[]>, totalCount: number): string {
  const statusColors: Record<string, string> = {
    BKD: "#f59e0b",
    RCF: "#ef4444",
    MAN: "#dc2626",
  };

  let sectionsHtml = "";

  for (const rule of RULES) {
    const items = grouped[rule.status];
    if (!items || items.length === 0) continue;

    const rowsHtml = items
      .map(
        (item) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.06);color:#fff;font-size:13px;font-family:monospace;">${item.awb}</td>
        <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.06);color:#ccc;font-size:13px;">${item.destinatario || "—"}</td>
        <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.06);color:#ccc;font-size:13px;">${item.origem || "?"} → ${item.destino || "?"}</td>
        <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.06);color:${statusColors[rule.status] || "#f59e0b"};font-size:13px;font-weight:700;">${formatHours(item.hours_stuck)}</td>
      </tr>`
      )
      .join("");

    sectionsHtml += `
    <tr><td style="padding:16px 24px 8px;">
      <div style="display:inline-block;background:${statusColors[rule.status] || "#f59e0b"};color:#000;padding:4px 12px;border-radius:6px;font-size:12px;font-weight:700;letter-spacing:1px;">
        ${rule.status} — ${items.length} AWB${items.length > 1 ? "s" : ""}
      </div>
      <div style="font-size:11px;color:#888;margin-top:4px;">${rule.label} — threshold: ${rule.hours}h</div>
    </td></tr>
    <tr><td style="padding:0 24px 16px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr style="background:rgba(255,255,255,0.03);">
          <th style="text-align:left;padding:6px 12px;font-size:10px;color:#666;text-transform:uppercase;">AWB</th>
          <th style="text-align:left;padding:6px 12px;font-size:10px;color:#666;text-transform:uppercase;">Cliente</th>
          <th style="text-align:left;padding:6px 12px;font-size:10px;color:#666;text-transform:uppercase;">Rota</th>
          <th style="text-align:left;padding:6px 12px;font-size:10px;color:#666;text-transform:uppercase;">Parado há</th>
        </tr>
        ${rowsHtml}
      </table>
    </td></tr>`;
  }

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background-color:#050608;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#050608">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;">
        <tr><td align="center" style="padding-bottom:30px;">
          <img src="${LOGO_URL}" alt="Z3US.AI" width="120" style="display:block;" />
        </td></tr>
        <tr><td style="background:linear-gradient(135deg,#7f1d1d,#991b1b);border-radius:12px 12px 0 0;padding:24px;text-align:center;">
          <div style="font-size:14px;color:#fca5a5;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;">✈️ ALERTA AÉREO</div>
          <div style="font-size:22px;color:#ffffff;font-weight:700;">AWBs Sem Transição para DEP</div>
          <div style="font-size:14px;color:#fca5a5;margin-top:8px;"><strong style="color:#fff;">${totalCount}</strong> AWB${totalCount > 1 ? "s" : ""} parada${totalCount > 1 ? "s" : ""} além do prazo esperado</div>
        </td></tr>
        <tr><td style="background:#0a0b14;border:1px solid rgba(255,255,255,0.08);border-top:none;">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${sectionsHtml}
          </table>
        </td></tr>
        <tr><td style="background:#0a0b14;padding:16px 24px 24px;border:1px solid rgba(255,255,255,0.08);border-top:none;border-radius:0 0 12px 12px;text-align:center;">
          <a href="${DASHBOARD_URL}" style="display:inline-block;background:#ffc800;color:#000;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">Abrir Monitoramento Aéreo</a>
        </td></tr>
        <tr><td style="padding:24px;text-align:center;">
          <div style="font-size:11px;color:#666;">Sistema Z3US.AI • Monitoramento Aéreo — Transições DEP</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let conn: any = null;

  try {
    let body: any = {};
    try { body = await req.json(); } catch {}
    const isTest = body.test === true;

    conn = await getConnection();
    const database = Deno.env.get("MARIADB_DATABASE") || "dados_dachser";

    // Ensure deduplication table exists
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS ${database}.t_air_dep_transition_alerts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        awb VARCHAR(50) NOT NULL,
        status_when_alerted VARCHAR(10) NOT NULL,
        hours_stuck DECIMAL(6,1) NOT NULL,
        alerted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        resolved BOOLEAN DEFAULT FALSE,
        resolved_at DATETIME DEFAULT NULL,
        INDEX idx_awb_status (awb, status_when_alerted),
        INDEX idx_resolved (resolved)
      )
    `);

    // Query stuck AWBs
    const [rows] = await conn.execute(`
      SELECT 
        awb,
        hawb,
        \`destinatário\` as destinatario,
        origem,
        destino,
        \`último_status\` as ultimo_status,
        \`última atualização\` as ultima_atualizacao,
        TIMESTAMPDIFF(MINUTE, \`última atualização\`, NOW()) / 60.0 as hours_stuck
      FROM ${database}.t_status_aereo
      WHERE (
        (\`último_status\` = 'BKD' AND \`última atualização\` < DATE_SUB(NOW(), INTERVAL 12 HOUR))
        OR (\`último_status\` = 'RCF' AND \`última atualização\` < DATE_SUB(NOW(), INTERVAL 6 HOUR))
        OR (\`último_status\` = 'MAN' AND \`última atualização\` < DATE_SUB(NOW(), INTERVAL 3 HOUR))
      )
    `) as any[];

    const stuckItems: StuckAWB[] = (rows || []).map((r: any) => ({
      awb: r.awb,
      hawb: r.hawb,
      destinatario: r.destinatario,
      origem: r.origem,
      destino: r.destino,
      ultimo_status: r.ultimo_status,
      ultima_atualizacao: r.ultima_atualizacao,
      hours_stuck: parseFloat(r.hours_stuck) || 0,
    }));

    console.log(`[air-dep-transition-alert] Found ${stuckItems.length} stuck AWBs, test=${isTest}`);

    // Resolve alerts for AWBs no longer stuck
    const [openAlerts] = await conn.execute(`
      SELECT id, awb, status_when_alerted FROM ${database}.t_air_dep_transition_alerts
      WHERE resolved = FALSE
    `) as any[];

    const stuckKeys = new Set(stuckItems.map((s) => `${s.awb}|${s.ultimo_status}`));
    const toResolve = (openAlerts || []).filter(
      (a: any) => !stuckKeys.has(`${a.awb}|${a.status_when_alerted}`)
    );

    if (toResolve.length > 0) {
      const ids = toResolve.map((a: any) => a.id);
      await conn.execute(
        `UPDATE ${database}.t_air_dep_transition_alerts SET resolved = TRUE, resolved_at = NOW() WHERE id IN (${ids.map(() => "?").join(",")})`,
        ids
      );
      console.log(`[air-dep-transition-alert] Resolved ${toResolve.length} alerts`);
    }

    // Filter out AWBs that already have open alerts (deduplication)
    const openKeys = new Set(
      (openAlerts || [])
        .filter((a: any) => stuckKeys.has(`${a.awb}|${a.status_when_alerted}`))
        .map((a: any) => `${a.awb}|${a.status_when_alerted}`)
    );

    const newItems = stuckItems.filter(
      (s) => !openKeys.has(`${s.awb}|${s.ultimo_status}`)
    );

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      await conn.end();
      return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resend = new Resend(resendApiKey);
    let action = "none";

    // Determine items to alert on
    const itemsToAlert = isTest ? stuckItems : newItems;

    if (itemsToAlert.length > 0) {
      // Group by status
      const grouped: Record<string, StuckAWB[]> = {};
      for (const item of itemsToAlert) {
        if (!grouped[item.ultimo_status]) grouped[item.ultimo_status] = [];
        grouped[item.ultimo_status].push(item);
      }

      const subject = isTest
        ? `[TESTE] ✈️ ${itemsToAlert.length} AWB${itemsToAlert.length > 1 ? "s" : ""} sem transição DEP`
        : `✈️ ${itemsToAlert.length} AWB${itemsToAlert.length > 1 ? "s" : ""} sem transição DEP`;

      await resend.emails.send({
        from: "Z3US.AI Monitor <noreply@hermes.z3us.ai>",
        to: RECIPIENTS,
        subject,
        html: generateAlertHtml(grouped, itemsToAlert.length),
      });

      // Insert dedup records for new items only
      if (!isTest && newItems.length > 0) {
        const values = newItems.map(() => "(?, ?, ?)").join(", ");
        const params = newItems.flatMap((s) => [s.awb, s.ultimo_status, Math.round(s.hours_stuck * 10) / 10]);
        await conn.execute(
          `INSERT INTO ${database}.t_air_dep_transition_alerts (awb, status_when_alerted, hours_stuck) VALUES ${values}`,
          params
        );
      }

      action = isTest ? "test_alert_sent" : "alert_sent";
      console.log(`[air-dep-transition-alert] ${action}: ${itemsToAlert.length} AWBs`);
    } else {
      action = stuckItems.length > 0 ? "already_alerted" : "healthy";
    }

    await conn.end();
    conn = null;

    return new Response(
      JSON.stringify({
        stuckCount: stuckItems.length,
        newAlerts: newItems.length,
        resolved: toResolve.length,
        action,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("[air-dep-transition-alert] Error:", error);
    if (conn) { try { await conn.end(); } catch {} }
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Alert check failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
