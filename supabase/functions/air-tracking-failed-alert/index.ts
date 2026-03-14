import mysql from "npm:mysql2@3.11.3/promise";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RECIPIENTS = ["devs@z3us.ai", "rodrigo@z3us.ai", "larissa@z3us.ai"];
const LOGO_URL = "https://finktakbjcfmurqeiubz.supabase.co/storage/v1/object/public/maritime-files/email-assets/logo-z3us.png";
const DASHBOARD_URL = "https://stellar-route-hub.lovable.app/air/tracking";

interface FailedAWB {
  awb: string;
  hawb: string | null;
  destinatario: string | null;
  origem: string | null;
  destino: string | null;
  ultimo_status: string | null;
  status_info: string | null;
  ultima_atualizacao: string | null;
  failure_reason: string;
}

async function getConnection() {
  return mysql.createConnection({
    host: Deno.env.get("MARIADB_HOST") || "",
    port: parseInt(Deno.env.get("MARIADB_PORT") || "3306"),
    user: Deno.env.get("MARIADB_USER") || "",
    password: Deno.env.get("MARIADB_PASSWORD") || "",
    database: Deno.env.get("MARIADB_DATABASE") || "dados_dachser",
    connectTimeout: 10000,
  });
}

async function fetchTrackingData(): Promise<any[]> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

  const resp = await fetch(`${supabaseUrl}/functions/v1/fetch-status-aereo`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${anonKey}`,
    },
    body: JSON.stringify({}),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`fetch-status-aereo returned ${resp.status}: ${text}`);
  }

  const data = await resp.json();
  return data?.data || data || [];
}

function classifyFailureReason(item: any): string {
  const status = item['último_status'] || item.ultimo_status || '';
  const statusInfo = item.status_info || '';

  if (status === 'ERRO' || status === 'AWB Invalido') {
    return statusInfo || 'AWB não informado no sistema';
  }
  if (!status) {
    return 'Timeline vazia — nenhum status resolvido em todas as fontes';
  }
  if (statusInfo) {
    return `Status "${status}" — ${statusInfo}`;
  }
  return `Status não resolvido: ${status}`;
}

function formatTimeSince(dateStr: string | null): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  const mins = Math.round((diff % 3600000) / 60000);
  if (hours < 1) return `${mins} min`;
  return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
}

function generateAlertHtml(items: FailedAWB[]): string {
  const rowsHtml = items
    .map(
      (item) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.06);color:#fff;font-size:13px;font-family:monospace;">${item.awb}</td>
      <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.06);color:#ccc;font-size:13px;">${item.destinatario || "—"}</td>
      <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.06);color:#ccc;font-size:13px;">${item.origem || "?"} → ${item.destino || "?"}</td>
      <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.06);color:#ccc;font-size:13px;">${item.ultimo_status || "—"}</td>
      <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.06);color:#ef4444;font-size:13px;font-weight:600;">${item.failure_reason}</td>
      <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.06);color:#f59e0b;font-size:13px;">${formatTimeSince(item.ultima_atualizacao)}</td>
    </tr>`
    )
    .join("");

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background-color:#050608;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#050608">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="700" cellpadding="0" cellspacing="0" style="max-width:700px;">
        <tr><td align="center" style="padding-bottom:30px;">
          <img src="${LOGO_URL}" alt="Z3US.AI" width="120" style="display:block;" />
        </td></tr>
        <tr><td style="background:linear-gradient(135deg,#7f1d1d,#991b1b);border-radius:12px 12px 0 0;padding:24px;text-align:center;">
          <div style="font-size:14px;color:#fca5a5;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;">✈️ ALERTA DE RASTREIO</div>
          <div style="font-size:22px;color:#ffffff;font-weight:700;">AWBs com Falha no Rastreio</div>
          <div style="font-size:14px;color:#fca5a5;margin-top:8px;"><strong style="color:#fff;">${items.length}</strong> AWB${items.length > 1 ? "s" : ""} com falha detectada${items.length > 1 ? "s" : ""}</div>
        </td></tr>
        <tr><td style="background:#0a0b14;border:1px solid rgba(255,255,255,0.08);border-top:none;padding:16px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr style="background:rgba(255,255,255,0.03);">
              <th style="text-align:left;padding:6px 12px;font-size:10px;color:#666;text-transform:uppercase;">AWB</th>
              <th style="text-align:left;padding:6px 12px;font-size:10px;color:#666;text-transform:uppercase;">Cliente</th>
              <th style="text-align:left;padding:6px 12px;font-size:10px;color:#666;text-transform:uppercase;">Rota</th>
              <th style="text-align:left;padding:6px 12px;font-size:10px;color:#666;text-transform:uppercase;">Último Status</th>
              <th style="text-align:left;padding:6px 12px;font-size:10px;color:#666;text-transform:uppercase;">Motivo da Falha</th>
              <th style="text-align:left;padding:6px 12px;font-size:10px;color:#666;text-transform:uppercase;">Parado há</th>
            </tr>
            ${rowsHtml}
          </table>
        </td></tr>
        <tr><td style="background:#0a0b14;padding:16px 24px 24px;border:1px solid rgba(255,255,255,0.08);border-top:none;border-radius:0 0 12px 12px;text-align:center;">
          <a href="${DASHBOARD_URL}" style="display:inline-block;background:#ffc800;color:#000;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">Abrir Monitoramento Aéreo</a>
        </td></tr>
        <tr><td style="padding:24px;text-align:center;">
          <div style="font-size:11px;color:#666;">Sistema Z3US.AI • Monitoramento Aéreo — Falhas de Rastreio</div>
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

    // 1. Fetch current tracking data
    console.log("[air-tracking-failed-alert] Fetching tracking data...");
    const allItems = await fetchTrackingData();

    // 2. Filter tracking_failed items
    const failedItems: FailedAWB[] = allItems
      .filter((item: any) => item.tracking_failed === true)
      .map((item: any) => ({
        awb: item.awb || "?",
        hawb: item.hawb || null,
        destinatario: item['destinatário'] || item.destinatario || null,
        origem: item.origem || null,
        destino: item.destino || null,
        ultimo_status: item['último_status'] || item.ultimo_status || null,
        status_info: item.status_info || null,
        ultima_atualizacao: item['última atualização'] || item.ultima_atualizacao || null,
        failure_reason: classifyFailureReason(item),
      }));

    console.log(`[air-tracking-failed-alert] Found ${failedItems.length} failed AWBs, test=${isTest}`);

    if (failedItems.length === 0 && !isTest) {
      return new Response(
        JSON.stringify({ failedCount: 0, newAlerts: 0, resolved: 0, action: "healthy" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Connect to MariaDB for deduplication
    conn = await getConnection();
    const database = Deno.env.get("MARIADB_DATABASE") || "dados_dachser";

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS ${database}.t_air_tracking_failed_alerts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        awb VARCHAR(50) NOT NULL,
        failure_reason VARCHAR(255) NOT NULL,
        alerted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        resolved BOOLEAN DEFAULT FALSE,
        resolved_at DATETIME DEFAULT NULL,
        INDEX idx_awb (awb),
        INDEX idx_resolved (resolved)
      )
    `);

    // 4. Resolve alerts for AWBs no longer failed
    const [openAlerts] = await conn.execute(`
      SELECT id, awb FROM ${database}.t_air_tracking_failed_alerts
      WHERE resolved = FALSE
    `) as any[];

    const failedAwbSet = new Set(failedItems.map((f) => f.awb));
    const toResolve = (openAlerts || []).filter((a: any) => !failedAwbSet.has(a.awb));

    if (toResolve.length > 0) {
      const ids = toResolve.map((a: any) => a.id);
      await conn.execute(
        `UPDATE ${database}.t_air_tracking_failed_alerts SET resolved = TRUE, resolved_at = NOW() WHERE id IN (${ids.map(() => "?").join(",")})`,
        ids
      );
      console.log(`[air-tracking-failed-alert] Resolved ${toResolve.length} alerts`);
    }

    // 5. Filter out already-alerted AWBs
    const openAwbs = new Set(
      (openAlerts || [])
        .filter((a: any) => failedAwbSet.has(a.awb))
        .map((a: any) => a.awb)
    );

    const newItems = failedItems.filter((f) => !openAwbs.has(f.awb));

    // 6. Send email
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
    const itemsToAlert = isTest ? failedItems : newItems;

    if (itemsToAlert.length > 0) {
      const subject = isTest
        ? `[TESTE] ✈️ ${itemsToAlert.length} AWB${itemsToAlert.length > 1 ? "s" : ""} com falha no rastreio`
        : `✈️ ${itemsToAlert.length} AWB${itemsToAlert.length > 1 ? "s" : ""} com falha no rastreio`;

      await resend.emails.send({
        from: "Z3US.AI Monitor <noreply@hermes.z3us.ai>",
        to: RECIPIENTS,
        subject,
        html: generateAlertHtml(itemsToAlert),
      });

      // Insert dedup records for new items only
      if (!isTest && newItems.length > 0) {
        const values = newItems.map(() => "(?, ?)").join(", ");
        const params = newItems.flatMap((f) => [f.awb, f.failure_reason.substring(0, 255)]);
        await conn.execute(
          `INSERT INTO ${database}.t_air_tracking_failed_alerts (awb, failure_reason) VALUES ${values}`,
          params
        );
      }

      action = isTest ? "test_alert_sent" : "alert_sent";
      console.log(`[air-tracking-failed-alert] ${action}: ${itemsToAlert.length} AWBs`);
    } else {
      action = failedItems.length > 0 ? "already_alerted" : "healthy";
    }

    await conn.end();
    conn = null;

    return new Response(
      JSON.stringify({
        failedCount: failedItems.length,
        newAlerts: newItems.length,
        resolved: toResolve.length,
        action,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("[air-tracking-failed-alert] Error:", error);
    if (conn) { try { await conn.end(); } catch {} }
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Alert check failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
